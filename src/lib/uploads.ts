import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { businessCardDir, productImageDir, uploadsDir } from "./paths";
import type { ImageExtension } from "./ingest";

/*
 * Stores an already-validated photo on disk and returns the relative path kept
 * in SQLite (e.g. "products/<uuid>.jpg"). The filename is always a fresh UUID
 * plus an extension chosen from the file's detected type — never anything the
 * visitor supplied.
 */
export type UploadKind = "business-cards" | "products";

export async function storeImage(
  kind: UploadKind,
  bytes: Uint8Array,
  extension: ImageExtension,
): Promise<string> {
  const dir = kind === "business-cards" ? businessCardDir() : productImageDir();
  await fs.mkdir(dir, { recursive: true });

  const filename = `${randomUUID()}${extension}`;
  // `dir` is always under DATA_DIR (see paths.ts): a runtime-only folder that
  // the build must not try to trace or bundle.
  await fs.writeFile(path.join(/* turbopackIgnore: true */ dir, filename), bytes, {
    flag: "wx",
    mode: 0o640,
  });
  return `${kind}/${filename}`;
}

/** Best-effort cleanup of files written for a submission that then failed. */
export async function removeStoredImages(relativePaths: string[]): Promise<void> {
  const root = uploadsDir();
  await Promise.all(
    relativePaths.map((relative) =>
      fs.unlink(path.join(/* turbopackIgnore: true */ root, relative)).catch(() => undefined),
    ),
  );
}
