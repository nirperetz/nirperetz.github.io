-- Projects: one row per slug. Listing columns mirror the live version's manifest.
CREATE TABLE projects (
  slug          TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL,
  tags          TEXT NOT NULL DEFAULT '[]',   -- JSON array
  year          INTEGER,
  visibility    TEXT NOT NULL CHECK (visibility IN ('listed', 'unlisted', 'draft')),
  thumbnail     TEXT,
  manifest      TEXT NOT NULL,                -- JSON, runtime manifest of live_version
  live_version  TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Versions: immutable uploads. Files live in R2 under lab/<slug>/<version>/.
CREATE TABLE versions (
  slug        TEXT NOT NULL,
  version     TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('uploading', 'ready')),
  manifest    TEXT NOT NULL,                  -- JSON, runtime manifest
  git_sha     TEXT,
  file_count  INTEGER NOT NULL DEFAULT 0,
  bytes       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (slug, version)
);

CREATE INDEX projects_listing ON projects (visibility, year DESC, updated_at DESC);
