-- Finish-to-Start ticket dependencies (1급 SoR; ≠ milestone_id parent/child)
CREATE TABLE ticket_dependencies (
  successor_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  blocker_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (successor_id, blocker_id),
  CHECK (successor_id != blocker_id)
);

CREATE INDEX idx_ticket_dependencies_blocker ON ticket_dependencies(blocker_id);
CREATE INDEX idx_ticket_dependencies_successor ON ticket_dependencies(successor_id);
