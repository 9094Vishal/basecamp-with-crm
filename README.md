# CRM × Basecamp Integration Demo

A proof-of-concept one-way integration between a local CRM-style project tool and live Basecamp projects, built with React 18 (Vite), Express 4, the official `@37signals/basecamp` SDK, and SQLite.

## Architecture

```
/server   – Express 4 backend (Node ≥ 20)
  db/       – better-sqlite3 + schema
  basecamp/ – OAuth PKCE flow, SDK client factory, webhook receiver
  routes/   – REST API for projects, tasks, activity log
/client   – Vite + React 18 frontend
  src/      – ConnectBasecamp, ProjectList, ProjectDetail, ActivityLog
README.md
```

---

## One-Time Setup

### 1. Register the App on 37signals Launchpad

1. Go to **https://launchpad.37signals.com/integrations**
2. Create a new integration:
   - **Redirect URI**: `http://localhost:4000/auth/basecamp/callback`
3. Copy the **Client ID** and **Client Secret** that are issued.

### 2. Start ngrok

Basecamp's webhook delivery requires a public HTTPS URL that resolves from the internet. `localhost` will **not** work.

```bash
ngrok http 4000
```

Note the `https://...ngrok-free.app` URL displayed. You'll need to update this in `.env` every time you restart ngrok on the free tier.

> **⚠️ Important**: The ngrok URL changes on every free-tier restart. Whenever it changes, update `PUBLIC_BASE_URL` in `server/.env` and re-push any existing Basecamp projects (using the "Push to Basecamp" button again) so the webhook URL is re-registered.

### 3. Create Environment Files

**`server/.env`** (copy from `.env.example`):

```env
BASECAMP_CLIENT_ID=your_client_id_here
BASECAMP_CLIENT_SECRET=your_client_secret_here
BASECAMP_REDIRECT_URI=http://localhost:4000/auth/basecamp/callback
PUBLIC_BASE_URL=https://<your-ngrok-subdomain>.ngrok-free.app
WEBHOOK_SECRET=replace_with_a_long_random_string
PORT=4000
CLIENT_URL=http://localhost:5173
USER_AGENT_EMAIL=you@example.com
```

**`client/.env`** (copy from `.env.example`):

```env
VITE_API_URL=http://localhost:4000
```

> ⚠️ Never commit `.env` files. They are already in `.gitignore`.

---

## Running the App

### Backend

```bash
cd server
npm install
npm run dev
```

Server starts on **http://localhost:4000**.

### Frontend

```bash
cd client
npm install
npm run dev
```

Frontend starts on **http://localhost:5173**.

---

## Manual Test Script

Run through these steps in order to confirm the full integration works end-to-end.

### Step 1 — Startup

1. Start the backend: `cd server && npm run dev`
2. Start the frontend: `cd client && npm run dev`
3. Start ngrok: `ngrok http 4000`
4. Confirm that `PUBLIC_BASE_URL` in `server/.env` matches the current ngrok HTTPS URL (it changes every restart on the free tier — update and restart the server if needed)

### Step 2 — Connect Basecamp

1. Open **http://localhost:5173** in a browser
2. Click **"🔗 Connect Basecamp"** in the top-right header
3. You'll be redirected to `launchpad.37signals.com` — log in and authorize the app
4. After redirect, the UI should show **"Connected as {Your Name}"** with a pulsing green dot
5. If you have multiple Basecamp accounts, an account picker dialog will appear — select the right one

### Step 3 — Create and Push a Project

1. Fill in the **Project name** and optional description in the CRM project form
2. Click **"＋ Add Project"** — the project appears in the list with a "Not pushed" badge
3. Click **"🚀 Push"** on the project row
4. Wait for the spinner — the badge should change to "Pushed to Basecamp" with a green ✅
5. Click **"Open in Basecamp ↗"** — confirm the project now exists in your real Basecamp account

### Step 4 — Create and Push a Task

1. Click the project row to open the **Project Detail** panel below
2. Type a task title and optionally set a due date, then click **"＋ Add"**
3. Click **"🚀 Push"** on the task row
4. The task status badge changes to **"In Basecamp"** with a 🔗 icon
5. Open the Basecamp project in a browser tab — under the "Tasks" todolist, your to-do should appear

### Step 5 — Complete the To-Do in Basecamp

1. In the Basecamp web app, check off (complete) the to-do you just pushed
2. Within **~5 seconds**, return to the CRM frontend
3. The task row should automatically update: status becomes **"Done"** ✔ and a "Completed via Basecamp" note appears with a timestamp
4. The **Webhook Activity** sidebar on the right should show a new `todo_completed` event entry

### Step 6 — Verify Signature Rejection

Run this curl command (replace `$PUBLIC_BASE_URL` with your actual ngrok URL):

```bash
curl -X POST $PUBLIC_BASE_URL/webhooks/basecamp \
  -d '{"kind":"todo_completed"}' \
  -H "Content-Type: application/json"
```

**Expected**: HTTP `401 Unauthorized` is returned, nothing changes in the CRM, and the backend logs `[Webhook] REJECTED – missing X-Basecamp-Signature header`.

---

## How It Works

| Feature | Implementation |
|---------|---------------|
| **OAuth PKCE** | `generatePKCE` + `generateState` → Launchpad redirect → `exchangeCode` with `useLegacyFormat: true` |
| **Identity / Accounts** | `discoverIdentity` post-auth, filter `product === "bc3"` |
| **Project push** | `client.projects.create()` → find `dock[name==="todoset"]` → `client.webhooks.create()` atomically |
| **Task push** | `client.todolists.create()` once per project (cached) → `client.todos.create()` |
| **Webhook verification** | `express.raw()` preserves bytes → `verifyWebhookSignature(body, signature, secret)` |
| **Webhook handling** | `todo_completed` → idempotent `UPDATE crm_tasks SET status='complete'` |
| **Activity log** | `webhook_events` table, auto-pruned to last 50 via DB trigger |
| **Frontend polling** | `setInterval(fetchEvents, 5000)` in `ActivityLog` → `onTick` → `pollTick` → `ProjectDetail` re-fetches tasks |

## Notes & Known Limitations

- **Token refresh**: A single best-effort refresh attempt is implemented. No retry/backoff — add that before going to production.
- **Single user**: Auth is stored as a single row (`id = 1`) — no multi-tenant support.
- **ngrok free tier**: The public URL changes on every restart. The webhook must be re-registered by re-pushing projects.
- **Basecamp webhook scope**: Webhooks are per-project — one is registered immediately when a project is pushed, so you're never in a "listening but not registered" state.
- **SDK retry**: The `@37signals/basecamp` SDK has automatic retry with exponential backoff built in — no extra retry loops are added around SDK calls.
