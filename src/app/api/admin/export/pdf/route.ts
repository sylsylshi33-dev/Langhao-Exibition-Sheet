import { NextRequest, NextResponse } from "next/server";
import { listLeads } from "@/lib/db";
import { requireAdminApi } from "@/lib/adminSession";
import { withExportSlot } from "@/lib/exportGuard";
import { buildPdf } from "@/lib/exportPdf";
import { formatBeijing } from "@/lib/time";

// Exports every enquiry (the dashboard has no filters), photos embedded.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = requireAdminApi(request);
  if (denied) return denied;

  try {
    const result = await withExportSlot(() => buildPdf(listLeads()));
    if (result === "busy") {
      return NextResponse.json(
        { error: "busy" },
        { status: 429, headers: { "Retry-After": "15", "Cache-Control": "no-store" } },
      );
    }
    const stamp = formatBeijing(new Date().toISOString()).slice(0, 10);
    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="leads-${stamp}.pdf"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Export-Photos-Embedded": String(result.embedded),
        "X-Export-Photos-Skipped": String(result.skipped),
      },
    });
  } catch (err) {
    console.error("[export pdf] failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "export_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
