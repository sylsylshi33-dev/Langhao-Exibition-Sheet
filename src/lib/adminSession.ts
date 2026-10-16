/*
 * Authoritative admin authentication: server-side sessions, login throttling
 * and the guards every admin page / API handler must call.
 *
 * State lives in the same SQLite database as the leads (tables created in
 * ./db.ts), so it survives restarts and needs no extra service on a
 * single-instance deployment.
 *
 * Server-only: imports node:crypto, next/headers and the database.
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "./db";
import {
  SESSION_COOKIE_PLAIN,
  SESSION_COOKIE_SECURE,
  SESSION_MAX_AGE_SECONDS,
  isHttpsRequest,
  readAdminConfig,
  readSessionToken,
  sessionCookieName,
} from "./adminAuth";

const nowSeconds = () => Math.floor(Date.now() / 1000);
const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");

/* ---------- password comparison ---------- */

/** Constant-time comparison (both sides hashed first so lengths match). */
export function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/* ---------- small key/value store ---------- */

function getMeta(key: string): string | undefined {
  const row = getDb().prepare("SELECT value FROM admin_meta WHERE key = ?").get(key) as unknown as
    | { value: string }
    | undefined;
  return row?.value;
}

function setMeta(key: string, value: string): void {
  getDb().prepare(
    "INSERT INTO admin_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

/* ---------- password rotation invalidates sessions ---------- */

let passwordMarkerChecked = false;

/**
 * The first time a process uses the current ADMIN_PASSWORD, compare a scrypt
 * fingerprint of it with the one stored in the database. If the password was
 * changed, every existing session is deleted. (Only the slow, salted
 * fingerprint is stored — never the password or a fast hash of it.)
 */
function ensurePasswordMarker(password: string): void {
  if (passwordMarkerChecked) return;

  let salt = getMeta("pw_salt");
  if (!salt) {
    salt = randomBytes(16).toString("hex");
    setMeta("pw_salt", salt);
  }
  const fingerprint = scryptSync(password, Buffer.from(salt, "hex"), 32).toString("hex");

  if (getMeta("pw_check") !== fingerprint) {
    getDb().exec("DELETE FROM admin_sessions");
    setMeta("pw_check", fingerprint);
  }
  passwordMarkerChecked = true;
}

/* ---------- sessions ---------- */

/** Creates a session and returns the raw token for the cookie. Only its hash is stored. */
export function createSession(password: string): string {
  ensurePasswordMarker(password);
  const now = nowSeconds();
  getDb().prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").run(now);

  const token = randomBytes(32).toString("base64url");
  getDb().prepare("INSERT INTO admin_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)").run(
    sha256Hex(token),
    now,
    now + SESSION_MAX_AGE_SECONDS,
  );
  return token;
}

export function verifySession(token: string | undefined): boolean {
  if (!token) return false;

  // If the password is not (or no longer) configured, nothing is valid.
  const config = readAdminConfig();
  if (!config.ok) return false;
  ensurePasswordMarker(config.password);

  const row = getDb()
    .prepare("SELECT expires_at FROM admin_sessions WHERE token_hash = ?")
    .get(sha256Hex(token)) as unknown as { expires_at: number } | undefined;
  return !!row && row.expires_at > nowSeconds();
}

export function destroySession(token: string): void {
  getDb().prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(sha256Hex(token));
}

/* ---------- login throttling ---------- */

const FAILURE_WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES_PER_CLIENT = 5;
/** Backstop in case the per-client key can be rotated (e.g. spoofed headers). */
const MAX_FAILURES_GLOBAL = 60;

export type LoginGate = { allowed: true } | { allowed: false; retryAfterSeconds: number };

function secondsUntilUnblocked(failedAt: number[], limit: number, now: number): number {
  if (failedAt.length < limit) return 0;
  const unblockAt = failedAt[failedAt.length - limit] + FAILURE_WINDOW_SECONDS;
  return Math.max(1, unblockAt - now);
}

export function checkLoginAllowed(clientKey: string): LoginGate {
  const now = nowSeconds();
  getDb().prepare("DELETE FROM admin_login_failures WHERE failed_at <= ?").run(
    now - FAILURE_WINDOW_SECONDS,
  );

  const mine = (
    getDb()
      .prepare("SELECT failed_at FROM admin_login_failures WHERE client_key = ? ORDER BY failed_at ASC")
      .all(clientKey) as unknown as { failed_at: number }[]
  ).map((r) => r.failed_at);
  const all = (
    getDb()
      .prepare("SELECT failed_at FROM admin_login_failures ORDER BY failed_at ASC")
      .all() as unknown as { failed_at: number }[]
  ).map((r) => r.failed_at);

  const wait = Math.max(
    secondsUntilUnblocked(mine, MAX_FAILURES_PER_CLIENT, now),
    secondsUntilUnblocked(all, MAX_FAILURES_GLOBAL, now),
  );
  return wait > 0 ? { allowed: false, retryAfterSeconds: wait } : { allowed: true };
}

export function recordLoginFailure(clientKey: string): void {
  getDb().prepare("INSERT INTO admin_login_failures (client_key, failed_at) VALUES (?, ?)").run(
    clientKey,
    nowSeconds(),
  );
}

export function clearLoginFailures(clientKey: string): void {
  getDb().prepare("DELETE FROM admin_login_failures WHERE client_key = ?").run(clientKey);
}

/* ---------- cookies ---------- */

export function setSessionCookie(response: NextResponse, token: string, secure: boolean): void {
  response.cookies.set(sessionCookieName(secure), token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Expires the session cookie. Also expires the plain name, which older builds used. */
export function clearSessionCookies(response: NextResponse, secure: boolean): void {
  response.cookies.set(SESSION_COOKIE_PLAIN, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  if (secure) {
    response.cookies.set(SESSION_COOKIE_SECURE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 0,
    });
  }
}

/* ---------- guards (call from every admin page and handler) ---------- */

/** For Server Component pages: redirects to the login page when not signed in. */
export async function requireAdminPage(): Promise<void> {
  const [h, c] = await Promise.all([headers(), cookies()]);
  if (!verifySession(readSessionToken(c, isHttpsRequest(h)))) {
    redirect("/admin/login");
  }
}

/** For route handlers: returns a 401 response to send, or null when signed in. */
export function requireAdminApi(request: NextRequest): NextResponse | null {
  const token = readSessionToken(request.cookies, isHttpsRequest(request.headers));
  if (verifySession(token)) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
