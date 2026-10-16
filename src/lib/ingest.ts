import { REQUEST_TYPES, type RequestType } from "./types";

/*
 * Everything the public submit endpoint accepts from an anonymous visitor
 * is validated here. Nothing from the client is trusted: not the filename,
 * not the declared MIME type, not the field lengths.
 */

export const LIMITS = {
  /** Hard cap on the whole multipart body. Browsers compress photos to well under this. */
  maxRequestBytes: 30 * 1024 * 1024,
  maxFileBytes: 12 * 1024 * 1024,
  maxProductImages: 10,
  maxProductModels: 20,
  maxModelLength: 60,
  maxShortField: 100,
  maxEmail: 254,
  maxPhone: 40,
  maxMessage: 2000,
} as const;

/* ---------- bounded body read ---------- */

/** Reads the request body but gives up as soon as it exceeds `maxBytes` (Content-Length can lie or be absent). */
export async function readBodyLimited(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array | "too_large"> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return "too_large";
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/* ---------- image type detection ---------- */

export type ImageExtension = ".jpg" | ".png" | ".webp" | ".heic";

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "heif"]);

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/** Decides what a file really is from its leading bytes. Returns null for anything that isn't a supported photo. */
export function detectImageType(bytes: Uint8Array): ImageExtension | null {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ".jpg";

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return ".png";
  }

  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return ".webp";

  if (ascii(bytes, 4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(bytes, 8, 12).toLowerCase())) {
    return ".heic";
  }

  return null;
}

/* ---------- text fields ---------- */

export interface ValidatedFields {
  clientSubmissionId: string | null;
  name: string;
  company: string;
  jobTitle: string;
  country: string;
  phone: string;
  email: string;
  wechat: string;
  message: string;
  productModels: string[];
  requestedInformation: RequestType[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBMISSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.replace(CONTROL_CHARS, "").trim() : "";
}

function stringArray(form: FormData, key: string): string[] | null {
  const raw = form.get(key);
  if (raw === null || raw === "") return [];
  if (typeof raw !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) return null;
    return parsed as string[];
  } catch {
    return null;
  }
}

export type FieldsResult =
  | { ok: true; value: ValidatedFields }
  | { ok: false; invalid: string[] };

/**
 * `hasBusinessCard` mirrors the form's own rule: a business card photo alone
 * is enough; otherwise name, company, email and country are all required.
 */
export function validateFields(form: FormData, hasBusinessCard: boolean): FieldsResult {
  const invalid: string[] = [];

  const name = text(form, "name");
  const company = text(form, "company");
  const jobTitle = text(form, "jobTitle");
  const country = text(form, "country");
  const phone = text(form, "phone");
  const email = text(form, "email");
  const wechat = text(form, "wechat");
  const message = text(form, "message");
  const submissionId = text(form, "clientSubmissionId");

  const capped: [string, string, number][] = [
    ["name", name, LIMITS.maxShortField],
    ["company", company, LIMITS.maxShortField],
    ["jobTitle", jobTitle, LIMITS.maxShortField],
    ["country", country, LIMITS.maxShortField],
    ["wechat", wechat, LIMITS.maxShortField],
    ["phone", phone, LIMITS.maxPhone],
    ["email", email, LIMITS.maxEmail],
    ["message", message, LIMITS.maxMessage],
  ];
  for (const [field, value, max] of capped) {
    if (value.length > max) invalid.push(field);
  }

  if (!hasBusinessCard) {
    for (const [field, value] of [
      ["name", name],
      ["company", company],
      ["email", email],
      ["country", country],
    ] as const) {
      if (!value) invalid.push(field);
    }
  }
  if (email && !EMAIL_PATTERN.test(email)) invalid.push("email");

  if (submissionId && !SUBMISSION_ID_PATTERN.test(submissionId)) invalid.push("clientSubmissionId");

  const models = stringArray(form, "productModels");
  let productModels: string[] = [];
  if (models === null || models.length > LIMITS.maxProductModels) {
    invalid.push("productModels");
  } else {
    productModels = [
      ...new Set(models.map((m) => m.replace(CONTROL_CHARS, "").trim()).filter(Boolean)),
    ];
    if (productModels.some((m) => m.length > LIMITS.maxModelLength)) invalid.push("productModels");
  }

  const requested = stringArray(form, "requestedInformation");
  let requestedInformation: RequestType[] = [];
  if (requested === null) {
    invalid.push("requestedInformation");
  } else {
    const allowed = new Set<string>(REQUEST_TYPES);
    if (requested.some((r) => !allowed.has(r))) invalid.push("requestedInformation");
    requestedInformation = [...new Set(requested)].filter((r): r is RequestType => allowed.has(r));
  }

  if (invalid.length > 0) return { ok: false, invalid: [...new Set(invalid)] };

  return {
    ok: true,
    value: {
      clientSubmissionId: submissionId || null,
      name,
      company,
      jobTitle,
      country,
      phone,
      email,
      wechat,
      message,
      productModels,
      requestedInformation,
    },
  };
}
