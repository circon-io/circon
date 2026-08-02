-- Control plane schema.
--
-- Runner credentials are stored only as SHA-256 hashes with a server-side
-- pepper, so a database dump does not yield working tokens. Enrollment tokens
-- are single-use and expire, so a leaked invite is bounded in time.

CREATE TABLE IF NOT EXISTS runners (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  org           TEXT NOT NULL,
  -- SHA-256 of pepper + raw token. The raw token is shown once, at enrollment.
  token_hash    TEXT NOT NULL UNIQUE,
  platform      TEXT,
  cli_version   TEXT,
  -- JSON: gate tiers this runner can serve, models it should use, budgets.
  config        TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT,
  revoked_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_runners_org ON runners (org);
CREATE INDEX IF NOT EXISTS idx_runners_token ON runners (token_hash);

-- One-time invitations. Consumed on first use; never reusable.
CREATE TABLE IF NOT EXISTS enroll_tokens (
  token_hash  TEXT PRIMARY KEY,
  org         TEXT NOT NULL,
  name_hint   TEXT,
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  runner_id   TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  org         TEXT NOT NULL,
  -- <organization>__<repository>, which is also the runner's directory name.
  slug        TEXT NOT NULL,
  remote      TEXT,
  config      TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL,
  UNIQUE (org, slug)
);

-- History. Cost lives here so a fleet's spend is answerable in one query.
CREATE TABLE IF NOT EXISTS runs (
  id            TEXT PRIMARY KEY,
  runner_id     TEXT NOT NULL,
  project_slug  TEXT NOT NULL,
  branch        TEXT,
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  -- running | complete | stopped | budget | failed
  outcome       TEXT,
  iterations    INTEGER NOT NULL DEFAULT 0,
  commits       INTEGER NOT NULL DEFAULT 0,
  cost_usd      REAL NOT NULL DEFAULT 0,
  pr_url        TEXT,
  failed_tier   TEXT,
  FOREIGN KEY (runner_id) REFERENCES runners (id)
);

CREATE INDEX IF NOT EXISTS idx_runs_runner ON runs (runner_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs (started_at DESC);

-- Queued work. A runner claims the oldest pending job for its org.
CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,
  org           TEXT NOT NULL,
  project_slug  TEXT NOT NULL,
  -- pending | claimed | done | cancelled
  status        TEXT NOT NULL DEFAULT 'pending',
  max_loops     INTEGER NOT NULL DEFAULT 20,
  requested_by  TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  claimed_at    TEXT,
  claimed_by    TEXT,
  finished_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_queue ON jobs (org, status, created_at);
