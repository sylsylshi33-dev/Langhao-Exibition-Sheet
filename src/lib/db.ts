import fs from "node:fs";
import { randomInt, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { dataDir } from "./config";
import { dbFilePath } from "./paths";
import { beijingDateStamp } from "./time";
import type { Lead, LeadStatus, RequestType } from "./types";

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
  product_image_paths: string;
  product_models: string;
  requested_information: string;
  message: string;
}

function rowToLead(row: LeadRow): Lead {
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
    productImages: JSON.parse(row.product_image_paths) as string[],
    productModels: JSON.parse(row.product_models) as string[],
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
  productImagePaths: string[];
  productModels: string[];
  requestedInformation: RequestType[];
  message: string;
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
    try {
      db.prepare(
        `INSERT INTO leads (
          id, created_at, status, reference, client_submission_id,
          name, company, job_title, country, phone, email, wechat,
          business_card_path, product_image_paths, product_models, requested_information, message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        JSON.stringify(input.productImagePaths),
        JSON.stringify(input.productModels),
        JSON.stringify(input.requestedInformation),
        input.message,
      );
      return getLead(id)!;
    } catch (err) {
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

export function listLeads(): Lead[] {
  const rows = getDb()
    .prepare(`SELECT * FROM leads ORDER BY created_at DESC`)
    .all() as unknown as LeadRow[];
  return rows.map(rowToLead);
}

export function getLead(id: string): Lead | null {
  const row = getDb().prepare(`SELECT * FROM leads WHERE id = ?`).get(id) as unknown as
    | LeadRow
    | undefined;
  return row ? rowToLead(row) : null;
}

export function findLeadBySubmissionId(clientSubmissionId: string): Lead | null {
  const row = getDb()
    .prepare(`SELECT * FROM leads WHERE client_submission_id = ?`)
    .get(clientSubmissionId) as unknown as LeadRow | undefined;
  return row ? rowToLead(row) : null;
}

export function updateLeadStatus(id: string, status: LeadStatus): Lead | null {
  getDb().prepare(`UPDATE leads SET status = ? WHERE id = ?`).run(status, id);
  return getLead(id);
}
