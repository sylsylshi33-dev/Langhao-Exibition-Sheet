/*
 * The exhibition runs on Beijing time but the server (EC2) runs on UTC, and
 * pages are rendered server-side — so always format with an explicit zone.
 */
const TIME_ZONE = "Asia/Shanghai";

const formatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** "2026-10-16 18:03:58" in Beijing time. Returns the input if it isn't a valid date. */
export function formatBeijing(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : formatter.format(date);
}

/** "20261016" in Beijing time. */
export function beijingDateStamp(date: Date): string {
  return formatBeijing(date.toISOString()).slice(0, 10).replace(/-/g, "");
}
