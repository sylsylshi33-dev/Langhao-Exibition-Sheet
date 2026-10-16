import { NextResponse } from "next/server";
import { readAdminConfig } from "@/lib/adminAuth";
import { freeBytes, minFreeBytes } from "@/lib/disk";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/*
 * Liveness + readiness for uptime monitors and the deploy script. Public, so
 * it reports only which checks failed — never paths, sizes or versions.
 *   200 {"status":"ok"}                       everything fine
 *   503 {"status":"degraded","failed":[...]}  something needs attention
 */
export async function GET() {
  const failed: string[] = [];

  try {
    getDb().prepare("SELECT 1").get();
  } catch {
    failed.push("database");
  }

  try {
    if ((await freeBytes()) < minFreeBytes()) failed.push("disk_space");
  } catch {
    failed.push("data_dir");
  }

  if (!readAdminConfig().ok) failed.push("admin_config");

  const headers = { "Cache-Control": "no-store" };
  if (failed.length === 0) return NextResponse.json({ status: "ok" }, { headers });
  return NextResponse.json({ status: "degraded", failed }, { status: 503, headers });
}
