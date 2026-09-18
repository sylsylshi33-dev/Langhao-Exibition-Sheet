import { NextRequest, NextResponse } from "next/server";
import { getLead, updateLeadStatus } from "@/lib/db";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = getLead(id);
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ lead });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { status?: string } | null;

  if (!body?.status || !LEAD_STATUSES.includes(body.status as LeadStatus)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const lead = updateLeadStatus(id, body.status as LeadStatus);
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ lead });
}
