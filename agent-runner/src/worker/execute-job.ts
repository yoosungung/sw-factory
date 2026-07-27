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
import {
  composeRetryPrompt,
  createToolEvidence,
  evaluateSuccess,
  maxVerifyAttempts,
  verificationEnabled,
} from "../success-verify.js";

export interface WorkerSdk {
  create(options: AgentOptions): Promise<SDKAgent>;
  resume(agentId: string, options?: Partial<AgentOptions>): Promise<SDKAgent>;
  delete(agentId: string, options?: Partial<AgentOptions>): Promise<void>;
}

export type AcceptedHandler = (msg: WorkerAccepted) => void;

/**
 * Execute one SDK job in-process (used by worker main and unit tests).
 * Calls onAccepted after send() succeeds, then waits for run completion.
 */
export async function executeJob(
  job: WorkerJob,
  sdk: WorkerSdk,
  onAccepted?: AcceptedHandler,
): Promise<WorkerDone | { phase: "deleted"; requestId: string; agentId: string }> {
  if (job.type === "delete") {
    await sdk.delete(job.agentId, {
      apiKey: process.env.CURSOR_API_KEY,
      local: { cwd: job.workspace },
    });
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

    if (verify) {
      if (!run.supports("stream")) {
        logRunEvent({
          event: "success_check.skipped",
          agent_id: agent.agentId,
          run_id: finalRunId,
          ...(ticketId !== undefined ? { ticket_id: ticketId } : {}),
          reason: "stream_unsupported",
        });
        return toDone(job.requestId, agent.agentId, finalRunId, result);
      }

      const maxAttempts = maxVerifyAttempts(control);
      let verdict = evaluateSuccess(
        result.status,
        evidence?.lastCompleted(),
        ticketId,
        checks,
      );
      let attempt = 0;

      while (!verdict.ok && attempt < maxAttempts) {
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
        verdict = evaluateSuccess(
          result.status,
          retryEvidence.lastCompleted(),
          ticketId,
          checks,
        );
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
        );
      }
    }

    return toDone(job.requestId, agent.agentId, finalRunId, result);
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
