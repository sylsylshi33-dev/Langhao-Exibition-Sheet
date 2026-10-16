/*
 * Runs once when the Next.js server starts (not during `next build`).
 *
 * A misconfigured data directory or an incompatible database must stop the
 * service immediately and loudly — see runStartupChecks() in lib/startup.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { runStartupChecksOrExit } = await import("./lib/startup");
  runStartupChecksOrExit();
}
