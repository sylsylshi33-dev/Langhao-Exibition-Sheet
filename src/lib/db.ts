import fs from "node:fs";
import { randomInt, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { dataDir } from "./config";
import { dbFilePath } from "./paths";
import { beijingDateStamp } from "./time";
import type { Lead, LeadProduct, LeadStatus, RequestType } from "./types";

/*
 * SQLite database (Node's built-in node:sqlite — nothing native to install).
 *
 * - Opened lazily on first use, never at import time, so `next build` has no
 *   side effects and a bad DATA_DIR produces a clear error where it is used.
 * - WAL mode + busy_timeout: safe for the single Node process this app runs
 *   as, and tolerant of a backup job reading at the same time.
 * - Schema changes are numbered migrations tracked with PRAGMA user_version.
 *   They are additive-only, so rolling the *code* back to an earlier release
 *   keeps working against a newer database.
 *
 * Server-side only. Never import this from a client component.
 */

type Migration = (db: DatabaseSync) => void;

function safeStringArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

const MIGRATIONS: Migration[] = [
  // v1 — baseline (idempotent, so databases created by earlier builds adopt it).
  (db) => {
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
      );

      CREATE TABLE IF NOT EXISTS admin_sessions (
        token_hash TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions (expires_at);

      CREATE TABLE IF NOT EXISTS admin_login_failures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_key TEXT NOT NULL,
        failed_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_admin_login_failures ON admin_login_failures (client_key, failed_at);

      CREATE TABLE IF NOT EXISTS admin_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  },

  // v2 — visitor-facing reference number, idempotency key, submission throttle.
  (db) => {
    const columns = (db.prepare("PRAGMA table_info(leads)").all() as unknown as { name: string }[]).map(
      (c) => c.name,
    );
    if (!columns.includes("reference")) db.exec("ALTER TABLE leads ADD COLUMN reference TEXT");
    if (!columns.includes("client_submission_id")) {
      db.exec("ALTER TABLE leads ADD COLUMN client_submission_id TEXT");
    }

    // Give leads that predate references a stable one derived from their id.
    const missing = db
      .prepare("SELECT id, created_at FROM leads WHERE reference IS NULL")
      .all() as unknown as { id: string; created_at: string }[];
    const taken = new Set(
      (
        db.prepare("SELECT reference FROM leads WHERE reference IS NOT NULL").all() as unknown as {
          reference: string;
        }[]
      ).map((r) => r.reference),
    );
    const setReference = db.prepare("UPDATE leads SET reference = ? WHERE id = ?");
    for (const row of missing) {
      const stamp = beijingDateStamp(new Date(row.created_at));
      const compact = row.id.replace(/-/g, "").toUpperCase();
      for (let len = 5; len <= compact.length; len++) {
        const candidate = `LC-${stamp}-${compact.slice(0, len)}`;
        if (!taken.has(candidate)) {
          taken.add(candidate);
          setReference.run(candidate, row.id);
          break;
        }
      }
    }

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_reference ON leads (reference);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_submission
        ON leads (client_submission_id) WHERE client_submission_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS rate_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        client_key TEXT NOT NULL,
        at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rate_events ON rate_events (kind, client_key, at);
    `);
  },

  // v3 — several products per enquiry. Additive: leads.product_image_paths and
  // leads.product_models are left in place (and untouched) so no data is ever
  // dropped; from here on every read and write goes through lead_products.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS lead_products (
        id TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        sku TEXT NOT NULL DEFAULT '',
        colour TEXT NOT NULL DEFAULT '',
        quantity TEXT NOT NULL DEFAULT '',
        packaging TEXT NOT NULL DEFAULT '',
        photo_paths TEXT NOT NULL DEFAULT '[]'
      );
      CREATE INDEX IF NOT EXISTS idx_lead_products_lead ON lead_products (lead_id, position);
    `);

    // Enquiries taken before this release recorded photos and model numbers as
    // two unrelated lists, so they cannot be split per product honestly. Each
    // becomes ONE product holding all of its photos, with the model numbers
    // joined into the SKU field. Nothing is lost and nothing is invented.
    const legacy = db
      .prepare(
        `SELECT l.id, l.product_image_paths, l.product_models FROM leads l
         WHERE (l.product_image_paths <> '[]' OR l.product_models <> '[]')
           AND NOT EXISTS (SELECT 1 FROM lead_products p WHERE p.lead_id = l.id)`,
      )
      .all() as unknown as { id: string; product_image_paths: string; product_models: string }[];
    const insert = db.prepare(
      "INSERT INTO lead_products (id, lead_id, position, sku, photo_paths) VALUES (?, ?, 0, ?, ?)",
    );
    for (const row of legacy) {
      const photos = safeStringArray(row.product_image_paths);
      const models = safeStringArray(row.product_models);
      if (photos.length === 0 && models.length === 0) continue;
      insert.run(randomUUID(), row.id, models.join(", "), JSON.stringify(photos));
    }
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

function userVersion(db: DatabaseSync): number {
  const row = db.prepare("PRAGMA user_version").get() as unknown as { user_version: number };
  return row.user_version;
}

function migrate(db: DatabaseSync): void {
  const current = userVersion(db);
  if (current > MIGRATIONS.length) {
    throw new Error(
      `The database is at schema v${current} but this build only understands up to v${MIGRATIONS.length}. ` +
        "Refusing to start: deploy a newer release, or restore a backup that matches this release.",
    );
  }
  if (current === MIGRATIONS.length) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    // Re-read under the write lock: another process may have migrated meanwhile.
    for (let v = userVersion(db); v < MIGRATIONS.length; v++) {
      MIGRATIONS[v](db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    }
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already rolled back */
    }
    throw err;
  }
}

let instance: DatabaseSync | undefined;

export function getDb(): DatabaseSync {
  if (instance) return instance;

  fs.mkdirSync(dataDir(), { recursive: true });
  const db = new DatabaseSync(dbFilePath());
  // Several handles may open this file at once (route bundles, backup job).
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  migrate(db);

  instance = db;
  return db;
}

/* ---------- leads ---------- */

interface LeadRow {
  id: string;
  created_at: string;
  status: string;
  reference: string | null;
  name: string;
  company: string;
  job_title: string;
  country: string;
  phone: string;
  email: string;
  wechat: string;
  business_card_path: string | null;
  requested_information: string;
  message: string;
}

interface ProductRow {
  id: string;
  lead_id: string;
  position: number;
  sku: string;
  colour: string;
  quantity: string;
  packaging: string;
  photo_paths: string;
}

function rowToProduct(row: ProductRow): LeadProduct {
  return {
    id: row.id,
    position: row.position,
    sku: row.sku,
    colour: row.colour,
    quantity: row.quantity,
    packaging: row.packaging,
    photos: safeStringArray(row.photo_paths),
  };
}

function rowToLead(row: LeadRow, products: LeadProduct[]): Lead {
  return {
    id: row.id,
    reference: row.reference ?? "",
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
    products,
    requestedInformation: JSON.parse(row.requested_information) as RequestType[],
    message: row.message,
  };
}

export interface NewLeadInput {
  clientSubmissionId: string | null;
  name: string;
  company: string;
  jobTitle: string;
  country: string;
  phone: string;
  email: string;
  wechat: string;
  businessCardPath: string | null;
  products: NewProductInput[];
  requestedInformation: RequestType[];
  message: string;
}

export interface NewProductInput {
  sku: string;
  colour: string;
  quantity: string;
  packaging: string;
  /** Relative paths of already-stored photos, in display order. */
  photoPaths: string[];
}

/** Thrown when the same client submission id was already stored (a retried request). */
export class DuplicateSubmissionError extends Error {
  constructor() {
    super("duplicate submission");
  }
}

// No 0/O/1/I so a reference read aloud or copied by hand is unambiguous.
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newReference(): string {
  let suffix = "";
  for (let i = 0; i < 5; i++) suffix += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  return `LC-${beijingDateStamp(new Date())}-${suffix}`;
}

export function insertLead(input: NewLeadInput): Lead {
  const db = getDb();
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newReference();
    // The enquiry and all of its products are saved together or not at all.
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(
        `INSERT INTO leads (
          id, created_at, status, reference, client_submission_id,
          name, company, job_title, country, phone, email, wechat,
          business_card_path, requested_information, message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        createdAt,
        "新线索",
        reference,
        input.clientSubmissionId,
        input.name,
        input.company,
        input.jobTitle,
        input.country,
        input.phone,
        input.email,
        input.wechat,
        input.businessCardPath,
        JSON.stringify(input.requestedInformation),
        input.message,
      );
      const insertProduct = db.prepare(
        `INSERT INTO lead_products (id, lead_id, position, sku, colour, quantity, packaging, photo_paths)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      input.products.forEach((p, position) => {
        insertProduct.run(
          randomUUID(),
          id,
          position,
          p.sku,
          p.colour,
          p.quantity,
          p.packaging,
          JSON.stringify(p.photoPaths),
        );
      });
      db.exec("COMMIT");
      return getLead(id)!;
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* already rolled back */
      }
      const message = err instanceof Error ? err.message : "";
      if (message.includes("UNIQUE") && message.includes("client_submission_id")) {
        throw new DuplicateSubmissionError();
      }
      if (message.includes("UNIQUE") && message.includes("reference")) continue;
      throw err;
    }
  }
  throw new Error("could not allocate a unique lead reference");
}

function productsByLead(leadIds?: string[]): Map<string, LeadProduct[]> {
  const db = getDb();
  const rows = (
    leadIds
      ? leadIds.flatMap(
          (leadId) =>
            db
              .prepare("SELECT * FROM lead_products WHERE lead_id = ? ORDER BY position")
              .all(leadId) as unknown as ProductRow[],
        )
      : (db
          .prepare("SELECT * FROM lead_products ORDER BY lead_id, position")
          .all() as unknown as ProductRow[])
  );
  const map = new Map<string, LeadProduct[]>();
  for (const row of rows) {
    const list = map.get(row.lead_id) ?? [];
    list.push(rowToProduct(row));
    map.set(row.lead_id, list);
  }
  return map;
}

export function listLeads(): Lead[] {
  const rows = getDb()
    .prepare(`SELECT * FROM leads ORDER BY created_at DESC`)
    .all() as unknown as LeadRow[];
  const products = productsByLead();
  return rows.map((row) => rowToLead(row, products.get(row.id) ?? []));
}

export function getLead(id: string): Lead | null {
  const row = getDb().prepare(`SELECT * FROM leads WHERE id = ?`).get(id) as unknown as
    | LeadRow
    | undefined;
  return row ? rowToLead(row, productsByLead([row.id]).get(row.id) ?? []) : null;
}

export function findLeadBySubmissionId(clientSubmissionId: string): Lead | null {
  const row = getDb()
    .prepare(`SELECT * FROM leads WHERE client_submission_id = ?`)
    .get(clientSubmissionId) as unknown as LeadRow | undefined;
  return row ? rowToLead(row, productsByLead([row.id]).get(row.id) ?? []) : null;
}

export function updateLeadStatus(id: string, status: LeadStatus): Lead | null {
  getDb().prepare(`UPDATE leads SET status = ? WHERE id = ?`).run(status, id);
  return getLead(id);
}
