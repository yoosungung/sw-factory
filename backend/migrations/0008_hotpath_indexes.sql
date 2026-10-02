-- Hot-path indexes: session GC, timeline, list cursor, agent event tail
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_tickets_project_date_from ON tickets(project_id, date_from);
CREATE INDEX IF NOT EXISTS idx_tickets_project_created ON tickets(project_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_agent_event_log_at_id ON agent_event_log(at, id);
