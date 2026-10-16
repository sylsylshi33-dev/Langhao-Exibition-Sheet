/*
 * Submitting a lead from a phone on a possibly poor network.
 *
 * - XMLHttpRequest (not fetch) so we can report upload progress.
 * - A transfer is abandoned only if it makes NO progress for a while, so a
 *   slow-but-moving upload isn't killed by a fixed timeout.
 * - Network errors and 5xx responses are retried automatically. That is safe
 *   because every attempt carries the same clientSubmissionId and the server
 *   treats a repeated id as the same submission.
 */

/** 32 hex chars. Uses getRandomValues, which (unlike randomUUID) works on plain HTTP too. */
export function newClientId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface LeadResponse {
  ok?: boolean;
  id?: string;
  reference?: string;
  error?: string;
  fields?: string[];
}

export type PostResult =
  | { kind: "response"; status: number; body: LeadResponse | null; retryAfterSeconds: number | null }
  | { kind: "network" };

const STALL_TIMEOUT_MS = 45_000;
const RETRY_DELAYS_MS = [1_500, 4_000];

function sendOnce(
  formData: FormData,
  onProgress: (fraction: number) => void,
): Promise<PostResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let stallTimer: ReturnType<typeof setTimeout> | undefined;

    const armStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => xhr.abort(), STALL_TIMEOUT_MS);
    };
    const done = (result: PostResult) => {
      if (stallTimer) clearTimeout(stallTimer);
      resolve(result);
    };

    xhr.open("POST", "/api/leads");
    xhr.responseType = "text";

    xhr.upload.onprogress = (event) => {
      armStallTimer();
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: LeadResponse | null = null;
      try {
        body = JSON.parse(xhr.responseText) as LeadResponse;
      } catch {
        body = null;
      }
      const retryAfter = Number(xhr.getResponseHeader("Retry-After"));
      done({
        kind: "response",
        status: xhr.status,
        body,
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
      });
    };
    xhr.onerror = () => done({ kind: "network" });
    xhr.onabort = () => done({ kind: "network" });
    xhr.ontimeout = () => done({ kind: "network" });

    armStallTimer();
    xhr.send(formData);
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function postLead(
  formData: FormData,
  onProgress: (fraction: number) => void,
): Promise<PostResult> {
  let result: PostResult = { kind: "network" };

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    onProgress(0);
    result = await sendOnce(formData, onProgress);

    const retryable =
      result.kind === "network" || (result.kind === "response" && result.status >= 500);
    if (!retryable || attempt === RETRY_DELAYS_MS.length) break;

    await sleep(RETRY_DELAYS_MS[attempt]);
  }
  return result;
}
