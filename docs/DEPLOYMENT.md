# Deploying to AWS EC2 — first-time setup

Follow the steps in order. Everything here targets a **new, dedicated** EC2
instance. Nothing in this guide touches the existing company website or its
server; do not reuse its instance, security group, or Elastic IP.

Time: about 60–90 minutes, most of it waiting for DNS.

## What you need first

| Item | Notes |
| --- | --- |
| An AWS account/region you can create EC2 in | |
| A **domain name** you control | Use a sub-domain, e.g. `leads.your-company.com`. HTTPS certificates are issued for names, not IP addresses, and the QR code should encode this stable name. |
| A way to edit that domain's DNS | You will add one `A` record. |
| Your laptop with this repository | To build a release. |
| Decisions in [§ Decisions before launch](#decisions-before-launch) | Privacy text is the main one. |

## 1. Launch the instance

EC2 console → **Launch instance**:

- **Name:** `langhao-leads`
- **AMI:** Amazon Linux 2023
- **Type:** `t3.small` (x86_64) or `t4g.small` (Graviton/arm64). 2 GB RAM is
  comfortable for the app and enough to build on the server if you choose to.
  The bootstrap script detects the CPU architecture.
- **Key pair:** create or choose one you will keep safe.
- **Storage:** 30 GiB `gp3`, **encrypted**. (Photos are compressed in the
  browser; this is generous for a few hundred visitors.)
- **Advanced details:** *Metadata version* = **V2 only**; *Termination
  protection* = **Enable**.
- **Network / Security group:** create a **new** group `langhao-leads-sg`
  (next step) — do not attach any existing security group.

## 2. Security group

Inbound rules for `langhao-leads-sg`:

| Type | Port | Source | Why |
| --- | --- | --- | --- |
| HTTP | 80 | `0.0.0.0/0` and `::/0` | Certificate issuance + redirect to HTTPS |
| HTTPS | 443 | `0.0.0.0/0` and `::/0` | The site |
| SSH | 22 | **your office/home IP only** (`x.x.x.x/32`) | Administration |

Do **not** open port 3000 — the app listens on `127.0.0.1` only and everything
goes through Caddy. UDP 443 is intentionally closed (HTTP/3 is disabled).

## 3. Elastic IP

EC2 → Elastic IPs → **Allocate**, then **Associate** with `langhao-leads`.
Without this the public address changes when the instance is stopped/started.

## 4. DNS

At your DNS provider create:

```
leads.your-company.com   A   <the Elastic IP>   TTL 300
```

Check from your laptop: `dig +short leads.your-company.com` returns the IP.
Caddy cannot get a certificate until this resolves.

## 5. Prepare the server (once)

```bash
ssh -i your-key.pem ec2-user@<elastic-ip>

sudo dnf install -y git
git clone https://github.com/sylsylshi33-dev/Langhao-Exibition-Sheet.git
cd Langhao-Exibition-Sheet

sudo ./deploy/bootstrap-ec2.sh --domain leads.your-company.com --email you@your-company.com
```

This installs a pinned Node 22 (checksum-verified), creates the `langhao` and
`caddy` users, `/opt/langhao`, `/var/lib/langhao`, `/var/backups/langhao`,
writes `/etc/langhao/langhao.env` with a **generated admin password**, installs
the systemd services and daily backup timer, and installs Caddy with your
domain. It is safe to run again. Preview it first with
`sudo DRY_RUN=1 ./deploy/bootstrap-ec2.sh --domain …`.

Read the generated admin password and store it in your password manager:

```bash
sudo grep ADMIN_PASSWORD /etc/langhao/langhao.env
```

## 6. Deploy the first release

**Option A — build on your laptop (recommended; needs no build tools on the server):**

```bash
# on your laptop, in the repository
nvm use && npm ci
npm run release                          # → dist/langhao-….tar.gz and .sha256

scp -i your-key.pem dist/langhao-*.tar.gz dist/langhao-*.tar.gz.sha256 ec2-user@<elastic-ip>:/tmp/
ssh -i your-key.pem ec2-user@<elastic-ip> 'sudo /opt/langhao/bin/deploy.sh /tmp/langhao-<…>.tar.gz'
```

**Option B — build on the server from GitHub:**

```bash
sudo dnf install -y git
sudo /opt/langhao/bin/update-from-git.sh            # builds origin/main and deploys it
```

`deploy.sh` verifies the checksum, unpacks, switches, restarts, waits for
`/api/healthz`, and rolls back automatically if it never becomes healthy.

## 7. Verify

```bash
curl -s https://leads.your-company.com/api/healthz      # {"status":"ok"}
sudo journalctl -u langhao -n 20 --no-pager              # "[startup] data dir: /var/lib/langhao | schema v2 | admin: enabled"
sudo systemctl status caddy langhao --no-pager
```

Then in a browser:

1. `https://leads.your-company.com` shows the form, padlock present, and
   `http://…` redirects to `https://…`.
2. Submit a test enquiry **from your phone on mobile data** with 2–3 photos.
3. `https://leads.your-company.com/admin` → log in → the lead, its photos,
   status change, **Download CSV** (open in Excel: Chinese text should be correct).
4. Reboot test: `sudo reboot`, wait a minute, repeat step 1 — everything must
   come back by itself.

## 8. Backups and monitoring

- **Daily backup** is already scheduled (03:00 Beijing time) and keeps 14
  snapshots in `/var/backups/langhao`. Confirm:
  `systemctl list-timers langhao-backup.timer` and
  `sudo -u langhao /opt/langhao/bin/backup.sh manual && ls /var/backups/langhao`.
- **Off-instance copy (strongly recommended)** — pick one or both:
  - *EBS snapshots:* EC2 → Lifecycle Manager → create a policy for volumes
    tagged `langhao`, daily, retain 7.
  - *S3:* create a private bucket, attach an instance role allowing
    `s3:PutObject`/`ListBucket` on it, set `BACKUP_S3_URI=s3://bucket/path`
    in `/etc/langhao/langhao.env`; backups then sync automatically.
- **Do one restore drill** now, while the data is a test lead:
  [OPERATIONS.md → Restoring](OPERATIONS.md#restoring-from-a-backup).
- **Uptime monitor:** point an external monitor (UptimeRobot, Healthchecks.io,
  Better Stack, …) at `https://leads.your-company.com/api/healthz`, alert on
  any non-200, email/SMS to two people. It also goes red if disk space or the
  admin password configuration is wrong.
- **Instance alarm:** CloudWatch → alarm on `StatusCheckFailed` → SNS email
  (optional, but cheap).

## 9. Clear test data, then go live

The dashboard has no delete button, so start the show with an empty
database: [OPERATIONS.md → Clearing test data](OPERATIONS.md#clearing-test-data-before-the-show).

Before printing anything:

- [ ] [CHINA-TESTING.md](CHINA-TESTING.md) acceptance criteria met on real mainland devices.
- [ ] The QR code encodes `https://leads.your-company.com/` (final domain, https, trailing slash optional).
- [ ] Admin password stored in your password manager; two people know where.
- [ ] A backup exists and one restore has been rehearsed.
- [ ] Uptime monitor is green and alerts reach a person.
- [ ] You have chosen the privacy wording (below).

## Decisions before launch

These are yours to make; the code is ready for them:

1. **Privacy notice / consent.** The form collects personal information of
   people in mainland China and stores it on an overseas server. The only text
   today is one line on the landing page (`landing.disclaimer` in
   `src/components/enquiry/i18n.tsx`). Have your legal adviser decide the
   wording, whether explicit consent is needed, retention period, and how you
   will honour deletion requests (there is no in-app delete yet).
2. **AWS region.** No region guarantees mainland reachability. Pick, test with
   [CHINA-TESTING.md](CHINA-TESTING.md), and be prepared to move if results are poor.
3. **Who gets the admin password**, and how you will rotate it afterwards.
4. **Retention** — how long after the show leads and photos are kept.

## Rebuilding the server from scratch

All state is in `/var/lib/langhao` (and `/etc/langhao/langhao.env`). On a new
instance: repeat steps 1–6, then
`sudo /opt/langhao/bin/restore.sh <backup-snapshot>` with a snapshot copied
from S3 or an EBS snapshot. Keep the admin password so staff don't need a new one.
