import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Open (or create) the SQLite database file in the server/ directory
const DB_PATH = join(__dirname, "..", "crm.db");

const db = new Database(DB_PATH);

// Performance and reliability settings
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = NORMAL");

// Initialise schema (idempotent – uses CREATE TABLE IF NOT EXISTS)
const schema = readFileSync(join(__dirname, "schema.sql"), "utf8");
db.exec(schema);

// ─── Auth helpers ────────────────────────────────────────────────────────────

export function getAuth() {
  return db.prepare("SELECT * FROM basecamp_auth WHERE id = 1").get();
}

export function saveAuth({
  accessToken,
  refreshToken,
  expiresAt,
  accountId,
  accountName,
  identityName,
  identityEmail,
}) {
  db.prepare(`
    INSERT INTO basecamp_auth
      (id, access_token, refresh_token, expires_at, account_id, account_name,
       identity_name, identity_email, updated_at)
    VALUES
      (1, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      access_token   = excluded.access_token,
      refresh_token  = excluded.refresh_token,
      expires_at     = excluded.expires_at,
      account_id     = excluded.account_id,
      account_name   = excluded.account_name,
      identity_name  = excluded.identity_name,
      identity_email = excluded.identity_email,
      updated_at     = CURRENT_TIMESTAMP
  `).run(
    accessToken,
    refreshToken ?? null,
    expiresAt ?? null,
    accountId ?? null,
    accountName ?? null,
    identityName ?? null,
    identityEmail ?? null
  );
}

export function updateAuthAccount({ accountId, accountName }) {
  db.prepare(`
    UPDATE basecamp_auth
    SET account_id = ?, account_name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(accountId, accountName);
}

export function clearAuth() {
  db.prepare("DELETE FROM basecamp_auth WHERE id = 1").run();
}

// ─── OAuth session (PKCE) helpers ────────────────────────────────────────────

export function saveOAuthSession(state, codeVerifier) {
  db.prepare(
    "INSERT OR REPLACE INTO oauth_sessions (state, code_verifier) VALUES (?, ?)"
  ).run(state, codeVerifier);
}

export function getOAuthSession(state) {
  return db
    .prepare("SELECT * FROM oauth_sessions WHERE state = ?")
    .get(state);
}

export function deleteOAuthSession(state) {
  db.prepare("DELETE FROM oauth_sessions WHERE state = ?").run(state);
}

// Clean up stale sessions older than 15 minutes
export function pruneOldSessions() {
  db.prepare(`
    DELETE FROM oauth_sessions
    WHERE created_at < datetime('now', '-15 minutes')
  `).run();
}

// ─── CRM Project helpers ──────────────────────────────────────────────────────

export function listProjects() {
  return db.prepare(`
    SELECT
      p.*,
      COUNT(t.id)                                          AS task_count,
      SUM(CASE WHEN t.status = 'complete' THEN 1 ELSE 0 END) AS completed_task_count,
      SUM(CASE WHEN t.basecamp_todo_id IS NOT NULL THEN 1 ELSE 0 END) AS synced_task_count
    FROM crm_projects p
    LEFT JOIN crm_tasks t ON t.project_id = p.id
    GROUP BY p.id
    ORDER BY p.id DESC
  `).all();
}

export function getProject(id) {
  return db.prepare("SELECT * FROM crm_projects WHERE id = ?").get(id);
}

export function createProject({ name, description }) {
  const result = db
    .prepare("INSERT INTO crm_projects (name, description) VALUES (?, ?)")
    .run(name, description ?? null);
  return getProject(result.lastInsertRowid);
}

export function updateProjectBasecampInfo({
  id,
  basecampBucketId,
  basecampAppUrl,
  basecampTodosetId,
}) {
  db.prepare(`
    UPDATE crm_projects
    SET basecamp_bucket_id   = ?,
        basecamp_app_url     = ?,
        basecamp_todoset_id  = ?
    WHERE id = ?
  `).run(basecampBucketId, basecampAppUrl, basecampTodosetId, id);
}

export function updateProjectTodolistId(id, todolistId) {
  db.prepare(
    "UPDATE crm_projects SET basecamp_todolist_id = ? WHERE id = ?"
  ).run(todolistId, id);
}

// ─── CRM Task helpers ─────────────────────────────────────────────────────────

export function listTasks(projectId) {
  return db
    .prepare(
      "SELECT * FROM crm_tasks WHERE project_id = ? ORDER BY id DESC"
    )
    .all(projectId);
}

export function getTask(id) {
  return db.prepare("SELECT * FROM crm_tasks WHERE id = ?").get(id);
}

export function createTask({ projectId, title, dueDate }) {
  const result = db
    .prepare(
      "INSERT INTO crm_tasks (project_id, title, due_date) VALUES (?, ?, ?)"
    )
    .run(projectId, title, dueDate ?? null);
  return getTask(result.lastInsertRowid);
}

export function updateTaskBasecampId(id, basecampTodoId) {
  db.prepare(
    "UPDATE crm_tasks SET basecamp_todo_id = ? WHERE id = ?"
  ).run(basecampTodoId, id);
}

export function completeTask(basecampTodoId) {
  // Idempotent: safe to call when already complete
  db.prepare(`
    UPDATE crm_tasks
    SET status    = 'complete',
        synced_at = CURRENT_TIMESTAMP
    WHERE basecamp_todo_id = ?
      AND status != 'complete'
  `).run(basecampTodoId);
  return db
    .prepare("SELECT * FROM crm_tasks WHERE basecamp_todo_id = ?")
    .get(basecampTodoId);
}

// ─── Webhook event helpers ────────────────────────────────────────────────────

export function logWebhookEvent({ kind, recordingId, summary, payload }) {
  db.prepare(`
    INSERT INTO webhook_events (kind, recording_id, summary, payload)
    VALUES (?, ?, ?, ?)
  `).run(
    kind,
    recordingId ?? null,
    summary ?? null,
    typeof payload === "string" ? payload : JSON.stringify(payload)
  );
}

export function getRecentWebhookEvents(limit = 50) {
  return db
    .prepare(
      "SELECT * FROM webhook_events ORDER BY id DESC LIMIT ?"
    )
    .all(limit);
}

export default db;
