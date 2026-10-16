import { NextRequest, NextResponse } from "next/server";
import { listLeads } from "@/lib/db";
import { requireAdminApi } from "@/lib/adminSession";

export async function GET(request: NextRequest) {
  const denied = requireAdminApi(request);
  if (denied) return denied;

  return NextResponse.json({ leads: listLeads() });
}
