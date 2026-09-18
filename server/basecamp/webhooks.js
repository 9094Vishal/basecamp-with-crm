import express from "express";
import { verifyWebhookSignature } from "@37signals/basecamp";
import {
  logWebhookEvent,
  completeTask,
} from "../db/db.js";

export const router = express.Router();

// NOTE: This router is mounted in index.js with express.raw({ type: 'application/json' }).
// req.body is a Buffer containing the exact bytes Basecamp sent.
// We MUST NOT use express.json() on this route – the raw bytes are required
// for HMAC-SHA256 signature verification.

router.post("/", (req, res) => {
  const signature = req.headers["x-basecamp-signature"];
  const secret = process.env.WEBHOOK_SECRET;
  const rawBody = req.body; // Buffer from express.raw()

  // ── Signature verification ────────────────────────────────────────────────
  if (!signature) {
    console.warn(
      `[Webhook] REJECTED – missing X-Basecamp-Signature header at ${new Date().toISOString()}`
    );
    return res.status(401).json({ error: "Missing signature" });
  }

  if (!secret) {
    console.error("[Webhook] WEBHOOK_SECRET is not configured – rejecting all requests");
    return res.status(401).json({ error: "Webhook secret not configured" });
  }

  const isValid = verifyWebhookSignature(rawBody, signature, secret);
  if (!isValid) {
    console.warn(
      `[Webhook] REJECTED – invalid signature at ${new Date().toISOString()}`
    );
    return res.status(401).json({ error: "Invalid signature" });
  }

  // ── Parse body only after verification ───────────────────────────────────
  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch (parseErr) {
    console.error("[Webhook] Failed to parse JSON body:", parseErr.message);
    // Return 200 so Basecamp doesn't retry a malformed payload indefinitely
    return res.status(200).json({ ok: false, error: "Invalid JSON" });
  }

  const { kind, recording } = payload;
  const recordingId = recording?.id ?? null;
  const timestamp = new Date().toISOString();

  console.log(
    `[Webhook] Event received: kind=${kind}, recording_id=${recordingId}, at=${timestamp}`
  );

  // ── Log to DB (trigger auto-prunes to last 50) ────────────────────────────
  logWebhookEvent({
    kind,
    recordingId,
    summary: `${kind} – recording ${recordingId}`,
    payload,
  });

  // ── Handle todo_completed ─────────────────────────────────────────────────
  if (kind === "todo_completed" && recordingId != null) {
    const updated = completeTask(recordingId);
    if (updated) {
      console.log(
        `[Webhook] CRM task id=${updated.id} marked complete (bc todo ${recordingId})`
      );
    } else {
      console.log(
        `[Webhook] No CRM task found for bc todo id=${recordingId} (not an error)`
      );
    }
  }

  // Always respond 200 quickly – Basecamp retries on non-2xx
  return res.status(200).json({ ok: true });
});
