# Operations runbook

Day-to-day tasks on the EC2 instance. All commands are run over SSH as
`ec2-user` with `sudo`. Paths:

| What | Where |
| --- | --- |
| Releases | `/opt/langhao/releases/<name>/` (`current` and `previous` are symlinks) |
| Scripts | `/opt/langhao/bin/` |
| **Leads + photos** | `/var/lib/langhao/` (`leads.db`, `uploads/`) |
| Backups | `/var/backups/langhao/<timestamp>[-label]/` |
| Settings / secrets | `/etc/langhao/langhao.env` (root + `langhao` group only) |
| App logs | `journalctl -u langhao` |
| Proxy / HTTPS logs | `journalctl -u caddy` |

## Updating the site

An update never touches `/var/lib/langhao`. The script backs up first, swaps
releases atomically, checks health, and **rolls back by itself** if the new
version doesn't come up.

**From your laptop (recommended):**

```bash
git pull                                   # or: you / Claude Code made changes
npm ci && npm run test:e2e                 # optional but worth it
npm run release                            # dist/langhao-<time>-<sha>.tar.gz (+ .sha256)

scp -i key.pem dist/langhao-*.tar.gz* ec2-user@<host>:/tmp/
ssh -i key.pem ec2-user@<host> 'sudo /opt/langhao/bin/deploy.sh /tmp/langhao-<…>.tar.gz'
```

**On the server from GitHub:**

```bash
sudo /opt/langhao/bin/update-from-git.sh              # origin/main
sudo /opt/langhao/bin/update-from-git.sh <tag-or-sha> # a specific version
```

Expected ending: `DEPLOYED: <release> (previous: <release>)`. If it ends with
`deployment FAILED and was rolled back`, the site is still running the old
release; read the log lines printed above that message (or
`journalctl -u langhao -n 80`).

Deploy outside peak exhibition hours: the restart drops in-flight uploads for
a few seconds (the form retries automatically, and retries are de-duplicated).

### Safe-update rules

- Database changes are additive migrations that run automatically on start
  (nothing is ever dropped), and a release **refuses to start** against a
  newer database than it understands, so an old release can never corrupt a
  newer database. The flip side: **after a release that changed the schema
  has started once, an older release will not start** until you restore the
  pre-deploy backup (see [Rolling back across a schema change](#rolling-back-across-a-schema-change)).
  Release notes say when the schema changed; v3 (several products per
  enquiry) is one.
- Never copy files into `/var/lib/langhao` while the service runs.
- Never put `data/` inside a release (the deploy script refuses to).
- Keep the admin password out of Git, tickets and chat.

## Rolling back

```bash
sudo /opt/langhao/bin/rollback.sh                 # to the previous release
sudo /opt/langhao/bin/rollback.sh <release-name>  # to any release in /opt/langhao/releases
ls -1t /opt/langhao/releases
```

Rollback changes code only. Visitor data is untouched.

### Rolling back across a schema change

`/opt/langhao/bin/rollback.sh` (and the automatic rollback inside `deploy.sh`)
switch the code back but leave the database as the newer release left it. If
the older release then refuses to start with
`database is at schema vN but this build only understands up to vM`, restore
the snapshot that `deploy.sh` took just before the upgrade:

```bash
ls -1t /var/backups/langhao | head                       # newest first; the pre-deploy one
sudo /opt/langhao/bin/restore.sh /var/backups/langhao/<pre-deploy snapshot>
```

Anything submitted *after* that snapshot is lost by the restore (copy the
newer `leads.db` and `uploads/` aside first if that matters), so the better
habit is to roll **forward**: fix the problem and deploy a newer release.

## Backups

Automatic: daily at 03:00 Beijing time (`langhao-backup.timer`), plus one
before every deploy. Each snapshot is a self-contained `leads.db` (consistent,
taken with `VACUUM INTO` while the app runs) and a copy of `uploads/`
(unchanged photos are hard-linked, so snapshots are cheap). 14 are kept.

```bash
sudo -u langhao /opt/langhao/bin/backup.sh manual     # take one now
ls -1 /var/backups/langhao                            # list them
systemctl list-timers langhao-backup.timer            # next scheduled run
journalctl -u langhao-backup -n 20 --no-pager         # last result
```

**Local backups on the same disk do not protect against losing the instance
or volume.** Keep an off-instance copy: EBS snapshots (Lifecycle Manager)
and/or S3 via `BACKUP_S3_URI` — see
[DEPLOYMENT.md § Backups](DEPLOYMENT.md#8-backups-and-monitoring).

## Restoring from a backup

```bash
ls -1 /var/backups/langhao
sudo /opt/langhao/bin/restore.sh /var/backups/langhao/<snapshot>
```

It asks you to type `restore`, stops the service, **moves the current data
aside** to `/var/lib/langhao.before-restore-<time>` (nothing is deleted),
installs the snapshot, starts the service and checks health. To undo a
restore, stop the service and move that folder back.

From S3: `aws s3 sync s3://bucket/path/<snapshot> /var/backups/langhao/<snapshot>`
first, then restore as above.

## Clearing test data before the show

The dashboard has no delete function (by design, so a stray click cannot
destroy a lead). To start the show with an empty database, once, after your
last test:

```bash
sudo -u langhao /opt/langhao/bin/backup.sh before-clear   # keep the test data somewhere
sudo systemctl stop langhao
sudo mv /var/lib/langhao /var/lib/langhao.test-data-$(date +%F)
sudo install -d -o langhao -g langhao -m 0750 /var/lib/langhao
sudo systemctl start langhao
curl -s https://<your-domain>/api/healthz          # {"status":"ok"}
```

Do **not** do this once real visitors have submitted.

## Deleting one person's data on request

There is no in-app delete. Until you decide your retention/deletion process,
do it by hand and keep a backup first:

```bash
sudo -u langhao /opt/langhao/bin/backup.sh before-delete
sudo systemctl stop langhao
sudo -u langhao /opt/node/bin/node -e '
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs"), path = require("path");
const ref = process.argv[1];                         // e.g. LC-20261016-K7M2X
const db = new DatabaseSync("/var/lib/langhao/leads.db");
const row = db.prepare("SELECT * FROM leads WHERE reference = ?").get(ref);
if (!row) { console.log("not found"); process.exit(1); }
const files = [row.business_card_path, ...JSON.parse(row.product_image_paths)].filter(Boolean);
for (const f of files) fs.rmSync(path.join("/var/lib/langhao/uploads", f), { force: true });
db.prepare("DELETE FROM leads WHERE id = ?").run(row.id);
console.log("deleted", ref, "and", files.length, "photo(s)");
' LC-XXXXXXXX-XXXXX
sudo systemctl start langhao
```

Remember older backups still contain that person's data until they age out.

## Changing the admin password

```bash
sudo nano /etc/langhao/langhao.env         # edit ADMIN_PASSWORD= (12+ characters)
sudo systemctl restart langhao
```

Everyone is signed out. Rotate whenever someone who knew it leaves.

## Everyday checks

```bash
curl -s https://<your-domain>/api/healthz              # ok / degraded + which check
sudo systemctl is-active langhao caddy                 # both: active
df -h /var/lib/langhao                                 # free space
sudo ls -1t /var/backups/langhao | head -3             # a recent backup exists
sudo journalctl -u langhao --since "1 hour ago" --no-pager | tail -30
```

## Troubleshooting

| Symptom | Likely cause → fix |
| --- | --- |
| Site down, `healthz` unreachable | `sudo systemctl status langhao caddy`; `journalctl -u langhao -n 80`. `[startup] FATAL` names the problem (e.g. `DATA_DIR`, newer schema). |
| `healthz` 503 `["disk_space"]` | Free space < `MIN_FREE_DISK_MB`. Submissions are refused until fixed. `sudo du -sh /var/backups/langhao /var/lib/langhao`; delete old backups, or enlarge the EBS volume in the console and then extend the filesystem (`sudo growpart /dev/nvme0n1 1 && sudo xfs_growfs -d /`; check the device name with `lsblk`). |
| `healthz` 503 `["admin_config"]` | `ADMIN_PASSWORD` missing/too short in `/etc/langhao/langhao.env`. Visitors are unaffected. |
| Admin: "尝试次数过多" | Throttled (5 wrong tries / 15 min per address). Wait, or restart does **not** clear it by design. |
| Admin: "后台尚未完成配置" | Same as `admin_config` above. |
| Visitors: "网络不稳定…" repeatedly | Their network, or proxy timeouts. Check `journalctl -u caddy`; test from another network; see CHINA-TESTING. |
| HTTPS certificate error / expired | DNS no longer points here, or port 80 closed. `journalctl -u caddy -n 50`. Caddy renews automatically ~30 days before expiry. |
| Instance rebooted | Both services are enabled; verify with the everyday checks. |
| Deploy says "not healthy" | It already rolled back. Read the log lines it printed; fix; redeploy. |
| Disk filling unexpectedly | Public form being abused? Look at request volume in `journalctl -u caddy`. Photos are capped at 12 MB each, 30 MB per request, 10 per lead, 60 requests / 10 min per address. |

## What to do if you suspect a leak

1. Change `ADMIN_PASSWORD` and restart (signs everyone out).
2. Check `journalctl -u langhao | grep "failed login"` and `journalctl -u caddy`.
3. Take a backup labelled `incident` and keep it.
4. Involve your legal adviser: leads contain personal information of people in China.
