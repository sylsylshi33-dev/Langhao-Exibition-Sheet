import type { Lead } from "./types";

/** Shown wherever an enquiry has no saved company or contact name (enquiries taken before they were mandatory). */
export const NOT_PROVIDED = "未提供";
/** @deprecated kept for readability at call sites: same text as NOT_PROVIDED. */
export const NAME_NOT_PROVIDED = NOT_PROVIDED;

/** The contact name as entered by the visitor, or the fallback. Never guessed from a card or a filename. */
export function displayName(lead: Pick<Lead, "name">): string {
  return lead.name.trim() || NOT_PROVIDED;
}

/** The company name as entered by the visitor, or the fallback. */
export function displayCompany(lead: Pick<Lead, "company">): string {
  return lead.company.trim() || NOT_PROVIDED;
}

/** Title of an enquiry everywhere in the admin and exports: "Company (Person)". */
export function enquiryTitle(lead: Pick<Lead, "company" | "name">): string {
  return `${displayCompany(lead)} (${displayName(lead)})`;
}
