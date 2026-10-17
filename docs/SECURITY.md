# Security model

What protects visitor data, and what is still your responsibility.

## Assets

Leads: name, company, e-mail, phone, WeChat, country, free-text, product
photos and **business-card photos** (which carry names, phone numbers and
addresses). Stored in `/var/lib/langhao` on one encrypted EBS volume, and in
backups.

## Controls

| Area | Control |
| --- | --- |
| Transport | HTTPS only via Caddy (automatic certificates), HSTS, HTTP→HTTPS redirect. App listens on `127.0.0.1`; the security group exposes only 80/443 (+22 from your IP). |
| Admin password | Required, 12+ chars, **no default**; the dashboard is disabled if missing; generated randomly by the bootstrap script. Constant-time comparison. |
| Sessions | Random 256-bit token, only its SHA-256 stored; 12 h absolute expiry; logout revokes server-side; changing the password revokes all; `HttpOnly`, `SameSite=Lax`, `Secure` + `__Host-` prefix over HTTPS. |
| Brute force | 5 failures / 15 min per client address, plus a global ceiling; persisted across restarts; failures logged (never the password). |
| Authorization | Every admin page and API handler verifies the session itself; the proxy gate is only a pre-filter. Photos are served only through the authenticated route, only image files inside `uploads/`, with `nosniff`. |
| Public endpoint | Body capped (30 MB), per-file (12 MB), per-product (3), per-enquiry (20 photos, 20 products) caps, strict per-product field validation (photos are tied to products by position and cross-checked against a declared count), images accepted only by magic bytes with server-chosen names, unknown JSON/enum values rejected, rate-limited, refuses writes when the disk is nearly full, idempotent retries. |
| Output | React escapes all visitor text. CSV cells beginning with `= + - @` are neutralised (formula injection); Excel cells are always written as text, never formulas. PDF text is drawn, not interpreted. Excel/PDF exports are admin-only, one at a time, and capped in embedded photo volume. SQL uses bound parameters only. |
| Process | Runs as an unprivileged user; systemd sandboxing (`ProtectSystem=strict`, only the data directory writable, `NoNewPrivileges`); release directories are read-only to the service. |
| Supply chain | Node and Caddy downloads are verified against published checksums; releases carry a SHA-256 that `deploy.sh` checks; `npm audit --omit=dev` reports one moderate advisory (GHSA-w5hq-g745-h8pq, `uuid` inside `exceljs`): it concerns `uuid` v3/v5/v6 called with a caller-supplied buffer, while ExcelJS only calls `v4()` without one (for conditional formatting, which the export does not use), so it is not reachable. Excel and PDF export use pure-JavaScript libraries (`exceljs`, `pdfkit`); the release still contains no native binaries. |
| Data safety | WAL SQLite, additive migrations, pre-deploy + daily backups, tested restore, release never contains `data/`. |

## Residual risks and limits

- **Shared staff password**, no per-person accounts or audit trail. Anyone who
  has it can read and export everything. Rotate when staff change.
- **No in-app deletion** and no automatic retention; see
  [OPERATIONS.md](OPERATIONS.md). Backups keep deleted data until they age out.
- **Public repository.** Source code and git history are visible. An earlier
  version's default password (`langhao2026`) is in that history and must be
  treated as burned — it is no longer accepted or used anywhere. Never commit
  `.env*`, `data/`, backups or release tarballs (all are git-ignored).
- **Old build artefacts.** Any zip/bundle built before the hardening contains
  the old code. Do not distribute those.
- **No CSRF token.** Mitigated by `SameSite=Lax` and JSON-only mutating
  endpoints; an additional Origin check can be added if admin is ever used
  from embedded or cross-site contexts.
- **Throttle key is the last `X-Forwarded-For` hop.** Correct only with exactly
  one trusted proxy (Caddy) and port 3000 unreachable from outside.
- **No Content-Security-Policy.** Next.js needs inline scripts; a nonce-based
  CSP is possible future work. Other headers are set.
- **Anonymous uploads** are validated, not virus-scanned. Photos are only ever
  displayed as images or downloaded; never executed.
- **`node:sqlite` is experimental** upstream; Node is pinned and the suites
  exercise it. Review on any Node upgrade.
- **Privacy/legal:** storing personal data of people in China on an overseas
  server may carry notice, consent, retention and cross-border obligations
  (e.g. PIPL). This repository cannot decide that for you.
- **Host security** is yours: OS updates (`sudo dnf upgrade --refresh`), SSH
  key hygiene, AWS account MFA, least-privilege IAM for the S3 backup role.
