import { useState, useEffect, useCallback } from "react";
import { api } from "./api.js";

/**
 * ProjectDetail
 * Shows tasks for the selected project plus push buttons.
 * Also listens to activity events refreshed by parent (via pollTick prop).
 */
export default function ProjectDetail({ project, addToast, connected, pollTick }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pushing, setPushing] = useState(null); // taskId being pushed
  const [form, setForm] = useState({ title: "", due_date: "" });

  const loadTasks = useCallback(async () => {
    try {
      const data = await api.tasks.list(project.id);
      setTasks(data);
    } catch (err) {
      addToast("error", "Failed to load tasks", err.message);
    } finally {
      setLoading(false);
    }
  }, [project.id, addToast]);

  // Reload tasks whenever the project changes or a webhook fires (pollTick changes)
  useEffect(() => {
    setLoading(true);
    loadTasks();
  }, [loadTasks, pollTick]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      const task = await api.tasks.create(project.id, {
        title: form.title.trim(),
        due_date: form.due_date || undefined,
      });
      setTasks((prev) => [task, ...prev]);
      setForm({ title: "", due_date: "" });
    } catch (err) {
      addToast("error", "Failed to create task", err.message);
    } finally {
      setCreating(false);
    }
  };

  const handlePush = async (task) => {
    if (!connected) {
      addToast("error", "Not connected", "Connect to Basecamp first.");
      return;
    }
    setPushing(task.id);
    try {
      const updated = await api.tasks.push(task.id);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      addToast("success", "Task pushed!", `"${updated.title}" is now a Basecamp to-do.`);
    } catch (err) {
      addToast("error", "Push failed", err.message);
    } finally {
      setPushing(null);
    }
  };

  const isPushed = (p) => !!p.basecamp_bucket_id;
  const projectPushed = isPushed(project);

  return (
    <div className="card">
      {/* Project header */}
      <div style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <h2 style={{ fontSize: "1.1rem" }}>{project.name}</h2>
          {projectPushed ? (
            <span className="badge badge-green">Pushed to Basecamp</span>
          ) : (
            <span className="badge badge-amber">Not pushed</span>
          )}
        </div>
        {project.description && (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.35rem" }}>
            {project.description}
          </p>
        )}
        {projectPushed && (
          <div style={{ display: "flex", gap: "1rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
            <a
              href={project.basecamp_app_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ext-link"
              id="open-bc-project-link"
            >
              🏕 Open in Basecamp ↗
            </a>
            <span className="meta-row" style={{ fontSize: "0.75rem" }}>
              <span>bucket {project.basecamp_bucket_id}</span>
              <span>·</span>
              <span>todoset {project.basecamp_todoset_id}</span>
            </span>
          </div>
        )}
        {!projectPushed && (
          <p style={{ color: "var(--amber)", fontSize: "0.8rem", marginTop: "0.5rem" }}>
            ⚠️ Push this project to Basecamp first to enable task sync.
          </p>
        )}
      </div>

      <div className="divider" />

      {/* Task create form */}
      <div className="card-header" style={{ marginBottom: "0.875rem" }}>
        <span className="card-title">Tasks</span>
        <span className="badge badge-muted">{tasks.length}</span>
      </div>

      <form onSubmit={handleCreate} id="create-task-form" style={{ marginBottom: "1rem" }}>
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label" htmlFor="task-title">Task title</label>
            <input
              id="task-title"
              className="form-input"
              placeholder="e.g. Design mockups for homepage"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="task-due">Due date</label>
            <input
              id="task-due"
              type="date"
              className="form-input"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              style={{ colorScheme: "dark" }}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={creating || !form.title.trim()}
            id="submit-create-task"
          >
            {creating ? <span className="spinner" /> : "＋ Add"}
          </button>
        </div>
      </form>

      {/* Task list */}
      {loading ? (
        <div className="list-empty">
          <div className="list-empty-icon">⏳</div>
          <div>Loading tasks…</div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="list-empty">
          <div className="list-empty-icon">✅</div>
          <div>No tasks yet. Add one above.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {tasks.map((task) => {
            const isSynced    = !!task.basecamp_todo_id;
            const isComplete  = task.status === "complete";
            const isPushing   = pushing === task.id;
            const canPush     = projectPushed && !isSynced && connected;

            return (
              <div
                key={task.id}
                className={`list-item ${isComplete ? "task-complete" : ""}`}
                style={{ cursor: "default", alignItems: "center" }}
                id={`task-row-${task.id}`}
              >
                {/* Status icon */}
                <div
                  className="list-item-icon"
                  style={{
                    background: isComplete
                      ? "var(--green-bg)"
                      : isSynced
                      ? "var(--blue-bg)"
                      : "var(--bg-glass)",
                    color: isComplete
                      ? "var(--green)"
                      : isSynced
                      ? "var(--blue)"
                      : "var(--text-muted)",
                    fontSize: "0.9rem",
                  }}
                >
                  {isComplete ? "✓" : isSynced ? "🔗" : "○"}
                </div>

                <div className="list-item-body">
                  <div className="list-item-title">{task.title}</div>
                  <div className="list-item-meta" style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                    {task.due_date && <span>📅 {task.due_date}</span>}
                    {isComplete && (
                      <span className="synced-check">
                        ✔ Completed via Basecamp
                        {task.synced_at && (
                          <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                            {" "}at {new Date(task.synced_at).toLocaleTimeString()}
                          </span>
                        )}
                      </span>
                    )}
                    {!isComplete && isSynced && (
                      <span style={{ color: "var(--blue)", fontSize: "0.75rem", fontWeight: 500 }}>
                        Synced · todo #{task.basecamp_todo_id}
                      </span>
                    )}
                  </div>
                </div>

                <div className="list-item-actions">
                  {isComplete ? (
                    <span className="badge badge-green">Done</span>
                  ) : isSynced ? (
                    <span className="badge badge-blue">In Basecamp</span>
                  ) : (
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={!canPush || isPushing}
                      onClick={() => handlePush(task)}
                      data-tooltip={
                        !connected
                          ? "Connect Basecamp first"
                          : !projectPushed
                          ? "Push the project to Basecamp first"
                          : "Push this task to Basecamp"
                      }
                      id={`push-task-${task.id}`}
                    >
                      {isPushing ? <span className="spinner" /> : "🚀 Push"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
