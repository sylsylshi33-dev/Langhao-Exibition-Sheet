import { NextRequest, NextResponse } from "next/server";
import { isHttpsRequest, readSessionToken } from "@/lib/adminAuth";

/*
 * First, cheap gate for /admin pages and /api/admin/*: rejects requests that
 * carry no well-formed session cookie, so anonymous traffic never reaches
 * the app. This is only an OPTIMISTIC check (Next.js guidance: no database
 * work in Proxy). The authoritative check — does this token exist in the
 * session table and is it unexpired — is repeated inside every admin page
 * and handler via requireAdminPage() / requireAdminApi().
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login" || pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  const token = readSessionToken(request.cookies, isHttpsRequest(request.headers));
  if (token) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
