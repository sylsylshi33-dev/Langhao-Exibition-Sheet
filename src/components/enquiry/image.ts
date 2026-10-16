/*
 * Client-side photo preparation.
 *
 * Phone photos are 3-10 MB each. Over a mobile network into mainland China
 * that is the difference between a submission that finishes and one that
 * stalls, so every photo is downscaled and re-encoded as JPEG in the browser
 * before upload. If anything goes wrong (unsupported format, no canvas) the
 * original file is used unchanged — the server accepts it too.
 */

export const MAX_PRODUCT_PHOTOS = 10;

const MAX_PHOTO_EDGE = 1600;
// Business cards carry small print, so keep more resolution.
const MAX_CARD_EDGE = 2000;
const JPEG_QUALITY = 0.82;

const SERVER_ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

function decode(file: Blob): Promise<{ image: HTMLImageElement; release: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, release: () => URL.revokeObjectURL(url) });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    image.src = url;
  });
}

export async function prepareImage(file: File, kind: "card" | "photo"): Promise<File> {
  try {
    if (file.size === 0) return file;
    const maxEdge = kind === "card" ? MAX_CARD_EDGE : MAX_PHOTO_EDGE;

    const { image, release } = await decode(file);
    try {
      const { naturalWidth: w, naturalHeight: h } = image;
      if (!w || !h) return file;

      const scale = Math.min(1, maxEdge / Math.max(w, h));
      const width = Math.max(1, Math.round(w * scale));
      const height = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return file;

      context.fillStyle = "#ffffff"; // JPEG has no alpha
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
      );
      if (!blob || blob.size === 0) return file;

      // Don't make an already-small, already-supported file bigger.
      if (scale === 1 && blob.size >= file.size && SERVER_ACCEPTED.has(file.type)) return file;

      const base = file.name.replace(/\.[^.]+$/, "") || "photo";
      return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
    } finally {
      release();
    }
  } catch {
    return file;
  }
}
