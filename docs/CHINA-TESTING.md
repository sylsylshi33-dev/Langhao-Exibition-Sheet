# Testing reachability from mainland China

No cloud region *guarantees* that phones in mainland China can reach it quickly
or at all; cross-border routes vary by carrier, city and time of day, and
change without notice. Treat this as an acceptance test you must pass before
the QR code is printed, and repeat a shortened version the day before the show.

## What the code already does for you

- The visitor page loads **no third-party resources** (no Google Fonts, CDNs,
  analytics or maps) — nothing else that could be blocked has to load.
- Photos are resized and re-encoded to JPEG **in the browser** (≈ 0.3–0.8 MB
  each instead of 3–10 MB) before upload.
- Uploads show progress, give up only when a transfer **stalls** (45 s without
  progress), retry automatically, and a retried submission can never create a
  duplicate lead.
- HTTP/3 (QUIC/UDP) is disabled in Caddy; HTTP/1.1 and HTTP/2 over TCP only.
- The form works on HTTP and HTTPS, but **use HTTPS**: it protects visitors'
  details in transit and staff session cookies are only `Secure` there.

## What you can test yourself (outside China)

| Test | How | Pass |
| --- | --- | --- |
| TLS / redirect / headers | `curl -sI http://<domain>/` → 308 to https; `curl -sI https://<domain>/` has `x-content-type-options`, `x-frame-options`, `strict-transport-security` | as listed |
| Health | `curl -s https://<domain>/api/healthz` | `{"status":"ok"}` |
| Full flow | Phone on mobile data: submit with business card + 3 photos; see it in `/admin` with photos | works |
| Slow network | Chrome DevTools → Network → *Slow 4G* (and a custom 100 kbit/s profile), or macOS Network Link Conditioner "Very Bad Network" | submission completes; progress % moves; no duplicate leads |
| Interruption | Start a submit, switch phone to airplane mode for 10 s, back on | automatic retry succeeds (or the retry message appears and one more tap succeeds); exactly one lead |
| Large originals | Submit 5 untouched 8–12 MP photos | accepted |
| HEIC | iPhone: choose a Live/HEIC photo | accepted, visible in admin (click the thumbnail; Chrome can't render HEIC inline) |
| WeChat in-app browser | Scan the QR with WeChat on iOS and Android *outside* China | page loads, camera/upload work |
| Load | ~10 simultaneous submissions with photos | all succeed (the e2e suite covers 12) |

## What needs someone/something in mainland China

You cannot answer these from your desk. Ask a colleague, partner or the
exhibition organiser's staff, or use a device physically there.

1. **Raw reachability and speed** from at least: China Mobile, China Unicom and
   China Telecom, each on 4G/5G **and** on Wi-Fi, in at least two cities
   (ideally including the exhibition city). Record: does the page load, how
   long (stopwatch), and does it load on a second attempt.
2. **WeChat QR flow** on both iOS and Android: scan from the WeChat scanner and
   from the camera app; note any "this page may be unsafe" interstitial or
   blocked-domain warning (a *new* domain can trigger one).
3. **Real upload test:** card + 3 photos, 3 times per carrier, at different
   times of day (including evening peak). Record time to "thank you" screen.
4. **Older phones** (3–5 years old, Android with the old WeChat X5 engine
   especially): the layout must render and buttons must work. The framework
   targets Chrome/Edge 111+, Safari 16.4+; older web-views are the main risk.
5. **The venue itself:** exhibition halls have congested Wi-Fi and poor mobile
   coverage. Test on-site the day before; note which network works best and
   what you tell visitors (e.g. "use 4G/5G if the hall Wi-Fi is slow").
6. **Admin from China:** staff log in, view photos, download the CSV.

Third-party **mainland probing services** (search for "站长工具 网站测速",
"拨测", e.g. itdog.cn, boce.com, 17ce.com) can show HTTP/DNS reachability from
many mainland cities at once. They are quick and free but only tell you
whether the page responds — they do not test WeChat, uploads or real phones.

## Acceptance criteria (suggested)

- ≥ 95 % of test submissions (card + 3 photos) succeed on the first or
  automatic retry, within 30 s, across ≥ 2 carriers and ≥ 2 cities.
- Landing page usable within ~5 s on 4G.
- No WeChat security warning; if one appears, you have a plan (a different
  domain, or registering/whitelisting through WeChat) **before** the show.
- Verified at two different times of day, and again within 24 h of the show.

## If it fails

In rough order of effort:

1. Retest at a different time of day, and from a different carrier — single
   bad results are common.
2. Try another AWS region closer to mainland routes (Hong Kong or Singapore
   are the usual candidates). The deployment is portable: new instance →
   bootstrap → restore the latest backup → move the DNS record.
3. Put a mainland-friendly CDN/accelerator in front of the same origin.
   Serving *from inside* mainland China requires an ICP filing and a
   mainland-based provider — a project of weeks, with legal prerequisites
   (a Chinese business entity), not a quick fix.
4. Fallback for the booth itself: the **offline bundle** on a PC at the stand
   (`./scripts/package-windows.sh`) — staff enter or visitors fill leads
   locally with no internet, export CSV at the end.

Keep a one-page "if the QR doesn't load" instruction at the booth (a phone
number or an email to leave details) either way.

## Results log

| Date | Tester / place | Carrier + network | Page load | Submit time | WeChat warning? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |
