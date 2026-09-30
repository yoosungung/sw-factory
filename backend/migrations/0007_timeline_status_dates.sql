-- Backfill empty timeline dates (UTC calendar date). Status history first, then created_at / done updated_at / today.

UPDATE tickets
SET date_from = (
  SELECT substr(ta.at, 1, 10)
  FROM ticket_activities ta
  INNER JOIN project_statuses ps
    ON ps.project_id = tickets.project_id
    AND ps.key = ta.new_val
    AND ps.category = 'backlog'
  WHERE ta.ticket_id = tickets.id AND ta.field = 'status'
  ORDER BY ta.at ASC, ta.id ASC
  LIMIT 1
)
WHERE date_from IS NULL;

UPDATE tickets
SET date_from = substr(created_at, 1, 10)
WHERE date_from IS NULL;

UPDATE tickets
SET date_to = (
  SELECT substr(ta.at, 1, 10)
  FROM ticket_activities ta
  INNER JOIN project_statuses ps
    ON ps.project_id = tickets.project_id
    AND ps.key = ta.new_val
    AND ps.category = 'done'
  WHERE ta.ticket_id = tickets.id AND ta.field = 'status'
  ORDER BY ta.at ASC, ta.id ASC
  LIMIT 1
)
WHERE date_to IS NULL;

UPDATE tickets
SET date_to = substr(updated_at, 1, 10)
WHERE date_to IS NULL
  AND EXISTS (
    SELECT 1 FROM project_statuses ps
    WHERE ps.project_id = tickets.project_id
      AND ps.key = tickets.status
      AND ps.category = 'done'
  );

UPDATE tickets
SET date_to = substr(datetime('now'), 1, 10)
WHERE date_to IS NULL;
