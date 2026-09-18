import { useState, useCallback, useRef } from "react";
import ConnectBasecamp from "./ConnectBasecamp.jsx";
import ProjectList from "./ProjectList.jsx";
import ProjectDetail from "./ProjectDetail.jsx";
import ActivityLog from "./ActivityLog.jsx";

// ── Toast system ─────────────────────────────────────────────────────────────
let _toastId = 0;

export default function App() {
  const [authStatus, setAuthStatus]     = useState({ connected: false });
  const [selectedProject, setSelectedProject] = useState(null);
  const [toasts, setToasts]             = useState([]);
  const [pollTick, setPollTick]         = useState(0); // bumped by ActivityLog on new events

  const addToast = useCallback((type, title, message = "") => {
    const id = ++_toastId;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const handleActivityTick = useCallback(() => {
    setPollTick((n) => n + 1);
  }, []);

  // When project list updates the selected project (e.g. after push), keep detail in sync
  const handleProjectSelect = (project) => {
    setSelectedProject(project);
  };

  return (
    <div className="app-shell">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-header-brand">
          <div className="brand-logo">C</div>
          <span className="brand-title">CRM × Basecamp</span>
        </div>
        <ConnectBasecamp
          onStatusChange={setAuthStatus}
        />
      </header>

      {/* ── Main layout ────────────────────────────────────────────────── */}
      <div className="app-main">
        <div className="app-content">
          {/* Project list always visible */}
          <ProjectList
            onSelect={handleProjectSelect}
            selectedProjectId={selectedProject?.id}
            addToast={addToast}
            connected={authStatus.connected}
          />

          {/* Project detail panel – shown when a project is selected */}
          {selectedProject ? (
            <ProjectDetail
              key={selectedProject.id}
              project={selectedProject}
              addToast={addToast}
              connected={authStatus.connected}
              pollTick={pollTick}
            />
          ) : (
            <div
              className="card"
              style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-muted)" }}
            >
              <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem", opacity: 0.3 }}>👆</div>
              <div style={{ fontSize: "0.9rem" }}>
                Select a project to manage its tasks and Basecamp sync.
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar: Activity log ─────────────────────────────────── */}
        <aside>
          <ActivityLog onTick={handleActivityTick} />
        </aside>
      </div>

      {/* ── Toast container ────────────────────────────────────────────── */}
      <div className="toast-container" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`} role="alert">
            <span className="toast-icon">
              {toast.type === "error" ? "⚠️" : "✅"}
            </span>
            <div className="toast-body">
              <div className="toast-title">{toast.title}</div>
              {toast.message && (
                <div className="toast-message">{toast.message}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
