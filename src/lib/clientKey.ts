/**
 * Identifies the client for rate limiting. Behind our own reverse proxy the
 * LAST X-Forwarded-For entry is the address the proxy saw; earlier entries
 * are client-supplied and untrusted. With no proxy header (local/offline
 * use) everything shares the key "direct".
 *
 * This is only meaningful while the app port is bound to 127.0.0.1 behind
 * exactly one trusted proxy — see docs/DEPLOYMENT.md.
 */
export function clientKeyFrom(h: { get(name: string): string | null }): string {
  const last = h.get("x-forwarded-for")?.split(",").pop()?.trim();
  const raw = last || h.get("x-real-ip")?.trim() || "direct";
  return raw.slice(0, 64);
}
