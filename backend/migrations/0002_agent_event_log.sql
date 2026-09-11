CREATE TABLE agent_event_log (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  ticket_id TEXT,
  project_id TEXT,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  assignee_user_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_agent_event_log_at ON agent_event_log(at);
