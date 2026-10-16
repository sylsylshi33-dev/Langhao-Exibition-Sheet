// Makes a consistent snapshot of the live SQLite database (safe while the app
// is running, WAL mode included) and verifies it.
//   node sqlite-backup.mjs <source.db> <destination.db>
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const [source, destination] = process.argv.slice(2);
if (!source || !destination) {
  console.error("usage: sqlite-backup.mjs <source.db> <destination.db>");
  process.exit(2);
}
if (!existsSync(source)) {
  console.error(`source database not found: ${source}`);
  process.exit(3);
}
if (existsSync(destination)) {
  console.error(`destination already exists: ${destination}`);
  process.exit(4);
}

const db = new DatabaseSync(source);
db.exec("PRAGMA busy_timeout = 10000");
db.exec(`VACUUM INTO '${destination.replace(/'/g, "''")}'`);
db.close();

const copy = new DatabaseSync(destination, { readOnly: true });
const integrity = copy.prepare("PRAGMA integrity_check").get();
const leads = copy.prepare("SELECT COUNT(*) AS n FROM leads").get();
copy.close();

if (integrity.integrity_check !== "ok") {
  console.error(`integrity check FAILED: ${JSON.stringify(integrity)}`);
  process.exit(5);
}
console.log(`snapshot ok: ${leads.n} leads`);
