-- comments.updated_at for silent status-board upsert (PATCH, no agent_event_log)
ALTER TABLE comments ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
UPDATE comments SET updated_at = created_at WHERE updated_at = '';
