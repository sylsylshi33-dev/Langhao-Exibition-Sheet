import { NextRequest, NextResponse } from "next/server";
import { clientKeyFrom } from "@/lib/clientKey";
import { hasFreeSpace } from "@/lib/disk";
import { DuplicateSubmissionError, findLeadBySubmissionId, insertLead } from "@/lib/db";
import {
  LIMITS,
  detectImageType,
  readBodyLimited,
  validateFields,
  type ImageExtension,
} from "@/lib/ingest";
import { takeSubmissionSlot } from "@/lib/throttle";
import { removeStoredImages, storeImage } from "@/lib/uploads";

/*
 * Public endpoint the visitor form posts to. No login — anyone with the QR
 * code can submit — so it validates and bounds everything itself:
 * rate limit → size cap → field validation → image type check → store → insert.
 * Nothing is written to disk until every part of the submission has passed.
 */

const noStore = { "Cache-Control": "no-store" };

function fail(status: number, error: string, extra: Record<string, unknown> = {}, headers = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status, headers: { ...noStore, ...headers } });
}

export async function POST(request: NextRequest) {
  const gate = takeSubmissionSlot(clientKeyFrom(request.headers));
  if (!gate.allowed) {
    return fail(429, "rate_limited", {}, { "Retry-After": String(gate.retryAfterSeconds) });
  }

  // Never let anonymous uploads fill the disk the database lives on.
  if (!(await hasFreeSpace())) {
    console.error("[leads] refusing submission: data volume is below the free-space threshold");
    return fail(503, "storage_unavailable", {}, { "Retry-After": "300" });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return fail(415, "unsupported_media_type");
  }
  if (Number(request.headers.get("content-length") ?? 0) > LIMITS.maxRequestBytes) {
    return fail(413, "too_large");
  }

  const body = await readBodyLimited(request, LIMITS.maxRequestBytes);
  if (body === "too_large") return fail(413, "too_large");

  let form: FormData;
  try {
    form = await new Response(body as unknown as BodyInit, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    return fail(400, "invalid_body");
  }

  // ----- gather and check every file before touching the disk -----
  const cardEntry = form.get("businessCard");
  const cardFile = cardEntry instanceof File && cardEntry.size > 0 ? cardEntry : null;
  const productFiles = form
    .getAll("productImages")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (productFiles.length > LIMITS.maxProductImages) {
    return fail(400, "too_many_images", { max: LIMITS.maxProductImages });
  }

  const fields = validateFields(form, cardFile !== null);
  if (!fields.ok) return fail(400, "validation", { fields: fields.invalid });

  // Idempotency: a retried request (the first response was lost) must not create a second lead.
  if (fields.value.clientSubmissionId) {
    const existing = findLeadBySubmissionId(fields.value.clientSubmissionId);
    if (existing) {
      return NextResponse.json(
        { ok: true, id: existing.id, reference: existing.reference, duplicate: true },
        { headers: noStore },
      );
    }
  }

  const prepared: { kind: "business-cards" | "products"; bytes: Uint8Array; extension: ImageExtension }[] = [];
  for (const [kind, file] of [
    ...(cardFile ? [["business-cards", cardFile] as const] : []),
    ...productFiles.map((f) => ["products", f] as const),
  ]) {
    if (file.size > LIMITS.maxFileBytes) return fail(413, "file_too_large");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = detectImageType(bytes);
    if (!extension) return fail(400, "invalid_file_type");
    prepared.push({ kind, bytes, extension });
  }

  // ----- write files, then the row; undo the files if anything fails -----
  const written: string[] = [];
  try {
    for (const item of prepared) {
      written.push(await storeImage(item.kind, item.bytes, item.extension));
    }

    const cardPath = cardFile ? written[0] : null;
    const productPaths = cardFile ? written.slice(1) : written;

    const lead = insertLead({
      ...fields.value,
      businessCardPath: cardPath,
      productImagePaths: productPaths,
    });
    return NextResponse.json({ ok: true, id: lead.id, reference: lead.reference }, { headers: noStore });
  } catch (err) {
    await removeStoredImages(written);

    if (err instanceof DuplicateSubmissionError && fields.value.clientSubmissionId) {
      const existing = findLeadBySubmissionId(fields.value.clientSubmissionId);
      if (existing) {
        return NextResponse.json(
          { ok: true, id: existing.id, reference: existing.reference, duplicate: true },
          { headers: noStore },
        );
      }
    }
    console.error("[leads] save failed:", err instanceof Error ? err.message : "unknown error");
    return fail(500, "save_failed");
  }
}
