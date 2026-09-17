import type { LoadedSchedule } from "../../shared/load-config";

export type AgentEventType =
  | "ticket_created"
  | "ticket_updated"
  | "ticket_deleted"
  | "comment_added";

export type AgentEvent = {
  id: string;
  at: string;
  event_type: AgentEventType | string;
  ticket_id: string | null;
  project_id: string | null;
  actor_user_id: string;
  assignee_user_id: string | null;
  payload: Record<string, unknown>;
};

export type PersonaType = "sessions" | "human";

export type PersonaConfig = {
  name: string;
  user_id: string;
  email: string;
  persona: string;
  type: PersonaType;
};

export type PromptTemplates = {
  ticket_created: string;
  ticket_updated: string;
  comment_added: string;
  assignee_changed: string;
  mention: string;
  handoff: string;
  catch_up: string;
  ticket_deleted?: string;
};

export type GatewayConfig = {
  factoryBaseUrl: string;
  cursorBaseUrl: string;
  dataDir: string;
  sessionCookie: string;
  agents: PersonaConfig[];
  prompts: PromptTemplates;
  debounceMs: number;
  pollLimit: number;
  retryMaxAttempts: number;
  schedules?: LoadedSchedule[];
  successChecks?: string[];
};

export type Checkpoint = {
  acked_id: string | null;
  read_cursor: string | null;
  last_catch_up_at: string | null;
};

export type StickyMap = Record<string, string>; // `${ticket_id}:${persona}` -> agent_id

export type RetryItem = {
  ticket_id: string;
  persona: string;
  prompt: string;
  event: AgentEvent;
  attempts: number;
  updated_at: string;
};
