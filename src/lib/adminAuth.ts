/*
 * Admin authentication — configuration, cookie naming and token format.
 *
 * This file is deliberately free of database and Node-only imports so the
 * proxy (src/proxy.ts) can use it for its cheap, optimistic gate. The
 * authoritative checks live in ./adminSession.ts and run inside every admin
 * page and API handler.
 *
 * There is NO default password. If ADMIN_PASSWORD is missing or too short the
 * admin area is disabled; the visitor form keeps working.
 */

export const MIN_PASSWORD_LENGTH = 12;

/** Absolute session lifetime. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

/** Over HTTPS the `__Host-` prefix makes the browser enforce Secure + Path=/ + no Domain. */
export const SESSION_COOKIE_SECURE = "__Host-admin_session";
export const SESSION_COOKIE_PLAIN = "admin_session";

/** 32 random bytes, base64url-encoded. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type AdminConfig =
  | { ok: true; password: string }
  | { ok: false; reason: "missing" | "too_short" };

export function readAdminConfig(): AdminConfig {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return { ok: false, reason: "missing" };
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: "too_short" };
  return { ok: true, password };
}

/**
 * True when the visitor reached us over HTTPS. Behind a TLS-terminating
 * reverse proxy the app itself only sees HTTP, so the proxy's
 * X-Forwarded-Proto header is the signal. The app port must not be publicly
 * reachable (bind to 127.0.0.1), otherwise this header could be spoofed —
 * the worst a spoof can do here is set a Secure flag, which is harmless.
 */
export function isHttpsRequest(headers: { get(name: string): string | null }): boolean {
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return proto === "https";
}

export function sessionCookieName(secure: boolean): string {
  return secure ? SESSION_COOKIE_SECURE : SESSION_COOKIE_PLAIN;
}

/** Returns the cookie value only if it is well-formed for this protocol. */
export function readSessionToken(
  cookies: { get(name: string): { value: string } | undefined },
  secure: boolean,
): string | undefined {
  const value = cookies.get(sessionCookieName(secure))?.value;
  return value && TOKEN_PATTERN.test(value) ? value : undefined;
}
