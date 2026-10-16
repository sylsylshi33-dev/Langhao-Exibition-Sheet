import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { uploadsDir } from "@/lib/paths";
import { requireAdminApi } from "@/lib/adminSession";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
};

/*
 * Serves a saved photo from DATA_DIR/uploads. Behind the admin login because
 * these images can contain visitors' personal information. Only files with an
 * image extension inside the uploads folder are ever served.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const denied = requireAdminApi(request);
  if (denied) return denied;

  const { path: segments } = await params;
  const root = uploadsDir();
  const filePath = path.resolve(/* turbopackIgnore: true */ root, ...segments);

  // Must stay strictly inside the uploads folder (trailing separator matters:
  // "/data/uploads-x" must not pass a prefix test for "/data/uploads").
  if (!filePath.startsWith(root + path.sep)) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }

  const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()];
  if (!contentType) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const bytes = await fs.readFile(filePath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
