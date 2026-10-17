/*
 * CSV cells are visitor-controlled, and staff open this file in Excel. A cell
 * that starts with = + - @ (or a tab/CR) is interpreted as a formula there, so
 * such cells are prefixed with an apostrophe to force plain text. Ordinary
 * phone numbers like "+86 138 0013 8000" are left alone.
 */
const PLAIN_PHONE = /^\+?[\d\s().-]+$/;

export function neutralizeFormula(value: string): string {
  if (/^[=+\-@\t\r]/.test(value) && !PLAIN_PHONE.test(value)) return `'${value}`;
  return value;
}

export function csvCell(value: string): string {
  const safe = neutralizeFormula(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
