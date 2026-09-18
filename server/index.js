import "dotenv/config";
import express from "express";
import cors from "cors";

// ── Import route modules ──────────────────────────────────────────────────────
import { router as authRouter } from "./basecamp/auth.js";
import { router as webhooksRouter } from "./basecamp/webhooks.js";
import { router as projectsRouter } from "./routes/projects.js";
import { router as tasksRouter } from "./routes/tasks.js";
import { router as activityRouter } from "./routes/activity.js";

const app = express();
const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

// ── Webhooks route MUST be mounted FIRST (before global json parser) ──────────
// express.raw() preserves the exact bytes Basecamp sent – required for
// HMAC-SHA256 signature verification.
app.use("/webhooks/basecamp", express.raw({ type: "application/json" }), webhooksRouter);

// ── Global JSON + URL-encoded body parsers (all other routes) ─────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true, version: "0.1.0" }));

// ── Auth routes ───────────────────────────────────────────────────────────────
app.use("/auth/basecamp", authRouter);

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api/projects", projectsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/activity", activityRouter);

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// ── Central error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("[Error]", err);
  const status = err.status || 500;
  const message = err.message || "Internal server error";
  res.status(status).json({ error: message });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  CRM-Basecamp backend running on http://localhost:${PORT}`);
  console.log(
    `   Webhook endpoint: ${process.env.PUBLIC_BASE_URL || "(PUBLIC_BASE_URL not set)"}/webhooks/basecamp`
  );
});
// Active tunnel: micrmtest.loca.lt
