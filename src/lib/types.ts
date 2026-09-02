/*
 * Shared types for the lead-capture demo.
 *
 * `LeadDraft` is what the customer-facing form builds up in the browser while
 * the visitor clicks through the steps. When we later wire this to Supabase,
 * the draft (plus uploaded file URLs) becomes a `Lead` row.
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

/** A locally-selected image. `url` is an object URL for preview only (demo). */
export interface UploadedImage {
  id: string;
  url: string;
  name: string;
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
