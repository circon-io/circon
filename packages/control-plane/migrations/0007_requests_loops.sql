-- Agent requests for credentials, and what each run's gate exercised.

-- The feedback loops (gate tiers) a run actually ran, as a JSON array, so the
-- dashboard can show which loops a project has and whether they pass.
ALTER TABLE runs ADD COLUMN gate_tiers TEXT;

-- An agent mid-run needs an API key it does not have (a payment provider, a
-- maps service). It asks, by name and with a reason; a human supplies the value
-- in the dashboard, where it becomes a project secret, and the running loop
-- picks it up at its next iteration.
CREATE TABLE IF NOT EXISTS secret_requests (
  id           TEXT PRIMARY KEY,
  org          TEXT NOT NULL,
  project_id   TEXT NOT NULL,
  name         TEXT NOT NULL,
  reason       TEXT NOT NULL,
  run_id       TEXT,
  -- pending | fulfilled | dismissed
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TEXT NOT NULL,
  resolved_at  TEXT,
  resolved_by  TEXT,
  FOREIGN KEY (project_id) REFERENCES projects (id)
);

-- One open request per credential per project, however often the agent asks.
CREATE UNIQUE INDEX IF NOT EXISTS idx_secret_requests_open
  ON secret_requests (project_id, name) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_secret_requests_org ON secret_requests (org, status, created_at DESC);
