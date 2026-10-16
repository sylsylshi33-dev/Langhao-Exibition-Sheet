import path from "node:path";

/*
 * Where leads and photos live.
 *
 * Production MUST set DATA_DIR to an absolute path that is outside the
 * release directory (e.g. /var/lib/langhao), so deploying a new build can
 * never replace or delete visitor data. In development it falls back to
 * ./data in the project folder.
 */
let cachedDataDir: string | undefined;

export function dataDir(): string {
  if (cachedDataDir) return cachedDataDir;

  const configured = process.env.DATA_DIR?.trim();
  if (configured) {
    if (!path.isAbsolute(configured)) {
      throw new Error(`DATA_DIR must be an absolute path (got "${configured}").`);
    }
    cachedDataDir = path.resolve(configured);
  } else if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATA_DIR is not set. Set it to an absolute directory outside the release folder " +
        "(for example /var/lib/langhao) so deployments cannot overwrite visitor data.",
    );
  } else {
    cachedDataDir = path.join(process.cwd(), "data");
  }
  return cachedDataDir;
}
