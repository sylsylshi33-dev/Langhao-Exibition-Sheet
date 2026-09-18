import { NextRequest, NextResponse } from "next/server";
import { checkPassword, sessionCookieValue, COOKIE_NAME } from "@/lib/adminAuth";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  const password = body?.password ?? "";

  if (!checkPassword(password)) {
    return NextResponse.json({ ok: false, error: "wrong_password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, await sessionCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
