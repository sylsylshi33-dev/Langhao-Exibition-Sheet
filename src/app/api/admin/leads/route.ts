import { NextResponse } from "next/server";
import { listLeads } from "@/lib/db";

/* Auth is enforced by src/middleware.ts for the whole /api/admin/* prefix. */
export async function GET() {
  return NextResponse.json({ leads: listLeads() });
}
