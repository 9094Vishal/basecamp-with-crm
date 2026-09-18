import express from "express";
import {
  getProject,
  listTasks,
  getTask,
  createTask,
  updateTaskBasecampId,
  updateProjectTodolistId,
} from "../db/db.js";
import { getBasecampClient } from "../basecamp/client.js";

export const router = express.Router();

// ── GET /api/tasks/:projectId – list tasks for a project ─────────────────────
// (Also accessible from the nested route via projects, but keep as flat for simplicity)
router.get("/project/:projectId", (req, res) => {
  const projectId = Number(req.params.projectId);
  const project = getProject(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json(listTasks(projectId));
});

// ── POST /api/tasks/:projectId – create a task ───────────────────────────────
router.post("/project/:projectId", (req, res) => {
  const projectId = Number(req.params.projectId);
  const project = getProject(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const { title, due_date } = req.body;
  if (!title?.trim()) {
    return res.status(400).json({ error: "title is required" });
  }

  const task = createTask({
    projectId,
    title: title.trim(),
    dueDate: due_date?.trim() || null,
  });
  res.status(201).json(task);
});

// ── POST /api/tasks/:taskId/push – push task to Basecamp ────────────────────
router.post("/:taskId/push", async (req, res, next) => {
  const taskId = Number(req.params.taskId);

  const task = getTask(taskId);
  if (!task) return res.status(404).json({ error: "Task not found" });

  // Already pushed
  if (task.basecamp_todo_id) {
    return res.json({ ...task, alreadyPushed: true });
  }

  const project = getProject(task.project_id);
  if (!project) return res.status(404).json({ error: "Parent project not found" });

  // Guard: project must be pushed first (need todoset_id)
  if (!project.basecamp_todoset_id) {
    return res.status(400).json({
      error:
        "Parent project has not been pushed to Basecamp yet. " +
        'Push the project first to enable the "Push to Basecamp" button on tasks.',
    });
  }

  let client;
  try {
    client = await getBasecampClient();
  } catch (authErr) {
    return res.status(authErr.status || 401).json({ error: authErr.message });
  }

  // ── Ensure we have a "Tasks" todolist (create once, cache on project row) ──
  let todolistId = project.basecamp_todolist_id;

  if (!todolistId) {
    let newList;
    try {
      newList = await client.todolists.create(project.basecamp_todoset_id, {
        name: "Tasks",
      });
    } catch (listErr) {
      console.error("[Push Task] Failed to create todolist:", listErr);
      return res.status(502).json({
        error: `Failed to create Basecamp todolist: ${listErr.message}`,
      });
    }
    todolistId = newList.id;
    updateProjectTodolistId(project.id, todolistId);
    console.log(
      `[Push Task] Created todolist id=${todolistId} for project id=${project.id}`
    );
  }

  // ── Create the to-do ──────────────────────────────────────────────────────
  let bcTodo;
  try {
    bcTodo = await client.todos.create(todolistId, {
      content: task.title,
      dueOn: task.due_date || undefined,
    });
  } catch (todoErr) {
    console.error("[Push Task] Failed to create Basecamp todo:", todoErr);
    return res.status(502).json({
      error: `Failed to create Basecamp to-do: ${todoErr.message}`,
    });
  }

  updateTaskBasecampId(task.id, bcTodo.id);

  const updated = getTask(task.id);
  res.json(updated);
});
