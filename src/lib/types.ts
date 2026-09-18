/*
 * Shared types for the lead-capture app.
 *
 * `LeadDraft` is what the customer-facing form builds up in the browser while
 * the visitor clicks through the steps. On submit it's sent to /api/leads,
 * which saves the photos to disk and writes a `Lead` row to the local
 * SQLite database (see src/lib/db.ts).
 */

export type LeadStatus = "新线索" | "已联系" | "已报价" | "已成交" | "已流失";

export const LEAD_STATUSES: LeadStatus[] = [
  "新线索",
  "已联系",
  "已报价",
  "已成交",
  "已流失",
];

/*
 * `RequestType` values double as the stable key we would store in the
 * database. Display text for each language lives in the i18n bundle
 * (`STRINGS[lang].requestOptions`), keyed by these same values.
 */
export type RequestType = "产品资料" | "报价" | "定制方案" | "其他";

export const REQUEST_TYPES: RequestType[] = [
  "产品资料",
  "报价",
  "定制方案",
  "其他",
];

/**
 * A locally-selected image, kept in memory while the visitor fills out the
 * form. `url` is an object URL used only for the on-screen thumbnail/preview;
 * `file` is the original file, sent to the server on submit.
 */
export interface UploadedImage {
  id: string;
  url: string;
  name: string;
  file: File;
}

export interface LeadDraft {
  name: string;
  company: string;
  jobTitle: string;
  country: string;
  phone: string;
  email: string;
  wechat: string;
  businessCard: UploadedImage | null;
  productImages: UploadedImage[];
  /** Model / item numbers the visitor typed in (optional). */
  productModels: string[];
  requestedInformation: RequestType[];
  message: string;
}

export const EMPTY_DRAFT: LeadDraft = {
  name: "",
  company: "",
  jobTitle: "",
  country: "",
  phone: "",
  email: "",
  wechat: "",
  businessCard: null,
  productImages: [],
  productModels: [],
  requestedInformation: [],
  message: "",
};

/** Shape we would persist (kept here so the admin dashboard can reuse it). */
export interface Lead {
  id: string;
  name: string;
  company: string;
  jobTitle: string;
  country: string;
  phone: string;
  email: string;
  wechat: string;
  businessCardImage: string | null;
  productImages: string[];
  productModels: string[];
  requestedInformation: RequestType[];
  message: string;
  status: LeadStatus;
  createdAt: string;
}
