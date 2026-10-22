-- Idea → plan → approval.
--
-- A plan is the PRD for one project, versioned: every generation, refinement
-- and hand edit is a new row, so "what did the AI change" is always a diff
-- between two rows rather than a guess.

CREATE TABLE IF NOT EXISTS plans (
  id           TEXT PRIMARY KEY,
  org          TEXT NOT NULL,
  project_id   TEXT NOT NULL,
  version      INTEGER NOT NULL,
  -- draft | approved | superseded
  status       TEXT NOT NULL DEFAULT 'draft',
  -- generated | refined | edited
  source       TEXT NOT NULL,
  prd          TEXT NOT NULL,
  -- What produced it: the idea, or the refinement instruction. Kept for the
  -- history view, never replayed.
  prompt       TEXT,
  model        TEXT,
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  approved_at  TEXT,
  approved_by  TEXT,
  -- Where approval landed in the repository: a commit on the default branch,
  -- or a pull request when the branch is protected.
  commit_sha   TEXT,
  pr_url       TEXT,
  UNIQUE (project_id, version),
  FOREIGN KEY (project_id) REFERENCES projects (id)
);

CREATE INDEX IF NOT EXISTS idx_plans_project ON plans (project_id, version DESC);

-- Plan generation runs on our API key, so it is metered per org and month
-- against the plan's allowance.
CREATE TABLE IF NOT EXISTS ai_usage (
  org            TEXT NOT NULL,
  -- YYYY-MM, UTC
  month          TEXT NOT NULL,
  generations    INTEGER NOT NULL DEFAULT 0,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (org, month)
);
