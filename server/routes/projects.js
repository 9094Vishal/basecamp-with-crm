import express from "express";
import {
  listProjects,
  getProject,
  createProject,
  updateProjectBasecampInfo,
} from "../db/db.js";
import { getBasecampClient } from "../basecamp/client.js";

export const router = express.Router();

// ── GET /api/projects – list all CRM projects ─────────────────────────────────
router.get("/", (_req, res) => {
  const projects = listProjects();
  res.json(projects);
});

// ── POST /api/projects – create a CRM project ────────────────────────────────
router.post("/", (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const project = createProject({ name: name.trim(), description: description?.trim() ?? null });
  res.status(201).json(project);
});

// ── GET /api/projects/:id – get one project ───────────────────────────────────
router.get("/:id", (req, res) => {
  const project = getProject(Number(req.params.id));
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json(project);
});

// ── POST /api/projects/:id/push – provision project in Basecamp ───────────────
router.post("/:id/push", async (req, res, next) => {
  const projectId = Number(req.params.id);

  const project = getProject(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  // Already pushed – just return current state
  if (project.basecamp_bucket_id) {
    return res.json({ ...project, alreadyPushed: true });
  }

  let client;
  try {
    client = await getBasecampClient();
  } catch (authErr) {
    return res.status(authErr.status || 401).json({ error: authErr.message });
  }

  let bcProject;
  try {
    // 1. Create the Basecamp project
    bcProject = await client.projects.create({
      name: project.name,
      description: project.description || undefined,
    });
  } catch (err) {
    console.error("[Push Project] Failed to create Basecamp project:", err);
    return res.status(502).json({
      error: `Failed to create Basecamp project: ${err.message}`,
    });
  }

  // 2. Find the todoset in the dock
  const todosetDock = (bcProject.dock || []).find((d) => d.name === "todoset");
  if (!todosetDock) {
    // Project created but we can't find the todoset – unusual, surface the error
    console.error(
      "[Push Project] Basecamp project created but no todoset found in dock:",
      JSON.stringify(bcProject.dock)
    );
    return res.status(502).json({
      error:
        "Basecamp project was created but no todoset tool was found in dock. " +
        "Please check your Basecamp account and try again.",
      basecampProjectId: bcProject.id,
    });
  }

  // 3. Register webhook on the new bucket
  let webhookWarning = null;
  const webhookUrl = `${process.env.PUBLIC_BASE_URL}/webhooks/basecamp`;
  const isPlaceholderUrl =
    !process.env.PUBLIC_BASE_URL ||
    process.env.PUBLIC_BASE_URL.includes("<your-ngrok-subdomain>") ||
    process.env.PUBLIC_BASE_URL.includes("localhost");

  if (!isPlaceholderUrl) {
    try {
      await client.webhooks.create(bcProject.id, {
        payloadUrl: webhookUrl,
        types: ["Todo"],
        active: true,
      });
    } catch (whErr) {
      console.warn("[Push Project] Webhook registration warning:", whErr);
      webhookWarning =
        `Basecamp project created and linked, but webhook registration failed: ${whErr.message}. ` +
        "Inbound completion sync won't trigger until an active public HTTPS tunnel (e.g. ngrok) is running.";
    }
  } else {
    webhookWarning =
      "Basecamp project created and linked! Webhook was skipped because PUBLIC_BASE_URL in server/.env " +
      "is not yet configured with your live ngrok URL. Update PUBLIC_BASE_URL to enable inbound status sync.";
  }

  // 4. Persist the Basecamp IDs in the DB
  updateProjectBasecampInfo({
    id: projectId,
    basecampBucketId: bcProject.id,
    basecampAppUrl: bcProject.app_url,
    basecampTodosetId: todosetDock.id,
  });

  const updated = getProject(projectId);
  res.json({ ...updated, webhookWarning });
});

// ── POST /api/projects/:id/webhook – retry / register webhook on existing bucket ─
router.post("/:id/webhook", async (req, res, next) => {
  const projectId = Number(req.params.id);
  const project = getProject(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (!project.basecamp_bucket_id) {
    return res.status(400).json({ error: "Project has not been pushed to Basecamp yet" });
  }

  const client = getBasecampClient();
  if (!client) {
    return res.status(401).json({ error: "Not authenticated with Basecamp" });
  }

  const webhookUrl = `${process.env.PUBLIC_BASE_URL}/webhooks/basecamp`;
  try {
    const wh = await client.webhooks.create(project.basecamp_bucket_id, {
      payloadUrl: webhookUrl,
      types: ["Todo"],
      active: true,
    });
    res.json({ ok: true, webhookId: wh.id, webhookUrl });
  } catch (whErr) {
    console.error("[Register Webhook] Failed:", whErr);
    res.status(502).json({
      error: `Webhook registration failed: ${whErr.message}. Ensure PUBLIC_BASE_URL resolves to an active public IP.`,
    });
  }
});
