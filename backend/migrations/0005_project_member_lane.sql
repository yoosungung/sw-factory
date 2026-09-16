-- project_members.lane: assignment lane for PM kickoff (orthogonal to access role)
ALTER TABLE project_members ADD COLUMN lane TEXT
  CHECK (lane IS NULL OR lane IN ('pm', 'ta', 'qa', 'aa', 'km', 'developer'));
