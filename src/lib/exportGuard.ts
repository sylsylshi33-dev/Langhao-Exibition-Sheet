/*
 * Excel and PDF exports hold photos in memory while they are built. One at a
 * time is plenty for a handful of staff, and keeps a double-click (or a second
 * person) from running the small server out of memory.
 */
let running = false;

export async function withExportSlot<T>(task: () => Promise<T>): Promise<T | "busy"> {
  if (running) return "busy";
  running = true;
  try {
    return await task();
  } finally {
    running = false;
  }
}
