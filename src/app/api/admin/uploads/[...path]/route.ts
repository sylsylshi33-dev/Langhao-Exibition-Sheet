import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { UPLOADS_DIR } from "@/lib/paths";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

/* Serves a saved photo from data/uploads/. Behind the admin login (see
   middleware) since these can contain visitors' personal information. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const safeSegments = segments.filter((s) => s && s !== "." && s !== "..");
  const filePath = path.join(UPLOADS_DIR, ...safeSegments);

  if (!filePath.startsWith(UPLOADS_DIR)) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }

  try {
    const bytes = await fs.readFile(filePath);
    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=31536000" },
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
