import { getDb } from "./db";

/*
 * Rate limiting for the PUBLIC submit endpoint. Limits are generous because
 * many exhibition visitors can share one public IP (venue Wi-Fi, mobile
 * carrier NAT); they exist to stop floods and scripted abuse, not to police
 * normal use. State lives in SQLite so it survives restarts.
 */
const WINDOW_SECONDS = 10 * 60;
const MAX_PER_CLIENT = 60;
const MAX_GLOBAL = 300;

export type SubmissionGate = { allowed: true } | { allowed: false; retryAfterSeconds: number };

function wait(timestamps: number[], limit: number, now: number): number {
  if (timestamps.length < limit) return 0;
  return Math.max(1, timestamps[timestamps.length - limit] + WINDOW_SECONDS - now);
}

/** Records this attempt and says whether it may proceed. */
export function takeSubmissionSlot(clientKey: string): SubmissionGate {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare("DELETE FROM rate_events WHERE kind = 'submit' AND at <= ?").run(now - WINDOW_SECONDS);

  const mine = (
    db
      .prepare("SELECT at FROM rate_events WHERE kind = 'submit' AND client_key = ? ORDER BY at ASC")
      .all(clientKey) as unknown as { at: number }[]
  ).map((r) => r.at);
  const all = (
    db
      .prepare("SELECT at FROM rate_events WHERE kind = 'submit' ORDER BY at ASC")
      .all() as unknown as { at: number }[]
  ).map((r) => r.at);

  const retry = Math.max(wait(mine, MAX_PER_CLIENT, now), wait(all, MAX_GLOBAL, now));
  if (retry > 0) return { allowed: false, retryAfterSeconds: retry };

  db.prepare("INSERT INTO rate_events (kind, client_key, at) VALUES ('submit', ?, ?)").run(
    clientKey,
    now,
  );
  return { allowed: true };
}
