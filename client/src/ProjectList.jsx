import { useState, useEffect, useCallback } from "react";
import { api } from "./api.js";

/**
 * ProjectList
 * Shows a form to create CRM projects + a scrollable list.
 * Calls onSelect(project) when a project row is clicked.
 */
export default function ProjectList({ onSelect, selectedProjectId, addToast, connected }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pushing, setPushing] = useState(null); // projectId being pushed
  const [form, setForm] = useState({ name: "", description: "" });

  const loadProjects = useCallback(async () => {
    try {
      const data = await api.projects.list();
      setProjects(data);
    } catch (err) {
      addToast("error", "Failed to load projects", err.message);
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const project = await api.projects.create({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      });
      setProjects((prev) => [project, ...prev]);
      setForm({ name: "", description: "" });
      addToast("success", "Project created", `"${project.name}" added to CRM.`);
    } catch (err) {
      addToast("error", "Failed to create project", err.message);
    } finally {
      setCreating(false);
    }
  };

  const handlePush = async (e, project) => {
    e.stopPropagation();
    if (!connected) {
      addToast("error", "Not connected", "Connect to Basecamp first.");
      return;
    }
    setPushing(project.id);
    try {
      const updated = await api.projects.push(project.id);
      setProjects((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p))
      );
      if (updated.webhookWarning) {
        addToast(
          "warning",
          "Linked to Basecamp!",
          updated.webhookWarning
        );
      } else {
        addToast(
          "success",
          "Pushed to Basecamp!",
          `"${updated.name}" is now live in Basecamp and webhook registered.`
        );
      }
    } catch (err) {
      addToast("error", "Push failed", err.message);
    } finally {
      setPushing(null);
    }
  };

  const isPushed = (p) => !!p.basecamp_bucket_id;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">CRM Projects</span>
        <span className="badge badge-muted">{projects.length} total</span>
      </div>

      {/* Create form */}
      <form onSubmit={handleCreate} style={{ marginBottom: "1.25rem" }} id="create-project-form">
        <div className="form-row" style={{ marginBottom: "0.6rem" }}>
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label" htmlFor="proj-name">Project name</label>
            <input
              id="proj-name"
              className="form-input"
              placeholder="e.g. Acme Corp Website Redesign"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label" htmlFor="proj-desc">Description (optional)</label>
            <input
              id="proj-desc"
              className="form-input"
              placeholder="Short description…"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={creating || !form.name.trim()}
            id="submit-create-project"
            style={{ marginBottom: "0" }}
          >
            {creating ? <span className="spinner" /> : "＋"} Add Project
          </button>
        </div>
      </form>

      <div className="divider" />

      {/* Project list */}
      {loading ? (
        <div className="list-empty">
          <div className="list-empty-icon">⏳</div>
          <div>Loading projects…</div>
        </div>
      ) : projects.length === 0 ? (
        <div className="list-empty">
          <div className="list-empty-icon">📋</div>
          <div>No projects yet. Create one above.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {projects.map((project) => (
            <div
              key={project.id}
              className={`list-item ${selectedProjectId === project.id ? "active" : ""}`}
              onClick={() => onSelect(project)}
              id={`project-row-${project.id}`}
            >
              <div
                className="list-item-icon"
                style={{
                  background: isPushed(project) ? "var(--green-bg)" : "var(--bg-glass)",
                  color: isPushed(project) ? "var(--green)" : "var(--text-muted)",
                }}
              >
                {isPushed(project) ? "✅" : "📁"}
              </div>

              <div className="list-item-body">
                <div className="list-item-title">{project.name}</div>
                <div className="list-item-meta" style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  {isPushed(project) ? (
                    <>
                      <span className="badge badge-green" style={{ fontSize: "0.7rem" }}>Pushed</span>
                      <a
                        href={project.basecamp_app_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ext-link"
                        onClick={(e) => e.stopPropagation()}
                        id={`open-bc-${project.id}`}
                      >
                        Open in Basecamp ↗
                      </a>
                    </>
                  ) : (
                    <span className="badge badge-muted" style={{ fontSize: "0.7rem" }}>Not pushed</span>
                  )}
                  <span>
                    {project.task_count || 0} task{project.task_count !== 1 ? "s" : ""}
                    {project.synced_task_count > 0 && (
                      <span style={{ color: "var(--green)", marginLeft: "0.3rem" }}>
                        · {project.synced_task_count} synced
                      </span>
                    )}
                  </span>
                </div>
              </div>

              <div className="list-item-actions">
                {!isPushed(project) && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => handlePush(e, project)}
                    disabled={pushing === project.id || !connected}
                    data-tooltip={!connected ? "Connect Basecamp first" : "Push project to Basecamp"}
                    id={`push-project-${project.id}`}
                  >
                    {pushing === project.id ? (
                      <span className="spinner" />
                    ) : (
                      "🚀 Push"
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
