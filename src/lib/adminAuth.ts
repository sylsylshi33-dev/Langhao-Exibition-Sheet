/*
 * Very small session scheme for the /admin area — deliberately simple for a
 * single shared staff login on an offline kiosk PC, not a multi-user system.
 *
 * Built only on Web Crypto (`crypto.subtle`) rather than `node:crypto` so
 * this file works unchanged whether it's imported from a Node.js API route
 * or from middleware (which may run in the Edge runtime).
 *
 * The password is never read from user input by exhibition staff — it's set
 * once, in the launcher script, before the PC is handed off. See
 * launcher/README.md.
 */

const COOKIE_NAME = "admin_session";
const DEFAULT_PASSWORD = "langhao2026";

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function checkPassword(password: string): boolean {
  return password === getAdminPassword();
}

export function sessionCookieValue(): Promise<string> {
  return sha256Hex(`exhibition-admin:${getAdminPassword()}`);
}

export async function isValidSessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  return token === (await sessionCookieValue());
}

export { COOKIE_NAME };
