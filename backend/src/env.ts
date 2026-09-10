export type Env = {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  SESSION_SECRET: string;
};

export type User = {
  id: string;
  email: string;
  name: string;
  created_at: string;
};

export type MemberRole = "owner" | "member";

export type TicketStatus = "backlog" | "todo" | "in_progress" | "done";
export type TicketType = "task" | "milestone";
export type TicketPriority = "low" | "medium" | "high" | "urgent";

export const TICKET_STATUSES: TicketStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "done",
];

export const TICKET_PRIORITIES: TicketPriority[] = [
  "low",
  "medium",
  "high",
  "urgent",
];

export type AppVariables = {
  user: User;
};
