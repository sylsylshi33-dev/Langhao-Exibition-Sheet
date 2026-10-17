import fs from "node:fs/promises";
import path from "node:path";
import { uploadsDir } from "./paths";

/*
 * Loads stored photos for the Excel and PDF exports.
 *
 * Both formats can only embed JPEG and PNG (the browser re-encodes every photo
 * to JPEG, so that is nearly all of them). Photos are embedded at their stored
 * size, so a total budget keeps one export from growing without bound or
 * exhausting the server's memory; photos past the budget are listed by file
 * name instead, and the export says so.
 */

export interface EmbeddedPhoto {
  kind: "image";
  bytes: Buffer;
  format: "jpeg" | "png";
  width: number;
  height: number;
}

export interface SkippedPhoto {
  kind: "skipped";
  reason: "format" | "budget" | "missing";
  path: string;
}

export type LoadedPhoto = EmbeddedPhoto | SkippedPhoto;

/** Total bytes of photos one export may embed (EXPORT_MAX_IMAGE_MB, default 60). */
export function exportImageBudgetBytes(): number {
  const mb = Number(process.env.EXPORT_MAX_IMAGE_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 60) * 1024 * 1024;
}

/** Reads width/height from JPEG (SOF marker) or PNG (IHDR) bytes; null if unreadable. */
export function imageSize(bytes: Uint8Array): { format: "jpeg" | "png"; width: number; height: number } | null {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    return width > 0 && height > 0 ? { format: "png", width, height } : null;
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const length = (bytes[i + 2] << 8) | bytes[i + 3];
      // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const height = (bytes[i + 5] << 8) | bytes[i + 6];
        const width = (bytes[i + 7] << 8) | bytes[i + 8];
        return width > 0 && height > 0 ? { format: "jpeg", width, height } : null;
      }
      i += 2 + length;
    }
  }
  return null;
}

export class PhotoLoader {
  private used = 0;
  skipped = 0;
  embedded = 0;

  constructor(private readonly budget = exportImageBudgetBytes()) {}

  async load(relative: string): Promise<LoadedPhoto> {
    const root = uploadsDir();
    const full = path.resolve(/* turbopackIgnore: true */ root, relative);
    // Paths come from our own database, but never read outside the uploads folder regardless.
    if (!full.startsWith(root + path.sep)) return this.skip("missing", relative);

    let bytes: Buffer;
    try {
      bytes = await fs.readFile(full);
    } catch {
      return this.skip("missing", relative);
    }
    const size = imageSize(bytes);
    if (!size) return this.skip("format", relative);
    if (this.used + bytes.length > this.budget) return this.skip("budget", relative);

    this.used += bytes.length;
    this.embedded++;
    return { kind: "image", bytes, ...size };
  }

  private skip(reason: SkippedPhoto["reason"], relative: string): SkippedPhoto {
    this.skipped++;
    return { kind: "skipped", reason, path: relative };
  }
}

export function skippedLabel(photo: SkippedPhoto): string {
  const name = photo.path.split("/").pop() ?? photo.path;
  if (photo.reason === "budget") return `未嵌入（超出导出体积上限）：${name}`;
  if (photo.reason === "format") return `未嵌入（格式不支持）：${name}`;
  return `文件缺失：${name}`;
}
