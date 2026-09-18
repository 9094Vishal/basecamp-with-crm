import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api.js";

const KIND_COLORS = {
  todo_completed:  "badge-green",
  todo_created:    "badge-blue",
  todo_updated:    "badge-muted",
  todo_trashed:    "badge-red",
  todolist_created:"badge-purple",
  default:         "badge-muted",
};

/**
 * ActivityLog
 * Polls GET /api/activity every 5 s and renders the last 50 webhook events.
 * Calls onTick() whenever new events arrive so parent components can refresh.
 */
export default function ActivityLog({ onTick }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [liveCount, setLiveCount] = useState(0);
  const prevTopId = useRef(null);

  const fetchEvents = useCallback(async () => {
    try {
      const data = await api.activity.list();
      setEvents(data);

      // Detect new events by comparing the top event id
      if (data.length > 0 && prevTopId.current !== null && data[0].id !== prevTopId.current) {
        setLiveCount((c) => c + 1);
        onTick?.(); // notify parent to re-fetch tasks
      }
      if (data.length > 0) prevTopId.current = data[0].id;
    } catch {
      // silently ignore polling errors
    } finally {
      setLoading(false);
    }
  }, [onTick]);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 5000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  const badgeClass = (kind) => KIND_COLORS[kind] || KIND_COLORS.default;

  return (
    <div className="card app-sidebar">
      <div className="card-header">
        <span className="card-title">Webhook Activity</span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {liveCount > 0 && (
            <span className="badge badge-green" title="New events received">
              {liveCount} new
            </span>
          )}
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "var(--green)",
              boxShadow: "0 0 6px var(--green)",
              animation: "pulse-dot 2s ease-in-out infinite",
              display: "inline-block",
            }}
            title="Polling every 5s"
          />
        </div>
      </div>

      {loading ? (
        <div className="list-empty" style={{ padding: "2rem 0.5rem" }}>
          <div className="list-empty-icon" style={{ fontSize: "1.5rem" }}>📡</div>
          <div>Waiting for events…</div>
        </div>
      ) : events.length === 0 ? (
        <div className="list-empty" style={{ padding: "2rem 0.5rem" }}>
          <div className="list-empty-icon" style={{ fontSize: "1.5rem" }}>📭</div>
          <div style={{ fontSize: "0.8rem" }}>
            No webhook events yet.
            <br />Push a project to start receiving events.
          </div>
        </div>
      ) : (
        <div className="activity-list" id="activity-log-list">
          {events.map((evt) => (
            <div key={evt.id} className="activity-item">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className={`badge ${badgeClass(evt.kind)}`} style={{ fontSize: "0.7rem" }}>
                  {evt.kind}
                </span>
                <span className="activity-time">
                  {new Date(evt.created_at).toLocaleTimeString()}
                </span>
              </div>
              {evt.recording_id && (
                <div style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>
                  recording #{evt.recording_id}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="divider" />
      <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", textAlign: "center" }}>
        Polling every 5 s · Last 50 events
      </p>
    </div>
  );
}
