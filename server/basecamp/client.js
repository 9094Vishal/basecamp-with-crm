import { createBasecampClient, isTokenExpired } from "@37signals/basecamp";
import { getAuth } from "../db/db.js";
import { attemptTokenRefresh } from "./auth.js";

const APP_NAME = "crm-basecamp-demo/0.1";

/**
 * Returns an initialised Basecamp SDK client built from the stored token.
 * Performs a best-effort token refresh if the stored token is expired.
 *
 * Throws an error (status 401) if no token is stored or refresh fails –
 * callers should propagate this to the frontend so the user can re-connect.
 */
export async function getBasecampClient() {
  const auth = getAuth();

  if (!auth?.access_token) {
    const err = new Error("Not connected to Basecamp. Please complete OAuth first.");
    err.status = 401;
    throw err;
  }

  if (!auth.account_id) {
    const err = new Error("No Basecamp account selected. Please complete OAuth first.");
    err.status = 401;
    throw err;
  }

  let accessToken = auth.access_token;

  // Best-effort refresh when token appears expired (60-second buffer built in)
  if (
    auth.expires_at &&
    isTokenExpired({ accessToken, expiresAt: new Date(auth.expires_at * 1000) })
  ) {
    try {
      accessToken = await attemptTokenRefresh();
    } catch (refreshErr) {
      console.warn("[Basecamp Client] Token refresh failed:", refreshErr.message);
      // Continue with possibly-stale token; the API call itself will 401 if it's truly dead
    }
  }

  const userAgentEmail = process.env.USER_AGENT_EMAIL || "demo@example.com";

  return createBasecampClient({
    accountId: auth.account_id,
    accessToken,
    userAgent: `${APP_NAME} (${userAgentEmail})`,
  });
}
