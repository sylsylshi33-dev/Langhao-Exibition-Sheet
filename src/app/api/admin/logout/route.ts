import { NextRequest, NextResponse } from "next/server";
import { isHttpsRequest, readSessionToken } from "@/lib/adminAuth";
import { clearSessionCookies, destroySession } from "@/lib/adminSession";

/* Deliberately usable with an invalid or expired session: it only ever
   removes a session and clears cookies, and never reveals data. */
export async function POST(request: NextRequest) {
  const secure = isHttpsRequest(request.headers);
  const token = readSessionToken(request.cookies, secure);
  if (token) destroySession(token);

  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response, secure);
  return response;
}
