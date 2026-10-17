import type { Lead } from "./types";

/** Shown wherever an enquiry has no saved contact name (enquiries taken before the name became mandatory). */
export const NAME_NOT_PROVIDED = "未提供";

/** The contact name as entered by the visitor, or the fallback. Never guessed from a card or a filename. */
export function displayName(lead: Pick<Lead, "name">): string {
  return lead.name.trim() || NAME_NOT_PROVIDED;
}
