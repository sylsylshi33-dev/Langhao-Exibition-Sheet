# End-to-end tests

Black-box tests that exercise the real production build (the same standalone
server that runs on EC2) over HTTP, using throwaway data directories.

```bash
npm run test:e2e              # build, then run everything (~10 minutes)
SKIP_BUILD=1 ./tests/run-all.sh
bash tests/auth.test.sh       # a single suite (needs `npm run build` first)
```

| Suite | Covers |
| --- | --- |
| `auth.test.sh` | No default password, fail-closed config, session creation/expiry/revocation, password rotation, cookie flags (HTTP vs HTTPS), forged/legacy cookies, login throttling, secrets at rest |
| `ingest-persistence.test.sh` | Fail-fast startup, `/api/healthz`, field + image validation (magic bytes, size/count caps), idempotent retries, orphan cleanup, concurrency, rate limiting, CSV formula injection, Beijing time, photo-route path traversal, persistence across release replacement, upgrading older databases, refusing newer ones |
| `products.test.sh` | Upgrading a real schema-v2 database to v3 (old photos/models kept, nothing invented), multi-product submissions (photo ↔ product association, mixed photo/SKU, optional fields), per-product validation and limits, admin display of old and new enquiries, CSV / Excel / PDF exports (rows, embedded images byte-identical to the uploads, formula neutralisation, size budget, one export at a time), existing protections |
| `deploy.test.sh` | `build-release.sh`, `deploy.sh` (first deploy, data preserved, pre-deploy backup, automatic rollback of a broken release, checksum / `data/` refusal), `rollback.sh`, incremental `backup.sh`, `restore.sh`, release pruning |

Not covered here (needs a real server / real phones): systemd, Caddy/HTTPS,
Let's Encrypt, mainland-China reachability, WeChat's in-app browser. See
`docs/DEPLOYMENT.md` and `docs/CHINA-TESTING.md`.
