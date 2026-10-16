import { NextRequest, NextResponse } from "next/server";
import { isHttpsRequest, readAdminConfig } from "@/lib/adminAuth";
import {
  checkLoginAllowed,
  clearLoginFailures,
  clearSessionCookies,
  clientKeyFrom,
  createSession,
  passwordMatches,
  recordLoginFailure,
  setSessionCookie,
} from "@/lib/adminSession";

const MAX_BODY_BYTES = 4096;
let warnedNotConfigured = false;

export async function POST(request: NextRequest) {
  const config = readAdminConfig();
  if (!config.ok) {
    if (!warnedNotConfigured) {
      warnedNotConfigured = true;
      console.error(
        `[admin] ADMIN_PASSWORD is ${config.reason === "missing" ? "not set" : "too short"}; ` +
          "the admin area is disabled until a strong password (12+ characters) is configured.",
      );
    }
    return NextResponse.json({ ok: false, error: "admin_not_configured" }, { status: 503 });
  }

  const clientKey = clientKeyFrom(request.headers);
  const gate = checkLoginAllowed(clientKey);
  if (!gate.allowed) {
    return NextResponse.json(
      { ok: false, error: "too_many_attempts" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSeconds) } },
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";

  if (!passwordMatches(password, config.password)) {
    recordLoginFailure(clientKey);
    console.warn(`[admin] failed login from ${clientKey}`);
    return NextResponse.json({ ok: false, error: "wrong_password" }, { status: 401 });
  }

  clearLoginFailures(clientKey);
  const secure = isHttpsRequest(request.headers);
  const response = NextResponse.json({ ok: true });
  // Drop any cookie left over from older builds before setting the new one.
  clearSessionCookies(response, secure);
  setSessionCookie(response, createSession(config.password), secure);
  return response;
}
