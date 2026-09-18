-- CRM Projects table: tracks local projects and their Basecamp counterparts
CREATE TABLE IF NOT EXISTS crm_projects (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  name                    TEXT    NOT NULL,
  description             TEXT,
  status                  TEXT    NOT NULL DEFAULT 'active',
  basecamp_bucket_id      INTEGER,           -- Basecamp project id (bucket)
  basecamp_app_url        TEXT,              -- Basecamp project web URL
  basecamp_todoset_id     INTEGER,           -- id of the project's todoset tool
  basecamp_todolist_id    INTEGER,           -- cached "Tasks" todolist id (created once per project)
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CRM Tasks table: tracks tasks/to-dos and their Basecamp counterparts
CREATE TABLE IF NOT EXISTS crm_tasks (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id          INTEGER  NOT NULL REFERENCES crm_projects(id) ON DELETE CASCADE,
  title               TEXT     NOT NULL,
  due_date            TEXT,                -- YYYY-MM-DD or NULL
  status              TEXT     NOT NULL DEFAULT 'pending',   -- pending | complete
  basecamp_todo_id    INTEGER,             -- Basecamp todo id once pushed
  synced_at           DATETIME,            -- set when a webhook updates status
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Stores the single Basecamp OAuth session (demo: single user)
CREATE TABLE IF NOT EXISTS basecamp_auth (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  access_token    TEXT    NOT NULL,
  refresh_token   TEXT,
  expires_at      INTEGER,                 -- unix epoch seconds
  account_id      TEXT,                   -- selected Basecamp account id
  account_name    TEXT,
  identity_name   TEXT,                   -- "First Last" from /authorization.json
  identity_email  TEXT,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Transient PKCE / state storage for in-flight OAuth sessions
CREATE TABLE IF NOT EXISTS oauth_sessions (
  state           TEXT     PRIMARY KEY,
  code_verifier   TEXT     NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Incoming webhook event log (capped at 50 rows via trigger)
CREATE TABLE IF NOT EXISTS webhook_events (
  id          INTEGER  PRIMARY KEY AUTOINCREMENT,
  kind        TEXT     NOT NULL,
  recording_id INTEGER,
  summary     TEXT,
  payload     TEXT,    -- raw JSON body
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Auto-prune: keep at most 50 webhook events
CREATE TRIGGER IF NOT EXISTS prune_webhook_events
  AFTER INSERT ON webhook_events
BEGIN
  DELETE FROM webhook_events
  WHERE id NOT IN (
    SELECT id FROM webhook_events ORDER BY id DESC LIMIT 50
  );
END;
