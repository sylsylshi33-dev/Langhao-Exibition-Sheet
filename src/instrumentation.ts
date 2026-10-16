/*
 * Runs once when the Next.js server starts (not during `next build`).
 *
 * A misconfigured data directory or an incompatible database must stop the
 * service immediately and loudly. Next.js logs an error thrown from here but
 * keeps serving, so in production we exit explicitly: systemd then reports
 * the failure and the deploy script's health check rolls back.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { runStartupChecks } = await import("./lib/startup");
  try {
    runStartupChecks();
  } catch (err) {
    console.error("[startup] FATAL:", err instanceof Error ? err.message : err);
    if (process.env.NODE_ENV === "production") process.exit(1);
    throw err;
  }
}
