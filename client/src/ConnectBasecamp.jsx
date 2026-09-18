import { useState, useEffect, useCallback } from "react";
import { api } from "./api.js";

/**
 * ConnectBasecamp
 * Shows connection status and the "Connect Basecamp" button.
 * On success the parent receives { connected, accountId, accountName, identityName }.
 */
export default function ConnectBasecamp({ onStatusChange }) {
  const [status, setStatus] = useState(null);     // null = loading
  const [accounts, setAccounts] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await api.auth.status();
      setStatus(s);
      onStatusChange?.(s);
    } catch {
      setStatus({ connected: false });
      onStatusChange?.({ connected: false });
    }
  }, [onStatusChange]);

  // Check auth status on mount and after OAuth redirect
  useEffect(() => {
    refresh();

    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "success") {
      // Clear the URL params after a successful OAuth callback
      window.history.replaceState({}, "", window.location.pathname);
      const count = Number(params.get("account_count") || 1);
      if (count > 1) {
        // Multiple accounts – show picker
        api.auth.accounts().then((res) => {
          setAccounts(res.accounts || []);
          setShowPicker(true);
        });
      }
    }
  }, [refresh]);

  const handleSelectAccount = async (acc) => {
    setSelecting(true);
    try {
      await api.auth.selectAccount(acc.id, acc.name);
      setShowPicker(false);
      await refresh();
    } finally {
      setSelecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await api.auth.disconnect();
      await refresh();
    } finally {
      setDisconnecting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (status === null) {
    return (
      <div className="connect-section">
        <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Checking connection…
        </span>
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="connect-section">
        <span className="connect-status">
          <span className="status-dot disconnected" />
          <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Not connected to Basecamp
          </span>
        </span>
        <a
          href={api.auth.connectUrl}
          className="btn btn-primary btn-sm"
          id="connect-basecamp-btn"
        >
          🔗 Connect Basecamp
        </a>

        {/* Account picker modal */}
        {showPicker && (
          <AccountPickerModal
            accounts={accounts}
            onSelect={handleSelectAccount}
            onClose={() => setShowPicker(false)}
            selecting={selecting}
          />
        )}
      </div>
    );
  }

  return (
    <div className="connect-section">
      <span className="connect-status">
        <span className="status-dot connected" />
        <span style={{ fontSize: "0.875rem" }}>
          <span style={{ color: "var(--text-secondary)" }}>Connected as </span>
          <strong>{status.identityName || status.accountName}</strong>
          {status.accountName && (
            <span style={{ color: "var(--text-muted)", marginLeft: "0.35rem" }}>
              · {status.accountName}
            </span>
          )}
        </span>
      </span>
      <button
        className="btn btn-ghost btn-sm"
        onClick={handleDisconnect}
        disabled={disconnecting}
        id="disconnect-basecamp-btn"
      >
        {disconnecting ? <span className="spinner" /> : "Disconnect"}
      </button>

      {showPicker && (
        <AccountPickerModal
          accounts={accounts}
          onSelect={handleSelectAccount}
          onClose={() => setShowPicker(false)}
          selecting={selecting}
        />
      )}
    </div>
  );
}

// ── Account Picker Modal ────────────────────────────────────────────────────
function AccountPickerModal({ accounts, onSelect, onClose, selecting }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "min(440px, 90vw)", maxHeight: "80vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header">
          <h2>Choose a Basecamp Account</h2>
        </div>
        <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
          Multiple Basecamp accounts were found. Pick the one you want to integrate with.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {accounts.map((acc) => (
            <button
              key={acc.id}
              className="list-item"
              style={{ cursor: "pointer", textAlign: "left", width: "100%" }}
              onClick={() => onSelect(acc)}
              disabled={selecting}
              id={`account-pick-${acc.id}`}
            >
              <div className="list-item-icon" style={{ background: "var(--blue-bg)", color: "var(--blue)" }}>
                🏢
              </div>
              <div className="list-item-body">
                <div className="list-item-title">{acc.name}</div>
                <div className="list-item-meta">id: {acc.id}</div>
              </div>
              {selecting && <span className="spinner" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
