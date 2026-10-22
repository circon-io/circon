-- Releases and secrets.

-- Screenshots a run captured for review, as URLs into its branch. The release
-- report shows them without anyone opening a diff.
ALTER TABLE runs ADD COLUMN screenshots TEXT;

-- Gate 2: someone approved putting what was merged in front of users. One row
-- per approval, so the report can say what changed since the last one.
CREATE TABLE IF NOT EXISTS releases (
  id           TEXT PRIMARY KEY,
  org          TEXT NOT NULL,
  project_id   TEXT NOT NULL,
  pr_number    INTEGER NOT NULL,
  pr_url       TEXT NOT NULL,
  title        TEXT,
  merged_sha   TEXT,
  approved_by  TEXT NOT NULL,
  approved_at  TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects (id)
);

CREATE INDEX IF NOT EXISTS idx_releases_project ON releases (project_id, approved_at DESC);

-- Credentials, envelope-encrypted (AES-GCM, key in the SECRETS_MASTER_KEY
-- Worker secret). Write-only from the dashboard: values are never returned to a
-- browser, only to a runner, and only for the job it was dispatched.
--
--   machine  every runner in the org, e.g. ANTHROPIC_API_KEY
--   project  one project's jobs only, e.g. its Cloudflare token
CREATE TABLE IF NOT EXISTS secrets (
  id          TEXT PRIMARY KEY,
  org         TEXT NOT NULL,
  scope       TEXT NOT NULL,
  -- Empty for machine scope, so the uniqueness below holds for both.
  project_id  TEXT NOT NULL DEFAULT '',
  name        TEXT NOT NULL,
  ciphertext  TEXT NOT NULL,
  iv          TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT NOT NULL,
  UNIQUE (org, scope, project_id, name)
);
