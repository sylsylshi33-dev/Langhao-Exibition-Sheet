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
  type RequestType,
  type UploadedImage,
} from "@/lib/types";
import { LanguageToggle, useI18n } from "./i18n";
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
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-[13px] font-bold text-white">
        R
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
 * True when we have enough to follow up: either a business card was uploaded,
 * or the required manual fields (name, company, email, country) are all filled.
 */
export function contactReady(d: LeadDraft): boolean {
  if (d.businessCard) return true;
  return (
    d.name.trim() !== "" &&
    d.company.trim() !== "" &&
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

  const manualField = (
    key: "name" | "company" | "jobTitle" | "country" | "phone" | "email" | "wechat",
    extra?: { required?: boolean; inputMode?: "tel" | "email"; autoComplete?: string },
  ) => (
    <Field label={c.fields[key]} htmlFor={key} required={extra?.required}>
      <input
        id={key}
        className={inputClass}
        value={draft[key]}
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
          {manualField("name", { required: true, autoComplete: "name" })}
          {manualField("company", { required: true, autoComplete: "organization" })}
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
  images,
  onAdd,
  onRemove,
  models,
  onAddModel,
  onRemoveModel,
}: {
  images: UploadedImage[];
  onAdd: (files: FileList) => void;
  onRemove: (id: string) => void;
  models: string[];
  onAddModel: (value: string) => void;
  onRemoveModel: (index: number) => void;
}) {
  const { t } = useI18n();
  const p = t.products;
  const [modelInput, setModelInput] = useState("");

  const commitModel = () => {
    const value = modelInput.trim();
    if (!value) return;
    onAddModel(value);
    setModelInput("");
  };

  return (
    <div className="space-y-6">
      <SectionHeading title={p.title} subtitle={p.subtitle} />

      {/* Photos */}
      <div className="space-y-3">
        <PhotoSourceButtons
          multiple
          takeLabel={p.takePhoto}
          uploadLabel={p.uploadPhoto}
          onFiles={onAdd}
        />

        {images.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.name}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => onRemove(img.id)}
                    aria-label={p.removePhotoAria}
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/70 text-white backdrop-blur transition hover:bg-slate-900"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400">{p.photoCount(images.length)}</p>
          </>
        )}

        {images.length === 0 && (
          <p className="text-xs text-slate-400">{p.emptyHint}</p>
        )}
      </div>

      {/* Product model / item numbers */}
      <div className="space-y-2 border-t border-slate-100 pt-6">
        <label htmlFor="model" className="block text-sm font-medium text-slate-700">
          {p.modelsLabel}
        </label>
        <p className="text-xs text-slate-400">{p.modelsHint}</p>
        <div className="flex gap-2">
          <input
            id="model"
            className={`${inputClass} flex-1`}
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitModel();
              }
            }}
            placeholder={p.modelPlaceholder}
          />
          <Button
            variant="secondary"
            onClick={commitModel}
            disabled={!modelInput.trim()}
            className="shrink-0 px-4 md:h-12"
          >
            {t.common.add}
          </Button>
        </div>
        {models.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {models.map((m, i) => (
              <span
                key={`${m}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-3 pr-1.5 text-sm text-slate-700"
              >
                {m}
                <button
                  type="button"
                  onClick={() => onRemoveModel(i)}
                  aria-label={p.removeModelAria}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
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

export function SubmitScreen({
  draft,
  goToStep,
}: {
  draft: LeadDraft;
  goToStep: (step: "contact" | "products" | "request") => void;
}) {
  const { t } = useI18n();
  const r = t.review;

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
          {draft.name || draft.company ? (
            <>
              <span className="font-medium text-slate-900">
                {draft.name || r.none}
              </span>
              {(draft.company || draft.jobTitle) && (
                <div className="mt-0.5 text-xs text-slate-400">
                  {[draft.company, draft.jobTitle].filter(Boolean).join(" · ")}
                </div>
              )}
            </>
          ) : (
            r.none
          )}
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

        <SummaryRow label={r.rows.photos} editLabel={r.edit} onEdit={() => goToStep("products")}>
          {draft.productImages.length > 0 ? (
            <>
              <span>{r.photoCount(draft.productImages.length)}</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {draft.productImages.slice(0, 6).map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={img.id}
                    src={img.url}
                    alt={img.name}
                    className="h-12 w-12 rounded-lg border border-slate-200 object-cover"
                  />
                ))}
              </div>
            </>
          ) : (
            r.notUploaded
          )}
        </SummaryRow>

        {draft.productModels.length > 0 && (
          <SummaryRow label={r.rows.models} editLabel={r.edit} onEdit={() => goToStep("products")}>
            <div className="flex flex-wrap gap-1.5">
              {draft.productModels.map((m, i) => (
                <span
                  key={`${m}-${i}`}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                >
                  {m}
                </span>
              ))}
            </div>
          </SummaryRow>
        )}

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
