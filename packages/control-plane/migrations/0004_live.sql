-- Wiring the runner to the control plane for real.
--
-- Most of this existed on one side only: the dashboard could not open a run,
-- org-level defaults had nowhere to live, a job could not be aimed at a
-- specific machine, and `last_seen_at` was declared but never written.

-- A run belongs to an org directly, instead of only through its runner, so a
-- run stays readable even after the runner that produced it is revoked.
ALTER TABLE runs ADD COLUMN org TEXT;
ALTER TABLE runs ADD COLUMN job_id TEXT;
-- open | merged | closed, kept current by the pull_request webhook.
ALTER TABLE runs ADD COLUMN pr_state TEXT;
-- Which agent backend and model filled each role, as JSON, for the run view.
ALTER TABLE runs ADD COLUMN agents TEXT;

UPDATE runs SET org = (SELECT org FROM runners WHERE runners.id = runs.runner_id)
WHERE org IS NULL;

CREATE INDEX IF NOT EXISTS idx_runs_org ON runs (org, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_job ON runs (job_id);

-- Null means any runner in the org may claim the job.
ALTER TABLE jobs ADD COLUMN runner_id TEXT;

-- The conventions tag the runner resolved, next to the CLI version, so "why is
-- this runner building differently" can be answered from the dashboard.
ALTER TABLE runners ADD COLUMN conventions_ref TEXT;

-- Org-wide defaults. Layering, lowest to highest:
--   CLI defaults < the runner's local config.json < org < runner < project
CREATE TABLE IF NOT EXISTS org_settings (
  org         TEXT PRIMARY KEY,
  config      TEXT NOT NULL DEFAULT '{}',
  updated_at  TEXT NOT NULL,
  updated_by  TEXT
);
