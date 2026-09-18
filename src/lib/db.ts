import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR, DB_PATH } from "./paths";
import type { Lead, LeadStatus, RequestType } from "./types";

/*
 * Local database for the exhibition PC. Uses Node's built-in `node:sqlite`
 * module (no native addon to compile or ship per-platform) and a single
 * file on disk, so leads survive closing and reopening the app.
 *
 * This module is imported only from server-side code (API routes) — never
 * from a client component.
 */

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT '新线索',
    name TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '',
    job_title TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    wechat TEXT NOT NULL DEFAULT '',
    business_card_path TEXT,
    product_image_paths TEXT NOT NULL DEFAULT '[]',
    product_models TEXT NOT NULL DEFAULT '[]',
    requested_information TEXT NOT NULL DEFAULT '[]',
    message TEXT NOT NULL DEFAULT ''
  )
`);

interface LeadRow {
  id: string;
  created_at: string;
  status: string;
  name: string;
  company: string;
  job_title: string;
  country: string;
  phone: string;
  email: string;
  wechat: string;
  business_card_path: string | null;
  product_image_paths: string;
  product_models: string;
  requested_information: string;
  message: string;
}

function rowToLead(row: LeadRow): Lead {
  return {
    id: row.id,
    createdAt: row.created_at,
    status: row.status as LeadStatus,
    name: row.name,
    company: row.company,
    jobTitle: row.job_title,
    country: row.country,
    phone: row.phone,
    email: row.email,
    wechat: row.wechat,
    businessCardImage: row.business_card_path,
    productImages: JSON.parse(row.product_image_paths) as string[],
    productModels: JSON.parse(row.product_models) as string[],
    requestedInformation: JSON.parse(row.requested_information) as RequestType[],
    message: row.message,
  };
}

export interface NewLeadInput {
  name: string;
  company: string;
  jobTitle: string;
  country: string;
  phone: string;
  email: string;
  wechat: string;
  businessCardPath: string | null;
  productImagePaths: string[];
  productModels: string[];
  requestedInformation: RequestType[];
  message: string;
}

export function insertLead(input: NewLeadInput): Lead {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const status: LeadStatus = "新线索";

  db.prepare(
    `INSERT INTO leads (
      id, created_at, status, name, company, job_title, country, phone, email, wechat,
      business_card_path, product_image_paths, product_models, requested_information, message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    createdAt,
    status,
    input.name,
    input.company,
    input.jobTitle,
    input.country,
    input.phone,
    input.email,
    input.wechat,
    input.businessCardPath,
    JSON.stringify(input.productImagePaths),
    JSON.stringify(input.productModels),
    JSON.stringify(input.requestedInformation),
    input.message,
  );

  return getLead(id)!;
}

export function listLeads(): Lead[] {
  const rows = db.prepare(`SELECT * FROM leads ORDER BY created_at DESC`).all() as unknown as LeadRow[];
  return rows.map(rowToLead);
}

export function getLead(id: string): Lead | null {
  const row = db.prepare(`SELECT * FROM leads WHERE id = ?`).get(id) as unknown as LeadRow | undefined;
  return row ? rowToLead(row) : null;
}

export function updateLeadStatus(id: string, status: LeadStatus): Lead | null {
  db.prepare(`UPDATE leads SET status = ? WHERE id = ?`).run(status, id);
  return getLead(id);
}
