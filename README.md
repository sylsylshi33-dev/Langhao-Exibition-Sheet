# 展会线索登记 · Exhibition Lead Capture

A bilingual (中文 / English) lead-capture site for trade shows. Visitors scan a
QR code on their own phone, leave their contact details, photograph a business
card and the products they liked, and say what they want. Staff review the
leads in a password-protected dashboard and export them to CSV, Excel
(with the photos embedded) or PDF. An enquiry can list several products, each
with its own photo(s), SKU, colour, quantity and packaging requirements.

This is **not** an e-commerce site: no prices, no cart, no checkout.

## How it is hosted

One small Linux server (AWS EC2), nothing else:

```
visitor's phone ──HTTPS──▶ Caddy (TLS, size caps, headers)
                              │  127.0.0.1:3000 only
                              ▼
                        Next.js app (Node 22)
                           ├─ /var/lib/langhao/leads.db        SQLite (WAL)
                           └─ /var/lib/langhao/uploads/…       photos
```

- **Persistence** — leads and photos live in `DATA_DIR` (`/var/lib/langhao`),
  *outside* the release folders, so deploying or rolling back never touches them.
- **Single instance, no managed services** — ~100–200 visitors and fewer than
  10 at once is far below what SQLite on one small instance handles.
- **Updates** — build a release tarball, run `deploy.sh`: it takes a backup,
  switches atomically, health-checks, and rolls back by itself if the new
  version is unhealthy.
- **Offline fallback** — the same app can still be packaged as a double-click
  Windows/Mac bundle for a booth PC with no internet (see below).

| Document | Read it when |
| --- | --- |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Setting up the AWS server for the first time (ordered checklist) |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Updating, rolling back, backing up, restoring, troubleshooting |
| [docs/CHINA-TESTING.md](docs/CHINA-TESTING.md) | Before printing the QR code: how to test from mainland China |
| [docs/SECURITY.md](docs/SECURITY.md) | What is protected, how, and what risks remain |
| [tests/README.md](tests/README.md) | Running the end-to-end test suites |

## Develop

```bash
nvm use                # Node 22 (see .nvmrc); node:sqlite is built in
npm ci
echo 'ADMIN_PASSWORD=<12+ characters>' > .env.local    # git-ignored
npm run dev            # http://localhost:3000   (admin: /admin)
```

- Without `ADMIN_PASSWORD` the dashboard is disabled and the visitor form
  still works. **There is no default password.**
- In development data goes to `./data/` (git-ignored). In production
  `DATA_DIR` must be set to an absolute path or the server refuses to start.

### Checks

```bash
npx tsc --noEmit && npx eslint src      # types + lint
npm run test:e2e                         # builds, then ~375 end-to-end checks
```

### Making a release

```bash
npm run release        # → dist/langhao-<time>-<sha>.tar.gz (+ .sha256)
```

then follow [docs/OPERATIONS.md](docs/OPERATIONS.md#updating-the-site).

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `DATA_DIR` | production | Absolute path for the database and photos. Must be outside the release folder. |
| `ADMIN_PASSWORD` | for the dashboard | 12+ characters. Changing it signs everyone out. |
| `MIN_FREE_DISK_MB` | no (1024) | Below this much free space, submissions are refused and `/api/healthz` reports degraded. |
| `EXPORT_MAX_IMAGE_MB` | no (60) | Most photo data one Excel/PDF export embeds; further photos are listed by file name and the file says so. |
| `BACKUP_S3_URI` | no | e.g. `s3://bucket/path` — backups are also synced there. |

`PORT` and `HOSTNAME` are set by the systemd unit (`3000`, `127.0.0.1`).

## Endpoints

| Path | Who | Purpose |
| --- | --- | --- |
| `/` | public | Visitor form (中 / EN) |
| `POST /api/leads` | public | Submit a lead (validated, rate-limited, size-capped) |
| `GET /api/healthz` | public | `{"status":"ok"}` or 503 `{"status":"degraded","failed":[…]}` |
| `/admin`, `/admin/leads/:id` | staff | Dashboard, lead detail with photos, status |
| `/api/admin/*` | staff | Login/logout, leads, photos, CSV / Excel (`/export/xlsx`) / PDF (`/export/pdf`) export |

## Repository map

```
src/app/                 pages and API routes
src/components/enquiry/  the visitor form (EnquiryFlow, screens, i18n, image + upload helpers)
src/lib/                 db (SQLite + migrations), ingest (validation), adminAuth/adminSession,
                         exportXlsx / exportPdf / exportPhotos / csv, config/paths, throttle, disk, time
assets/fonts/            Chinese font (subset of Noto Sans SC, OFL) embedded in PDF exports
src/instrumentation.ts   fail-fast startup checks
src/proxy.ts             optimistic gate for /admin (real checks are in each handler)
deploy/                  everything that runs on the server: bootstrap, deploy, rollback,
                         backup, restore, systemd units, Caddyfile
scripts/                 build-release.sh (server release) and package-*.sh (offline bundles)
launcher/                double-click launchers + staff instructions for the offline bundles
tests/                   end-to-end suites
docs/                    deployment, operations, China testing, security
```

## Offline bundle (booth PC without internet)

```bash
./scripts/package-windows.sh   # → launcher/dist/Langhao-Exhibition-App.zip
./scripts/package-mac.sh       # → launcher/dist-mac/Langhao-Exhibition-App-Mac.zip
```

Each bundle contains the same app plus a portable Node runtime and a
double-click launcher. On first start the launcher generates an admin password
and saves it to `admin-password.txt` beside the launcher; data stays in
`app/data`. Bundles on different PCs do **not** sync — export a CSV from each.
This is a fallback; the public website is the primary deployment.

> Any bundle or zip built **before** this hardening embeds the old code,
> including a default password that was published in this repository's history.
> Do not distribute those; rebuild.

## Known limits

- One shared staff password (no per-person accounts, no audit trail).
- No in-app deletion of leads. To clear test data before the show, see
  [docs/OPERATIONS.md](docs/OPERATIONS.md#clearing-test-data-before-the-show).
- `node:sqlite` is marked experimental by Node; the version is pinned
  (`.nvmrc`, `engines`) and exercised by the test suites.
