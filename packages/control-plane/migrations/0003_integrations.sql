-- Integrations and projects.
--
-- Three levels, because a single provider connection covers many repositories:
--
--   org  ──▶  integration (a GitHub App installation)  ──▶  project (one repo)
--
-- Collapsing integration and project would mean one connection per repository,
-- which is not how GitHub App installations work and would make adding a second
-- repo a whole new OAuth dance.

-- A connected provider account. `provider` is a column rather than an assumption
-- so GitLab or Bitbucket need a new row type, not a new table.
CREATE TABLE IF NOT EXISTS integrations (
  id              TEXT PRIMARY KEY,
  org             TEXT NOT NULL,
  provider        TEXT NOT NULL DEFAULT 'github',
  -- GitHub App installation id. Unique per provider: an installation belongs to
  -- exactly one account, and re-installing replaces rather than duplicates.
  external_id     TEXT NOT NULL,
  -- The org or user the installation is on, for display.
  account_login   TEXT,
  account_type    TEXT,
  created_at      TEXT NOT NULL,
  -- Set when the App is uninstalled. Kept rather than deleted so projects can
  -- explain *why* they went inactive instead of vanishing.
  revoked_at      TEXT,
  UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_integrations_org ON integrations (org);

-- The previous `projects` table was created by 0001 and never read or written.
-- Nothing can be lost by replacing it.
DROP TABLE IF EXISTS projects;

CREATE TABLE projects (
  id              TEXT PRIMARY KEY,
  org             TEXT NOT NULL,
  integration_id  TEXT NOT NULL,
  -- <owner>__<repo>: the dashboard's identifier, the runner's directory name and
  -- the job payload, all the same string. One identifier, no mapping table.
  slug            TEXT NOT NULL,
  -- The provider's own stable id. A repo can be renamed; this cannot.
  external_id     TEXT NOT NULL,
  default_branch  TEXT NOT NULL DEFAULT 'main',
  -- active   the integration is live and the repo is still accessible
  -- inactive the App was uninstalled, or the repo was deselected
  status          TEXT NOT NULL DEFAULT 'active',
  config          TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL,
  UNIQUE (org, slug),
  FOREIGN KEY (integration_id) REFERENCES integrations (id)
);

CREATE INDEX IF NOT EXISTS idx_projects_org ON projects (org, status);
CREATE INDEX IF NOT EXISTS idx_projects_integration ON projects (integration_id);
