import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { BUSINESS_CARD_DIR, PRODUCT_IMAGE_DIR } from "./paths";

/*
 * Saves an uploaded photo to disk and returns the relative path stored in
 * SQLite (e.g. "business-cards/<uuid>.jpg"). Keeping files on disk instead
 * of in the database keeps the database small and lets the images be
 * viewed with a normal file browser if ever needed.
 */
async function saveFile(dir: string, prefix: string, file: File): Promise<string> {
  // `dir` always resolves under data/uploads (see paths.ts) — it's just a
  // runtime folder we write into, not something the build needs to trace or
  // bundle, so tell Turbopack not to pull the whole project in trying to.
  await fs.mkdir(dir, { recursive: true });

  const ext = path.extname(file.name) || guessExtension(file.type);
  const filename = `${randomUUID()}${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(/* turbopackIgnore: true */ dir, filename), bytes);

  return `${prefix}/${filename}`;
}

function guessExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/heic":
      return ".heic";
    default:
      return ".jpg";
  }
}

export function saveBusinessCard(file: File): Promise<string> {
  return saveFile(BUSINESS_CARD_DIR, "business-cards", file);
}

export function saveProductImage(file: File): Promise<string> {
  return saveFile(PRODUCT_IMAGE_DIR, "products", file);
}
