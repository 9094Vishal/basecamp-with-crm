/**
 * Thin fetch wrapper around the backend API.
 * Uses VITE_API_URL so the URL is never hardcoded.
 */
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // Parse JSON always (even errors return JSON bodies from Express)
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));

  if (!res.ok) {
    const err = new Error(data?.error || `Request failed: ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    status: ()                       => request("/auth/basecamp/status"),
    accounts: ()                     => request("/auth/basecamp/accounts"),
    selectAccount: (accountId, name) =>
      request("/auth/basecamp/select-account", {
        method: "POST",
        body: { accountId, accountName: name },
      }),
    disconnect: ()                   =>
      request("/auth/basecamp/disconnect", { method: "POST" }),
    connectUrl: `${BASE_URL}/auth/basecamp/connect`,
  },

  // ── Projects ──────────────────────────────────────────────────────────────
  projects: {
    list: ()             => request("/api/projects"),
    get: (id)            => request(`/api/projects/${id}`),
    create: (body)       => request("/api/projects", { method: "POST", body }),
    push: (id)           => request(`/api/projects/${id}/push`, { method: "POST" }),
  },

  // ── Tasks ─────────────────────────────────────────────────────────────────
  tasks: {
    list: (projectId)    => request(`/api/tasks/project/${projectId}`),
    create: (projectId, body) =>
      request(`/api/tasks/project/${projectId}`, { method: "POST", body }),
    push: (taskId)       => request(`/api/tasks/${taskId}/push`, { method: "POST" }),
  },

  // ── Activity log ──────────────────────────────────────────────────────────
  activity: {
    list: ()             => request("/api/activity"),
  },
};
