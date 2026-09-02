# 展会线索登记 · Exhibition Lead Capture (MVP)

A polished demo of a **lead-capture / sales-follow-up** tool for trade shows.
A booth visitor scans a QR code, leaves their contact details, snaps photos of
the products they liked, and submits an enquiry. Staff pick it up later in an
admin dashboard.

This is **not** an e-commerce site: no prices, no cart, no checkout, no product
catalogue.

## Status

| Part | State |
| --- | --- |
| Customer flow (landing → contact → product photos → request → submit → success) | ✅ Built, fully clickable |
| Bilingual 中 / EN (toggle in the header, default Chinese, remembered per visitor) | ✅ |
| Business card + product photos: separate **Take photo** / **Upload** actions | ✅ |
| Product model / item numbers on the products step (add as tags) | ✅ |
| Responsive phone + iPad layouts | ✅ Verified at 375 / 768 / 1024 px |
| Supabase (database + image storage) | ⬜ Not wired yet — submit is simulated |
| Admin dashboard + lead detail | ⬜ Next step |

On submit the flow simulates a short delay and logs the assembled payload to the
browser console (`[demo] lead submitted: …`). Nothing is persisted yet.

## Run it

```bash
cd ~/exhibition-lead-capture
npm run dev
```

Then open http://localhost:3000 — best viewed with the browser dev-tools device
toolbar set to an iPhone (375–430 px) or iPad (768 / 1024 px).

## Tech

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4. Supabase +
Vercel are the intended backend/host and will be added next.

## Where things live

```
src/
├── app/
│   ├── layout.tsx          # <html lang> (updated by the language toggle), metadata
│   ├── globals.css         # Tailwind + design tokens (font stack, light theme)
│   └── page.tsx            # customer entry point — the QR-code URL
├── lib/
│   └── types.ts            # LeadDraft / Lead / REQUEST_TYPES / statuses
└── components/enquiry/
    ├── EnquiryFlow.tsx     # state machine + page chrome (header, progress, action bar)
    ├── screens.tsx         # the six screens (presentational)
    ├── i18n.tsx            # 中 / EN string bundle + LanguageProvider + LanguageToggle
    ├── ui.tsx              # Button, Field, SegmentedControl, PhotoSourceButtons …
    └── icons.tsx           # small inline SVG icons (no icon library)
```

The state machine in `EnquiryFlow.tsx` holds one `LeadDraft` object and moves
through steps `landing → contact → products → request → submit → success`.
Uploaded images are kept in memory as `File`s with `URL.createObjectURL`
previews (revoked on removal / reset).

**Copy / translations** all live in `i18n.tsx` (`STRINGS.zh` / `STRINGS.en`).
Add a language by adding a third bundle. `RequestType` values stay Chinese as the
stable storage key; their display text is looked up per-language.

**Take photo vs. Upload** is just two `<input type="file">`s — the "Take photo"
one carries `capture="environment"` so phones open the camera directly; the
"Upload" one omits it so the OS shows the album / file picker.

## Next steps (not done yet)

1. **Supabase**: create a `leads` table matching `Lead` in `src/lib/types.ts`,
   plus two Storage buckets (`business-cards`, `product-images`). Replace the
   simulated submit in `EnquiryFlow.tsx > handleSubmit` with real uploads + insert.
2. **Admin dashboard** at `/admin`: list of leads (name, company, interest,
   photo count, status) → clickable lead detail page → status dropdown
   (新线索 / 已联系 / 已报价 / 已成交 / 已流失).
3. **Deploy** to Vercel.

Manual configuration you'll need to do yourself is called out in the step above
(creating the Supabase project, table, buckets, and pasting the project URL +
anon key into `.env.local`).
