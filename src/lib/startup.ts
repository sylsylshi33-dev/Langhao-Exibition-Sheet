import fs from "node:fs";
import path from "node:path";
import { readAdminConfig } from "./adminAuth";
import { dataDir } from "./config";
import { SCHEMA_VERSION, getDb } from "./db";
import { businessCardDir, productImageDir } from "./paths";

/**
 * Fail-fast checks run once when the server boots (see src/instrumentation.ts).
 * A misconfigured data directory should stop the service immediately and loudly
 * — not surface later as a failed visitor submission.
 */
export function runStartupChecks(): void {
  const dir = dataDir();

  fs.mkdirSync(businessCardDir(), { recursive: true });
  fs.mkdirSync(productImageDir(), { recursive: true });

  const probe = path.join(dir, `.write-test-${process.pid}`);
  fs.writeFileSync(probe, "ok");
  fs.unlinkSync(probe);

  getDb(); // opens the database and applies any pending migrations

  const admin = readAdminConfig();
  console.log(
    `[startup] data dir: ${dir} | schema v${SCHEMA_VERSION} | admin: ` +
      (admin.ok ? "enabled" : `DISABLED (ADMIN_PASSWORD ${admin.reason === "missing" ? "not set" : "too short"})`),
  );
}

/**
 * Next.js logs an error thrown during startup but keeps serving, so in
 * production we exit explicitly: systemd then reports the failure and the
 * deploy script's health check rolls back.
 */
export function runStartupChecksOrExit(): void {
  try {
    runStartupChecks();
  } catch (err) {
    console.error("[startup] FATAL:", err instanceof Error ? err.message : err);
    if (process.env.NODE_ENV === "production") process.exit(1);
    throw err;
  }
}
