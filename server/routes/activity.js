import express from "express";
import { getRecentWebhookEvents } from "../db/db.js";

export const router = express.Router();

// ── GET /api/activity – return last 50 webhook events ────────────────────────
router.get("/", (_req, res) => {
  const events = getRecentWebhookEvents(50);
  res.json(events);
});
