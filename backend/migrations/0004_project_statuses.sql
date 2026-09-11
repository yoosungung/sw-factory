-- Project-scoped kanban columns (M10)
CREATE TABLE project_statuses (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('backlog', 'active', 'done')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, key)
);

CREATE INDEX idx_project_statuses_order ON project_statuses(project_id, sort_order);

INSERT INTO project_statuses (project_id, key, label, category, sort_order)
SELECT id, 'backlog', 'Backlog', 'backlog', 0 FROM projects;
INSERT INTO project_statuses (project_id, key, label, category, sort_order)
SELECT id, 'in_progress', 'In Progress', 'active', 1 FROM projects;
INSERT INTO project_statuses (project_id, key, label, category, sort_order)
SELECT id, 'review', 'Review', 'active', 2 FROM projects;
INSERT INTO project_statuses (project_id, key, label, category, sort_order)
SELECT id, 'deploying_test', 'Deploying Test', 'active', 3 FROM projects;
INSERT INTO project_statuses (project_id, key, label, category, sort_order)
SELECT id, 'qa', 'QA', 'active', 4 FROM projects;
INSERT INTO project_statuses (project_id, key, label, category, sort_order)
SELECT id, 'deploying_prod', 'Deploying Prod', 'active', 5 FROM projects;
INSERT INTO project_statuses (project_id, key, label, category, sort_order)
SELECT id, 'done', 'Done', 'done', 6 FROM projects;
INSERT INTO project_statuses (project_id, key, label, category, sort_order)
SELECT id, 'blocked', 'Blocked', 'active', 7 FROM projects;
INSERT INTO project_statuses (project_id, key, label, category, sort_order)
SELECT id, 'waiting_for_approval', 'Waiting for Approval', 'active', 8 FROM projects;

UPDATE tickets SET status = 'backlog' WHERE status = 'todo';
