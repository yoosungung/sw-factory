/** Shared IPC types between parent pool and SDK workers. */

import type { RunControl } from "./run-policy.js";

export type { RunBudget, RunControl, RunPolicy } from "./run-policy.js";

export type WorkerJobType = "create" | "prompt" | "delete";

export interface WorkerJobBase {
  requestId: string;
  model: string;
  workspace: string;
  control?: RunControl;
}

export interface CreateJob extends WorkerJobBase {
  type: "create";
  prompt: string;
  ticketId?: number;
  event?: string;
}

export interface PromptJob extends WorkerJobBase {
  type: "prompt";
  agentId: string;
  prompt: string;
  ticketId?: number;
  event?: string;
}

export interface DeleteJob extends WorkerJobBase {
  type: "delete";
  agentId: string;
}

export type WorkerJob = CreateJob | PromptJob | DeleteJob;

export interface WorkerAccepted {
  requestId: string;
  phase: "accepted";
  agentId: string;
  runId: string;
}

export interface WorkerDone {
  requestId: string;
  phase: "done";
  agentId: string;
  runId: string;
  status: string;
  durationMs?: number;
  usage?: unknown;
  error?: string;
  resultPreview?: string;
}

export interface WorkerDeleteDone {
  requestId: string;
  phase: "deleted";
  agentId: string;
}

export interface WorkerFailed {
  requestId: string;
  phase: "failed";
  error: string;
  code?: "not_found" | "active_run" | "auth" | "unknown";
}

export type WorkerMessage =
  | WorkerAccepted
  | WorkerDone
  | WorkerDeleteDone
  | WorkerFailed
  | { phase: "ready" };
