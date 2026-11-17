-- Expand project_members.lane allowlist with 'mm' (SQLite cannot ALTER CHECK).
CREATE TABLE project_members__lane_mm (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  lane TEXT CHECK (lane IS NULL OR lane IN ('pm', 'ta', 'qa', 'aa', 'km', 'developer', 'mm')),
  PRIMARY KEY (project_id, user_id)
);

INSERT INTO project_members__lane_mm (project_id, user_id, role, lane)
SELECT project_id, user_id, role, lane FROM project_members;

DROP TABLE project_members;
ALTER TABLE project_members__lane_mm RENAME TO project_members;

CREATE INDEX idx_project_members_user ON project_members(user_id);
