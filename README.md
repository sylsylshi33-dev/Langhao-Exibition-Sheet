# 展会线索登记 · Exhibition Lead Capture

A **lead-capture / sales-follow-up** tool for trade shows. A booth visitor uses
the exhibition PC to leave their contact details, snaps photos of the products
they liked, and submits an enquiry. Staff review it later in a password-protected
admin dashboard on the same machine.

This is **not** an e-commerce site: no prices, no cart, no checkout, no product
catalogue.

## Architecture: fully local, fully offline

There is **no cloud backend** (no Supabase, no Vercel, no external service of
any kind). The whole app — visitor form, database, photo storage, admin
dashboard — runs as one Next.js server **on the exhibition PC itself**:

```
visitor's browser  →  Next.js server (this same PC, 127.0.0.1 only)
                          ├─ writes photos to  data/uploads/
                          └─ writes the record to  data/leads.db  (SQLite)
```

- **Database:** SQLite via Node's built-in `node:sqlite` module — no native
  addon to compile, no separate database server to install.
- **Photos:** saved to disk under `data/uploads/`; only the file path is
  stored in SQLite (see `src/lib/db.ts`, `src/lib/uploads.ts`).
- **Everything survives a restart** — closing and reopening the app, or
  rebooting the PC, does not lose data. It's all just files in `data/`.
- **No internet is used or required** at any point, by design (the exhibition
  computer will be in mainland China, where relying on an external cloud
  service is a real risk).
- **Three independent stations:** the same package runs unmodified on each of
  the three exhibition PCs. They do **not** sync with each other — each has
  its own `data/leads.db`. At the end of the event, export a CSV from each
  machine's `/admin` and combine the three afterward (see `launcher/` below).

## Run it (development)

```bash
cd ~/exhibition-lead-capture
npm run dev
```

Open http://localhost:3000 for the visitor form, http://localhost:3000/admin
for the staff dashboard (default password `langhao2026`, set in
`src/lib/adminAuth.ts` / overridden by the `ADMIN_PASSWORD` environment
variable — see `launcher/` for how the packaged app sets it).

## Packaging for the exhibition PCs (Windows)

The exhibition computers should **never need to install Node.js, run `npm
install`, or touch a terminal.** The handoff is a folder containing:

```
Langhao-Exhibition-App/
├── app/                        ← `next build` output (output: "standalone")
├── node/node.exe               ← portable Node runtime, no install needed
├── Start Exhibition App.bat    ← double-click this
└── 使用说明.txt                 ← short Chinese instructions for staff
```

To rebuild this package after a code change:

```bash
npm run build                                   # produces .next/standalone
# copy .next/standalone + public/ + .next/static into Langhao-Exhibition-App/app
# (see the packaging steps used when this was last built, or ask for the
#  packaging script to be regenerated)
```

`next.config.ts` sets `output: "standalone"` specifically so this works —
it produces a minimal, self-contained server bundle that only needs a Node
binary next to it, not a full `npm install` on the target machine.

## Tech

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
`node:sqlite` (Node's built-in SQLite, no external dependency).

## Where things live

```
src/
├── app/
│   ├── layout.tsx                    # <html lang>, metadata
│   ├── globals.css                   # Tailwind + design tokens
│   ├── page.tsx                      # visitor entry point
│   ├── api/leads/route.ts            # public submit endpoint (writes to SQLite + disk)
│   ├── api/admin/...                 # login, list, detail, status update, CSV export, photo serving
│   └── admin/                        # staff pages: login, list, lead detail
├── lib/
│   ├── types.ts                      # LeadDraft / Lead / REQUEST_TYPES / statuses
│   ├── db.ts                         # SQLite access (node:sqlite)
│   ├── uploads.ts                    # saves photos to data/uploads/
│   ├── paths.ts                      # where data/ lives
│   └── adminAuth.ts                  # staff login / session cookie
├── proxy.ts                          # gates /admin + /api/admin/* behind login
└── components/enquiry/
    ├── EnquiryFlow.tsx     # state machine + page chrome (header, progress, action bar)
    ├── screens.tsx         # the six visitor screens (presentational)
    ├── i18n.tsx            # 中 / EN string bundle + LanguageProvider + LanguageToggle
    ├── ui.tsx              # Button, Field, SegmentedControl, PhotoSourceButtons …
    └── icons.tsx           # small inline SVG icons (no icon library)
```

**Copy / translations** all live in `i18n.tsx` (`STRINGS.zh` / `STRINGS.en`).
`RequestType` values stay Chinese as the stable storage key; their display
text is looked up per-language.

**Take photo vs. Upload** is just two `<input type="file">`s — the "Take photo"
one carries `capture="environment"` so phones/tablets open the camera
directly; the "Upload" one omits it so the OS shows the album / file picker.

**Admin auth** is a single shared staff password (no per-user accounts —
this is a kiosk app, not a multi-tenant system), checked in `adminAuth.ts`
and enforced for `/admin/*` and `/api/admin/*` by `src/proxy.ts`.
