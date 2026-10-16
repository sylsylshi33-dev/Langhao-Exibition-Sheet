import fs from "node:fs/promises";
import { dataDir } from "./config";

/** Refuse new data (and report unhealthy) when the data volume has less than this free. */
export function minFreeBytes(): number {
  const megabytes = Number(process.env.MIN_FREE_DISK_MB ?? 1024);
  return (Number.isFinite(megabytes) && megabytes >= 0 ? megabytes : 1024) * 1024 * 1024;
}

export async function freeBytes(): Promise<number> {
  const stats = await fs.statfs(dataDir());
  return stats.bavail * stats.bsize;
}

export async function hasFreeSpace(): Promise<boolean> {
  try {
    return (await freeBytes()) >= minFreeBytes();
  } catch {
    return false;
  }
}
