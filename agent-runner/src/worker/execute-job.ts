import { randomUUID } from "node:crypto";

import type {
  AgentOptions,
  Run,
  RunResult as SDKRunResult,
  SDKAgent,
  SettingSource,
} from "@cursor/sdk";

import type {
  CreateJob,
  PromptJob,
  WorkerAccepted,
  WorkerDone,
  WorkerFailed,
  WorkerJob,
} from "../job-types.js";
import { logRunEvent, streamRunLogs } from "../run-logger.js";
import { composeAgentPrompt } from "../run-policy.js";
import { isStaleAuthFailure } from "../stale-auth.js";
import { createLeantimeWriteAttestation } from "../leantime-attest.js";
import {
  composeRetryPrompt,
  confirmWriteViaApi,
  createToolEvidence,
  evaluateSuccess,
  isInfraFailure,
  maxVerifyAttempts,
  verificationEnabled,
  type WriteAttestation,
} from "../success-verify.js";

export interface WorkerRunSummary {
  id: string;
  status?: string;
  currentStatus?: string;
}

export interface WorkerSdk {
  create(options: AgentOptions): Promise<SDKAgent>;
  resume(agentId: string, options?: Partial<AgentOptions>): Promise<SDKAgent>;
  delete(agentId: string, options?: Partial<AgentOptions>): Promise<void>;
  /** Optional: cancel non-terminal runs before delete (zombie unlock). */
  listRuns?(
    agentId: string,
    options?: { apiKey?: string; cwd?: string; runtime?: "local" },
  ): Promise<{ items: WorkerRunSummary[] }>;
  cancelRun?(
    runId: string,
    options?: { apiKey?: string; cwd?: string; runtime?: "local" },
  ): Promise<void>;
}

const TERMINAL_RUN_STATUSES = new Set([
  "finished",
  "cancelled",
  "canceled",
  "error",
  "expired",
]);

const ACTIVE_RUN_DELETE_RE =
  /active run (run-[a-f0-9-]+) is not terminal/i;

function deleteOptions(
  apiKey: string | undefined,
  workspace: string,
): Partial<AgentOptions> & { apiKey?: string; cwd?: string } {
  return {
    apiKey,
    cwd: workspace,
    local: { cwd: workspace },
  };
}

async function cancelListedNonTerminalRuns(
  sdk: WorkerSdk,
  agentId: string,
  apiKey: string | undefined,
  workspace: string,
): Promise<void> {
  if (!sdk.listRuns || !sdk.cancelRun) {
    return;
  }
  let items: WorkerRunSummary[] = [];
  try {
    const listed = await sdk.listRuns(agentId, {
      apiKey,
      cwd: workspace,
      runtime: "local",
    });
    items = listed.items ?? [];
  } catch {
    return;
  }
  for (const run of items) {
    const status = String(run.currentStatus ?? run.status ?? "");
    if (TERMINAL_RUN_STATUSES.has(status)) {
      continue;
    }
    try {
      await sdk.cancelRun(run.id, {
        apiKey,
        cwd: workspace,
        runtime: "local",
      });
    } catch {
      // best-effort; delete retry / error-parse path may still unlock
    }
  }
}

async function deleteAgentForce(
  sdk: WorkerSdk,
  agentId: string,
  workspace: string,
): Promise<void> {
  const apiKey = process.env.CURSOR_API_KEY;
  const opts = deleteOptions(apiKey, workspace);
  await cancelListedNonTerminalRuns(sdk, agentId, apiKey, workspace);
  try {
    await sdk.delete(agentId, opts);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(ACTIVE_RUN_DELETE_RE);
    if (!match?.[1] || !sdk.cancelRun) {
      throw error;
    }
    try {
      await sdk.cancelRun(match[1], {
        apiKey,
        cwd: workspace,
        runtime: "local",
      });
    } catch {
      throw error;
    }
    await sdk.delete(agentId, opts);
  }
}

export type AcceptedHandler = (msg: WorkerAccepted) => void;

export interface ExecuteJobOptions {
  writeAttestation?: WriteAttestation | null;
}

/**
 * Execute one SDK job in-process (used by worker main and unit tests).
 * Calls onAccepted after send() succeeds, then waits for run completion.
 */
export async function executeJob(
  job: WorkerJob,
  sdk: WorkerSdk,
  onAccepted?: AcceptedHandler,
  options?: ExecuteJobOptions,
): Promise<WorkerDone | { phase: "deleted"; requestId: string; agentId: string }> {
  if (job.type === "delete") {
    await deleteAgentForce(sdk, job.agentId, job.workspace);
    return {
      phase: "deleted",
      requestId: job.requestId,
      agentId: job.agentId,
    };
  }

  let agent: SDKAgent | undefined;
  try {
    agent = await obtainAgent(job, sdk);
    const prompt = composeAgentPrompt(job.prompt, job.control);
    let run: Run;
    try {
      run = await agent.send(prompt, { model: { id: job.model } });
    } catch (error) {
      throw toWorkerError(job.requestId, error);
    }

    const runId = run.requestId ?? run.id ?? randomUUID();
    const accepted: WorkerAccepted = {
      requestId: job.requestId,
      phase: "accepted",
      agentId: agent.agentId,
      runId,
    };
    onAccepted?.(accepted);

    const control = job.control;
    const verify = verificationEnabled(control);
    const ticketId = job.ticketId;
    const checks = control?.success_checks ?? [];
    const attester =
      options?.writeAttestation === null
        ? undefined
        : (options?.writeAttestation ?? createLeantimeWriteAttestation());

    const evidence = verify ? createToolEvidence() : undefined;
    let result = await streamRunLogs(
      run,
      {
        agentId: agent.agentId,
        runId,
        ticketId,
        event: job.event,
        control,
      },
      evidence?.observe,
    );
    let finalRunId = runId;
    let mcpStickyReset = false;

    if (verify) {
      if (!run.supports("stream")) {
        logRunEvent({
          event: "success_check.skipped",
          agent_id: agent.agentId,
          run_id: finalRunId,
          ...(ticketId !== undefined ? { ticket_id: ticketId } : {}),
          reason: "stream_unsupported",
        });
        return toDone(job.requestId, agent.agentId, finalRunId, result, undefined, ticketId);
      }

      const maxAttempts = maxVerifyAttempts(control);
      let tools = evidence?.allCompleted() ?? [];
      let verdict = evaluateSuccess(
        result.status,
        evidence?.lastCompleted(),
        ticketId,
        checks,
      );
      if (!verdict.ok) {
        const attested = await confirmWriteViaApi(ticketId, attester);
        if (attested !== null) {
          verdict = attested;
        }
      }
      let attempt = 0;
      let lastReason = verdict.ok ? "" : verdict.reason;

      while (!verdict.ok && attempt < maxAttempts) {
        if (isInfraFailure(verdict.reason, tools)) {
          mcpStickyReset = true;
          logRunEvent(
            {
              event: "success_check.infra_abort",
              agent_id: agent.agentId,
              run_id: finalRunId,
              ...(ticketId !== undefined ? { ticket_id: ticketId } : {}),
              attempt,
              reason: verdict.reason,
            },
            "error",
          );
          break;
        }

        attempt += 1;
        logRunEvent({
          event: "success_check.retry",
          agent_id: agent.agentId,
          run_id: finalRunId,
          ...(ticketId !== undefined ? { ticket_id: ticketId } : {}),
          attempt,
          reason: verdict.reason,
        });

        const retryEvidence = createToolEvidence();
        let retryRun: Run;
        try {
          retryRun = await agent.send(composeRetryPrompt(checks, verdict.reason), {
            model: { id: job.model },
          });
        } catch (error) {
          throw toWorkerError(job.requestId, error);
        }
        finalRunId = retryRun.requestId ?? retryRun.id ?? finalRunId;
        result = await streamRunLogs(
          retryRun,
          {
            agentId: agent.agentId,
            runId: finalRunId,
            ticketId,
            event: job.event,
            control,
            attempt,
          },
          retryEvidence.observe,
        );
        tools = retryEvidence.allCompleted();
        verdict = evaluateSuccess(
          result.status,
          retryEvidence.lastCompleted(),
          ticketId,
          checks,
        );
        if (!verdict.ok) {
          const attested = await confirmWriteViaApi(ticketId, attester);
          if (attested !== null) {
            verdict = attested;
          }
        }
        if (!verdict.ok && verdict.reason === lastReason) {
          logRunEvent(
            {
              event: "success_check.same_reason_stop",
              agent_id: agent.agentId,
              run_id: finalRunId,
              ...(ticketId !== undefined ? { ticket_id: ticketId } : {}),
              attempt,
              reason: verdict.reason,
            },
            "error",
          );
          if (isInfraFailure(verdict.reason, tools)) {
            mcpStickyReset = true;
          }
          break;
        }
        lastReason = verdict.reason;
        if (!verdict.ok && isInfraFailure(verdict.reason, tools)) {
          mcpStickyReset = true;
          logRunEvent(
            {
              event: "success_check.infra_abort",
              agent_id: agent.agentId,
              run_id: finalRunId,
              ...(ticketId !== undefined ? { ticket_id: ticketId } : {}),
              attempt,
              reason: verdict.reason,
            },
            "error",
          );
          break;
        }
      }

      logRunEvent(
        {
          event: "success_check.evaluated",
          agent_id: agent.agentId,
          run_id: finalRunId,
          ...(ticketId !== undefined ? { ticket_id: ticketId } : {}),
          ok: verdict.ok,
          attempts: attempt,
          reason: verdict.reason,
        },
        verdict.ok ? "info" : "error",
      );

      if (!verdict.ok) {
        return toDone(
          job.requestId,
          agent.agentId,
          finalRunId,
          result,
          "verification_failed",
          ticketId,
          mcpStickyReset,
        );
      }
    }

    return toDone(job.requestId, agent.agentId, finalRunId, result, undefined, ticketId, mcpStickyReset);
  } finally {
    if (agent) {
      try {
        agent.close();
      } catch {
        // ignore
      }
    }
  }
}

function localAgentOptions(workspace: string): AgentOptions["local"] {
  // MCP/skills live under $HOME/.cursor; must be re-applied on resume
  // (inline mcpServers / settingSources are not persisted across Agent.resume).
  const settingSources: SettingSource[] = ["user", "project"];
  return {
    cwd: workspace,
    settingSources,
  };
}

async function obtainAgent(
  job: CreateJob | PromptJob,
  sdk: WorkerSdk,
): Promise<SDKAgent> {
  const options: AgentOptions = {
    apiKey: process.env.CURSOR_API_KEY,
    model: { id: job.model },
    local: localAgentOptions(job.workspace),
  };

  if (job.type === "create") {
    return sdk.create(options);
  }

  try {
    return await sdk.resume(job.agentId, options);
  } catch (error) {
    const failed = toWorkerError(job.requestId, error);
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("not found")
    ) {
      failed.code = "not_found";
    }
    throw failed;
  }
}

function toDone(
  requestId: string,
  agentId: string,
  runId: string,
  result: SDKRunResult,
  statusOverride?: string,
  ticketId?: number,
  mcpStickyReset?: boolean,
): WorkerDone {
  const errorMessage =
    result.error?.message ??
    (typeof result.error === "string" ? result.error : undefined);
  return {
    requestId,
    phase: "done",
    agentId,
    runId,
    status: statusOverride ?? result.status,
    durationMs: result.durationMs,
    usage: result.usage,
    error: errorMessage,
    resultPreview:
      typeof result.result === "string" ? result.result.slice(0, 500) : undefined,
    ...(ticketId !== undefined ? { ticketId } : {}),
    ...(mcpStickyReset ? { mcpStickyReset: true } : {}),
  };
}

export function toWorkerError(
  requestId: string,
  error: unknown,
): WorkerFailed {
  const message = error instanceof Error ? error.message : String(error);
  let code: WorkerFailed["code"] = "unknown";
  if (isStaleAuthFailure(error)) {
    code = "auth";
  } else if (message.includes("already has active run")) {
    code = "active_run";
  } else if (message.toLowerCase().includes("not found")) {
    code = "not_found";
  }
  return {
    requestId,
    phase: "failed",
    error: message,
    code,
  };
}
