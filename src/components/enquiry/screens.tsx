"use client";

/*
 * The individual customer-facing screens.
 *
 * These are all "dumb" presentational components: they receive the current
 * draft plus callbacks from <EnquiryFlow /> and render one step of the form.
 * All copy comes from the bilingual bundle via `useI18n()`.
 */

import { useState, type ReactNode } from "react";
import {
  EMPTY_DRAFT,
  REQUEST_TYPES,
  type LeadDraft,
  type ProductDraft,
  type RequestType,
} from "@/lib/types";
import { LanguageToggle, useI18n } from "./i18n";
import { MAX_PHOTOS_PER_PRODUCT, MAX_PRODUCTS, MAX_TOTAL_PHOTOS } from "./image";
import { isBlankProduct, productHasPhotoOrSku, submittableProducts } from "./products";
import {
  CheckIcon,
  ChatIcon,
  ClockIcon,
  IdCardIcon,
  XIcon,
} from "./icons";
import {
  Button,
  Field,
  PhotoSourceButtons,
  SectionHeading,
  SegmentedControl,
  inputClass,
  textareaClass,
} from "./ui";

/* Brand mark used on the landing / success cards and in the header. */
export function BrandMark() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-slate-900 px-1.5 text-[11px] font-bold tracking-[0.04em] text-white">
        SXLH
      </span>
      <span className="text-sm font-semibold tracking-tight text-slate-900">
        {t.brandName}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Screen 1 — Landing                                                  */
/* ------------------------------------------------------------------ */

export function LandingScreen({ onStart }: { onStart: () => void }) {
  const { t } = useI18n();
  const icons = [ClockIcon, IdCardIcon, ChatIcon];

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10 md:max-w-lg md:py-16">
        <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm md:p-12 md:shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <BrandMark />
            <LanguageToggle />
          </div>

          <h1 className="mt-8 text-2xl font-semibold tracking-tight text-slate-900 md:mt-10 md:text-[32px] md:leading-tight">
            {t.landing.title}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-500 md:text-lg">
            {t.landing.subtitle}
          </p>

          <ul className="mt-8 space-y-3.5 md:mt-10">
            {t.landing.points.map((text, i) => {
              const Icon = icons[i] ?? ClockIcon;
              return (
                <li
                  key={text}
                  className="flex items-center gap-3 text-sm text-slate-600 md:text-base"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100">
                    <Icon className="h-[18px] w-[18px] text-slate-500" />
                  </span>
                  {text}
                </li>
              );
            })}
          </ul>

          <Button fullWidth className="mt-9 md:mt-11" onClick={onStart}>
            {t.landing.cta}
          </Button>
          <p className="mt-4 text-center text-xs text-slate-400">
            {t.landing.disclaimer}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen 2 — Contact information                                      */
/* ------------------------------------------------------------------ */

/**
 * True when we have enough to follow up. The company name and the visitor's
 * own name are always required (a business card photo alone never identifies
 * them); beyond that, either a business card was uploaded or email and country
 * are filled.
 */
export function contactReady(d: LeadDraft): boolean {
  if (d.company.trim() === "" || d.name.trim() === "") return false;
  if (d.businessCard) return true;
  return (
    d.email.trim() !== "" &&
    d.country.trim() !== ""
  );
}

type ContactMode = "card" | "manual";

export function ContactScreen({
  draft,
  mode,
  onModeChange,
  onChange,
  onBusinessCard,
  onRemoveBusinessCard,
}: {
  draft: LeadDraft;
  mode: ContactMode;
  onModeChange: (mode: ContactMode) => void;
  onChange: (patch: Partial<LeadDraft>) => void;
  onBusinessCard: (file: File) => void;
  onRemoveBusinessCard: () => void;
}) {
  const { t } = useI18n();
  const c = t.contact;
  const [nameTouched, setNameTouched] = useState(false);
  const [companyTouched, setCompanyTouched] = useState(false);
  const nameMissing = draft.name.trim() === "";
  const companyMissing = draft.company.trim() === "";

  const manualField = (
    key: "jobTitle" | "country" | "phone" | "email" | "wechat",
    extra?: { required?: boolean; inputMode?: "tel" | "email"; autoComplete?: string },
  ) => (
    <Field label={c.fields[key]} htmlFor={key} required={extra?.required}>
      <input
        id={key}
        className={inputClass}
        value={draft[key]}
        maxLength={key === "email" ? 254 : key === "phone" ? 40 : 100}
        inputMode={extra?.inputMode}
        autoComplete={extra?.autoComplete}
        onChange={(e) => onChange({ [key]: e.target.value } as Partial<LeadDraft>)}
        placeholder={c.placeholders[key]}
      />
    </Field>
  );

  return (
    <div className="space-y-6">
      <SectionHeading title={c.title} subtitle={c.subtitle} />

      {/* Company name and the visitor's own name come first and are always required,
          whichever way the rest of the contact details are given. */}
      <Field label={c.fields.company} htmlFor="company" required>
        <input
          id="company"
          className={`${inputClass} ${companyTouched && companyMissing ? "border-rose-400" : ""}`}
          value={draft.company}
          maxLength={100}
          autoComplete="organization"
          aria-invalid={companyTouched && companyMissing}
          aria-describedby={companyTouched && companyMissing ? "company-error" : undefined}
          onChange={(e) => onChange({ company: e.target.value })}
          onBlur={() => setCompanyTouched(true)}
          placeholder={c.placeholders.company}
        />
        {companyTouched && companyMissing && (
          <p id="company-error" role="alert" className="text-sm font-medium text-rose-600">
            {c.companyRequired}
          </p>
        )}
      </Field>

      <Field label={c.fields.name} htmlFor="name" required hint={nameTouched && nameMissing ? undefined : c.nameHint}>
        <input
          id="name"
          className={`${inputClass} ${nameTouched && nameMissing ? "border-rose-400" : ""}`}
          value={draft.name}
          maxLength={100}
          autoComplete="name"
          aria-invalid={nameTouched && nameMissing}
          aria-describedby={nameTouched && nameMissing ? "name-error" : undefined}
          onChange={(e) => onChange({ name: e.target.value })}
          onBlur={() => setNameTouched(true)}
          placeholder={c.placeholders.name}
        />
        {nameTouched && nameMissing && (
          <p id="name-error" role="alert" className="text-sm font-medium text-rose-600">
            {c.nameRequired}
          </p>
        )}
      </Field>

      <SegmentedControl<ContactMode>
        value={mode}
        onChange={onModeChange}
        options={[
          { value: "card", label: c.modeCard },
          { value: "manual", label: c.modeManual },
        ]}
      />

      {mode === "card" ? (
        <div className="space-y-3">
          {draft.businessCard ? (
            <>
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={draft.businessCard.url}
                  alt="business card"
                  className="max-h-60 w-full object-contain"
                />
                <button
                  type="button"
                  onClick={onRemoveBusinessCard}
                  aria-label={c.removeCardAria}
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/70 text-white backdrop-blur transition hover:bg-slate-900"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
              <PhotoSourceButtons
                takeLabel={c.takePhoto}
                uploadLabel={c.replace}
                onFiles={(files) => onBusinessCard(files[0])}
              />
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">{c.cardPrompt}</p>
              <PhotoSourceButtons
                takeLabel={c.takePhoto}
                uploadLabel={c.uploadPhoto}
                onFiles={(files) => onBusinessCard(files[0])}
              />
            </div>
          )}
          <p className="text-xs text-slate-400">{c.cardHint}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {manualField("email", {
            required: true,
            inputMode: "email",
            autoComplete: "email",
          })}
          {manualField("country", { required: true, autoComplete: "country-name" })}
          {manualField("jobTitle", { autoComplete: "organization-title" })}
          {manualField("phone", { inputMode: "tel", autoComplete: "tel" })}
          {manualField("wechat")}
          <p className="text-xs text-slate-400 md:col-span-2">{c.manualHint}</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen 3 — Products they're interested in                           */
/* ------------------------------------------------------------------ */

export function ProductsScreen({
  products,
  showErrors,
  onAddProduct,
  onRemoveProduct,
  onChangeProduct,
  onAddPhotos,
  onRemovePhoto,
}: {
  products: ProductDraft[];
  showErrors: boolean;
  onAddProduct: () => void;
  onRemoveProduct: (id: string) => void;
  onChangeProduct: (id: string, patch: Partial<Omit<ProductDraft, "id" | "photos">>) => void;
  onAddPhotos: (productId: string, files: FileList) => void;
  onRemovePhoto: (productId: string, imageId: string) => void;
}) {
  const { t } = useI18n();
  const p = t.products;
  const totalPhotos = products.reduce((n, item) => n + item.photos.length, 0);

  return (
    <div className="space-y-6">
      <SectionHeading title={p.title} subtitle={p.subtitle} />

      <ol className="space-y-5">
        {products.map((product, index) => {
          const invalid =
            showErrors && !isBlankProduct(product) && !productHasPhotoOrSku(product);
          const photosFull =
            product.photos.length >= MAX_PHOTOS_PER_PRODUCT || totalPhotos >= MAX_TOTAL_PHOTOS;
          const id = product.id;
          return (
            <li
              key={id}
              id={`product-${id}`}
              className={`rounded-2xl border p-4 md:p-5 ${
                invalid ? "border-rose-300 bg-rose-50/40" : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900">{p.productN(index + 1)}</h2>
                {products.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveProduct(id)}
                    aria-label={p.removeProductAria(index + 1)}
                    className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-rose-600"
                  >
                    <XIcon className="h-4 w-4" />
                    {p.removeProduct}
                  </button>
                )}
              </div>

              {/* Photo: the label is what the sales team needs */}
              <div className="mt-3 space-y-3">
                <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-sm leading-relaxed text-slate-600">
                  <span className="font-medium text-slate-800">{p.labelInstruction}</span>
                  <span className="mt-1 block text-xs text-slate-400">{p.photoOrSku}</span>
                </p>

                {!photosFull && (
                  <PhotoSourceButtons
                    multiple
                    compact
                    takeLabel={p.takePhoto}
                    uploadLabel={p.uploadPhoto}
                    onFiles={(files) => onAddPhotos(id, files)}
                  />
                )}

                {product.photos.length > 0 && (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      {product.photos.map((img) => (
                        <div
                          key={img.id}
                          className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.url} alt={img.name} className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => onRemovePhoto(id, img.id)}
                            aria-label={p.removePhotoAria}
                            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/70 text-white backdrop-blur transition hover:bg-slate-900"
                          >
                            <XIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400">
                      {p.photoCount(product.photos.length)}
                      {product.photos.length >= MAX_PHOTOS_PER_PRODUCT
                        ? ` · ${p.maxPhotos(MAX_PHOTOS_PER_PRODUCT)}`
                        : totalPhotos >= MAX_TOTAL_PHOTOS
                          ? ` · ${p.maxTotalPhotos(MAX_TOTAL_PHOTOS)}`
                          : ""}
                    </p>
                  </>
                )}
              </div>

              <div className="mt-4 space-y-4">
                <Field label={p.skuLabel} htmlFor={`sku-${id}`}>
                  <input
                    id={`sku-${id}`}
                    maxLength={60}
                    className={inputClass}
                    value={product.sku}
                    onChange={(e) => onChangeProduct(id, { sku: e.target.value })}
                    placeholder={p.skuPlaceholder}
                    autoCapitalize="characters"
                    autoCorrect="off"
                  />
                </Field>

                {invalid && (
                  <p role="alert" className="text-sm font-medium text-rose-600">
                    {p.needPhotoOrSku}
                  </p>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={p.colourLabel} htmlFor={`colour-${id}`} badge={p.recommended}>
                    <input
                      id={`colour-${id}`}
                      maxLength={60}
                      className={inputClass}
                      value={product.colour}
                      onChange={(e) => onChangeProduct(id, { colour: e.target.value })}
                      placeholder={p.colourPlaceholder}
                    />
                  </Field>
                  <Field label={p.quantityLabel} htmlFor={`quantity-${id}`} badge={p.recommended}>
                    <input
                      id={`quantity-${id}`}
                      maxLength={40}
                      className={inputClass}
                      value={product.quantity}
                      onChange={(e) => onChangeProduct(id, { quantity: e.target.value })}
                      placeholder={p.quantityPlaceholder}
                    />
                  </Field>
                </div>

                <Field label={p.packagingLabel} htmlFor={`packaging-${id}`} badge={p.recommended}>
                  <textarea
                    id={`packaging-${id}`}
                    maxLength={500}
                    rows={2}
                    className={textareaClass}
                    value={product.packaging}
                    onChange={(e) => onChangeProduct(id, { packaging: e.target.value })}
                    placeholder={p.packagingPlaceholder}
                  />
                </Field>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="space-y-2">
        <Button
          variant="secondary"
          fullWidth
          onClick={onAddProduct}
          disabled={products.length >= MAX_PRODUCTS}
        >
          + {p.addProduct}
        </Button>
        <p className="text-center text-xs text-slate-400">
          {products.length >= MAX_PRODUCTS
            ? p.maxProducts(MAX_PRODUCTS)
            : products.length > 0
              ? p.productCount(products.length, MAX_PRODUCTS)
              : p.emptyHint}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen 4 — What do they want?                                       */
/* ------------------------------------------------------------------ */

export function RequestScreen({
  selected,
  message,
  onToggle,
  onMessageChange,
}: {
  selected: RequestType[];
  message: string;
  onToggle: (value: RequestType) => void;
  onMessageChange: (value: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <SectionHeading title={t.request.title} subtitle={t.request.subtitle} />

      <div className="grid gap-3 sm:grid-cols-2">
        {REQUEST_TYPES.map((value) => {
          const opt = t.requestOptions[value];
          const active = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => onToggle(value)}
              className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                active
                  ? "border-slate-900 bg-slate-900/[0.03] ring-1 ring-slate-900"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300"
                }`}
              >
                {active && <CheckIcon className="h-3.5 w-3.5" />}
              </span>
              <span>
                <span className="block text-sm font-medium text-slate-900">
                  {opt.label}
                </span>
                <span className="mt-0.5 block text-xs text-slate-400">
                  {opt.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <Field label={t.request.messageLabel} htmlFor="message">
        <textarea
          id="message"
          maxLength={2000}
          className={textareaClass}
          rows={4}
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          placeholder={t.request.messagePlaceholder}
        />
      </Field>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen 5 — Review & submit                                          */
/* ------------------------------------------------------------------ */

function SummaryRow({
  label,
  editLabel,
  onEdit,
  children,
}: {
  label: string;
  editLabel: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {label}
        </span>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          {editLabel}
        </button>
      </div>
      <div className="mt-1 text-sm text-slate-800">{children}</div>
    </div>
  );
}

function ProductLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words">{value}</dd>
    </div>
  );
}

export function SubmitScreen({
  draft,
  goToStep,
}: {
  draft: LeadDraft;
  goToStep: (step: "contact" | "products" | "request") => void;
}) {
  const { t } = useI18n();
  const r = t.review;

  const products = submittableProducts(draft.products);

  const reachLines = [
    draft.phone && `${r.reachPrefix.phone} ${draft.phone}`,
    draft.email && `${r.reachPrefix.email} ${draft.email}`,
    draft.wechat && `${r.reachPrefix.wechat} ${draft.wechat}`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <SectionHeading title={r.title} subtitle={r.subtitle} />

      <dl className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
        <SummaryRow label={r.rows.contact} editLabel={r.edit} onEdit={() => goToStep("contact")}>
          <span className="font-medium text-slate-900">
            {draft.company || r.none} ({draft.name || r.none})
          </span>
          {draft.jobTitle && <div className="mt-0.5 text-xs text-slate-400">{draft.jobTitle}</div>}
        </SummaryRow>

        {draft.country && (
          <SummaryRow label={r.rows.country} editLabel={r.edit} onEdit={() => goToStep("contact")}>
            {draft.country}
          </SummaryRow>
        )}

        <SummaryRow label={r.rows.reach} editLabel={r.edit} onEdit={() => goToStep("contact")}>
          {reachLines.length ? reachLines.join(" · ") : r.none}
        </SummaryRow>

        <SummaryRow label={r.rows.card} editLabel={r.edit} onEdit={() => goToStep("contact")}>
          {draft.businessCard ? r.uploaded : r.notUploaded}
        </SummaryRow>

        <SummaryRow label={r.rows.products} editLabel={r.edit} onEdit={() => goToStep("products")}>
          {products.length > 0 ? (
            <ol className="mt-1 space-y-3">
              {products.map((product, index) => (
                <li key={product.id} className="rounded-xl bg-slate-50 p-3">
                  <div className="text-xs font-medium text-slate-500">
                    {t.products.productN(index + 1)}
                  </div>
                  {product.photos.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {product.photos.map((img) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={img.id}
                          src={img.url}
                          alt={img.name}
                          className="h-12 w-12 rounded-lg border border-slate-200 object-cover"
                        />
                      ))}
                    </div>
                  )}
                  <dl className="mt-2 space-y-0.5 text-sm text-slate-700">
                    {product.sku && <ProductLine label={t.products.skuLabel} value={product.sku} />}
                    {product.colour && <ProductLine label={t.products.colourLabel} value={product.colour} />}
                    {product.quantity && <ProductLine label={t.products.quantityLabel} value={product.quantity} />}
                    {product.packaging && (
                      <ProductLine label={t.products.packagingLabel} value={product.packaging} />
                    )}
                  </dl>
                </li>
              ))}
            </ol>
          ) : (
            r.notUploaded
          )}
        </SummaryRow>

        <SummaryRow label={r.rows.interest} editLabel={r.edit} onEdit={() => goToStep("request")}>
          {draft.requestedInformation.length ? (
            <div className="flex flex-wrap gap-1.5">
              {draft.requestedInformation.map((value) => (
                <span
                  key={value}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                >
                  {t.requestOptions[value].label}
                </span>
              ))}
            </div>
          ) : (
            r.none
          )}
        </SummaryRow>

        {draft.message && (
          <SummaryRow label={r.rows.message} editLabel={r.edit} onEdit={() => goToStep("request")}>
            <span className="whitespace-pre-wrap break-words">{draft.message}</span>
          </SummaryRow>
        )}
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen 6 — Success                                                  */
/* ------------------------------------------------------------------ */

export function SuccessScreen({
  referenceId,
  onRestart,
}: {
  referenceId: string;
  onRestart: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-100 px-5 py-16">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm md:max-w-lg md:p-12 md:shadow-xl">
        <div className="flex justify-end">
          <LanguageToggle />
        </div>
        <div className="mx-auto mt-2 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <CheckIcon className="h-8 w-8 text-emerald-600" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
          {t.success.title}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-500 md:text-lg">
          {t.success.body}
        </p>

        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-500">
          {t.success.reference}
          <span className="font-medium text-slate-700">{referenceId}</span>
        </div>

        <Button variant="secondary" fullWidth className="mt-10" onClick={onRestart}>
          {t.success.restart}
        </Button>
      </div>
    </div>
  );
}

/* Re-export so <EnquiryFlow /> can import a fresh draft from one place. */
export { EMPTY_DRAFT };
