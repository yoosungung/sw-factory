export type RunnerSettings = {
  dataDir: string; // PVC root, usually /data
  poolSize: number;
  maxActivePerPersona: number;
  maxQueuePerPersona: number;
  activeRunSkipLimit: number;
  createThrottleMs: number;
};

export type PromptJob = {
  agentId: string;
  persona: string;
  ticketId: string | null;
  prompt: string;
  event?: unknown;
};

export type SdkBackend = {
  create(opts: { persona: string; cwd: string; prompt: string }): Promise<{ agentId: string }>;
  send(opts: {
    agentId: string;
    prompt: string;
    cwd: string;
  }): Promise<{ runId: string }>;
  cancel?(agentId: string): Promise<void>;
  close?(agentId: string): Promise<void>;
};

export type SessionRecord = {
  agentId: string;
  persona: string;
  ticketId: string | null;
  cwd: string;
  activeRun: boolean;
  skipCount: number;
  createdAt: string;
};

export type CreateSessionBody = {
  prompt: string;
  ticket_id?: string | null;
  persona: string;
  event?: unknown;
};

export type PromptBody = {
  prompt: string;
  ticket_id?: string | null;
  event?: unknown;
};
