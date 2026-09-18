import {
  generatePKCE,
  generateState,
  buildAuthorizationUrl,
  exchangeCode,
  refreshToken as sdkRefreshToken,
  discoverIdentity,
} from "@37signals/basecamp/oauth";
import express from "express";
import {
  saveOAuthSession,
  getOAuthSession,
  deleteOAuthSession,
  pruneOldSessions,
  saveAuth,
  getAuth,
  clearAuth,
  updateAuthAccount,
} from "../db/db.js";

export const router = express.Router();

// Launchpad constants
const LAUNCHPAD_AUTH_ENDPOINT =
  "https://launchpad.37signals.com/authorization/new";
const LAUNCHPAD_TOKEN_ENDPOINT =
  "https://launchpad.37signals.com/authorization/token";

// ── GET /auth/basecamp/connect – redirect to Basecamp OAuth ──────────────────
router.get("/connect", async (req, res, next) => {
  try {
    pruneOldSessions();

    const pkce = await generatePKCE();
    const state = generateState();

    saveOAuthSession(state, pkce.verifier);

    const url = buildAuthorizationUrl({
      authorizationEndpoint: LAUNCHPAD_AUTH_ENDPOINT,
      clientId: process.env.BASECAMP_CLIENT_ID,
      redirectUri: process.env.BASECAMP_REDIRECT_URI,
      state,
      pkce,
    });

    // Launchpad needs the legacy type=web_server parameter
    url.searchParams.set("type", "web_server");

    res.redirect(url.toString());
  } catch (err) {
    next(err);
  }
});

// ── GET /auth/basecamp/callback – exchange code for token ────────────────────
router.get("/callback", async (req, res, next) => {
  const { code, state, error } = req.query;
  const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

  if (error) {
    console.error("[OAuth] Basecamp returned error:", error);
    return res.redirect(`${CLIENT_URL}/?auth=error&reason=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return res.redirect(`${CLIENT_URL}/?auth=error&reason=missing_params`);
  }

  try {
    const session = getOAuthSession(state);
    if (!session) {
      return res.redirect(`${CLIENT_URL}/?auth=error&reason=invalid_state`);
    }
    deleteOAuthSession(state);

    // Exchange the authorization code for tokens
    const token = await exchangeCode({
      tokenEndpoint: LAUNCHPAD_TOKEN_ENDPOINT,
      code: String(code),
      redirectUri: process.env.BASECAMP_REDIRECT_URI,
      clientId: process.env.BASECAMP_CLIENT_ID,
      clientSecret: process.env.BASECAMP_CLIENT_SECRET,
      codeVerifier: session.code_verifier,
      useLegacyFormat: true,
    });

    // Discover identity & accounts
    const identity = await discoverIdentity(token.accessToken);

    // Filter to Basecamp 4 (bc3 product code)
    const bc3Accounts = (identity.accounts || []).filter(
      (a) => a.product === "bc3"
    );

    const expiresAt = token.expiresAt
      ? Math.floor(new Date(token.expiresAt).getTime() / 1000)
      : null;

    // Persist tokens; auto-select account if only one
    const firstAccount = bc3Accounts[0];
    saveAuth({
      accessToken: token.accessToken,
      refreshToken: token.refreshToken ?? null,
      expiresAt,
      accountId: firstAccount?.id?.toString() ?? null,
      accountName: firstAccount?.name ?? null,
      identityName: `${identity.identity?.firstName ?? ""} ${identity.identity?.lastName ?? ""}`.trim(),
      identityEmail: identity.identity?.emailAddress ?? null,
    });

    // Pass account count so the frontend can prompt a selection if needed
    res.redirect(
      `${CLIENT_URL}/?auth=success&account_count=${bc3Accounts.length}`
    );
  } catch (err) {
    console.error("[OAuth] Callback error:", err);
    res.redirect(
      `${CLIENT_URL}/?auth=error&reason=${encodeURIComponent(err.message)}`
    );
  }
});

// ── GET /auth/basecamp/status ─────────────────────────────────────────────────
router.get("/status", (req, res) => {
  const auth = getAuth();
  if (!auth || !auth.access_token) {
    return res.json({ connected: false });
  }
  res.json({
    connected: true,
    accountId: auth.account_id,
    accountName: auth.account_name,
    identityName: auth.identity_name,
    identityEmail: auth.identity_email,
  });
});

// ── GET /auth/basecamp/accounts – list bc3 accounts (for multi-account UI) ───
router.get("/accounts", async (req, res, next) => {
  const auth = getAuth();
  if (!auth?.access_token) {
    return res.status(401).json({ error: "Not connected to Basecamp" });
  }
  try {
    const identity = await discoverIdentity(auth.access_token);
    const bc3Accounts = (identity.accounts || []).filter(
      (a) => a.product === "bc3"
    );
    res.json({ accounts: bc3Accounts });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/basecamp/select-account ───────────────────────────────────────
router.post("/select-account", (req, res) => {
  const { accountId, accountName } = req.body;
  if (!accountId) {
    return res.status(400).json({ error: "accountId is required" });
  }
  updateAuthAccount({ accountId: String(accountId), accountName: accountName ?? "" });
  res.json({ ok: true });
});

// ── POST /auth/basecamp/disconnect ───────────────────────────────────────────
router.post("/disconnect", (req, res) => {
  clearAuth();
  res.json({ ok: true });
});

// ── Utility: attempt a token refresh (best-effort, no retry loop) ─────────────
// Call this from client.js when the stored token is expired.
export async function attemptTokenRefresh() {
  const auth = getAuth();
  if (!auth?.refresh_token) throw new Error("No refresh token stored");

  // TODO: add retry/backoff here for production – for demo it's one attempt
  const newToken = await sdkRefreshToken({
    tokenEndpoint: LAUNCHPAD_TOKEN_ENDPOINT,
    refreshToken: auth.refresh_token,
    clientId: process.env.BASECAMP_CLIENT_ID,
    clientSecret: process.env.BASECAMP_CLIENT_SECRET,
    useLegacyFormat: true,
  });

  const expiresAt = newToken.expiresAt
    ? Math.floor(new Date(newToken.expiresAt).getTime() / 1000)
    : null;

  saveAuth({
    accessToken: newToken.accessToken,
    refreshToken: newToken.refreshToken ?? auth.refresh_token,
    expiresAt,
    accountId: auth.account_id,
    accountName: auth.account_name,
    identityName: auth.identity_name,
    identityEmail: auth.identity_email,
  });

  return newToken.accessToken;
}
