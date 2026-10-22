-- The subjects of a run's commits, as a JSON array. They carry the PRD task
-- names, so the daily digest can say what was built rather than count commits.
ALTER TABLE runs ADD COLUMN commit_subjects TEXT;
