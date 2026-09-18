"use client";

/*
 * <EnquiryFlow /> — the whole customer-facing journey:
 *
 *   landing → contact → products → request → submit → success
 *
 * It owns all form state (a single `LeadDraft`), the current step, and the
 * shared page chrome (header, progress bar, sticky action bar). Each step's
 * UI lives in ./screens.tsx. Copy is bilingual via ./i18n.tsx.
 *
 * On submit, the draft (plus the original photo Files) is posted to
 * /api/leads, which saves everything to the local SQLite database and
 * uploads folder on this machine — see src/lib/db.ts and src/lib/uploads.ts.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_DRAFT,
  type LeadDraft,
  type RequestType,
  type UploadedImage,
} from "@/lib/types";
import { ChevronLeftIcon } from "./icons";
import { LanguageToggle, useI18n } from "./i18n";
import { Button } from "./ui";
import {
  BrandMark,
  ContactScreen,
  LandingScreen,
  ProductsScreen,
  RequestScreen,
  SubmitScreen,
  SuccessScreen,
  contactReady,
} from "./screens";

type Step = "landing" | "contact" | "products" | "request" | "submit" | "success";

/** Steps that show the progress bar (landing / success are excluded). */
const WIZARD_KEYS = ["contact", "products", "request", "submit"] as const;

const PREVIOUS: Partial<Record<Step, Step>> = {
  contact: "landing",
  products: "contact",
  request: "products",
  submit: "request",
};

const NEXT: Partial<Record<Step, Step>> = {
  contact: "products",
  products: "request",
  request: "submit",
};

function makeImage(file: File): UploadedImage {
  return {
    id: crypto.randomUUID(),
    url: URL.createObjectURL(file),
    name: file.name,
    file,
  };
}

function makeReferenceId(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
  const seq = String(Math.floor(Math.random() * 900) + 100);
  return `LC-${ymd}-${seq}`;
}

export function EnquiryFlow() {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>("landing");
  const [draft, setDraft] = useState<LeadDraft>(EMPTY_DRAFT);
  const [contactMode, setContactMode] = useState<"card" | "manual">("card");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [referenceId, setReferenceId] = useState("");

  // Mirror the draft in a ref so the unmount cleanup can revoke object URLs
  // without re-running on every keystroke.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  });
  useEffect(() => {
    return () => {
      draftRef.current.productImages.forEach((i) => URL.revokeObjectURL(i.url));
      if (draftRef.current.businessCard) {
        URL.revokeObjectURL(draftRef.current.businessCard.url);
      }
    };
  }, []);

  /* ---------- draft mutations ---------- */

  const update = useCallback((patch: Partial<LeadDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  const setBusinessCard = useCallback((file: File) => {
    setDraft((d) => {
      if (d.businessCard) URL.revokeObjectURL(d.businessCard.url);
      return { ...d, businessCard: makeImage(file) };
    });
  }, []);

  const removeBusinessCard = useCallback(() => {
    setDraft((d) => {
      if (d.businessCard) URL.revokeObjectURL(d.businessCard.url);
      return { ...d, businessCard: null };
    });
  }, []);

  const addProductImages = useCallback((files: FileList) => {
    const next = Array.from(files).map(makeImage);
    setDraft((d) => ({ ...d, productImages: [...d.productImages, ...next] }));
  }, []);

  const removeProductImage = useCallback((id: string) => {
    setDraft((d) => {
      const img = d.productImages.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.url);
      return { ...d, productImages: d.productImages.filter((i) => i.id !== id) };
    });
  }, []);

  const addProductModel = useCallback((value: string) => {
    setDraft((d) =>
      d.productModels.includes(value)
        ? d
        : { ...d, productModels: [...d.productModels, value] },
    );
  }, []);

  const removeProductModel = useCallback((index: number) => {
    setDraft((d) => ({
      ...d,
      productModels: d.productModels.filter((_, i) => i !== index),
    }));
  }, []);

  const toggleRequest = useCallback((value: RequestType) => {
    setDraft((d) => ({
      ...d,
      requestedInformation: d.requestedInformation.includes(value)
        ? d.requestedInformation.filter((v) => v !== value)
        : [...d.requestedInformation, value],
    }));
  }, []);

  /* ---------- navigation ---------- */

  const goBack = useCallback(() => {
    setStep((s) => PREVIOUS[s] ?? s);
  }, []);

  const goNext = useCallback(() => {
    setStep((s) => NEXT[s] ?? s);
  }, []);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError("");

    const formData = new FormData();
    formData.append("name", draft.name);
    formData.append("company", draft.company);
    formData.append("jobTitle", draft.jobTitle);
    formData.append("country", draft.country);
    formData.append("phone", draft.phone);
    formData.append("email", draft.email);
    formData.append("wechat", draft.wechat);
    formData.append("message", draft.message);
    formData.append("requestedInformation", JSON.stringify(draft.requestedInformation));
    formData.append("productModels", JSON.stringify(draft.productModels));
    if (draft.businessCard) formData.append("businessCard", draft.businessCard.file);
    draft.productImages.forEach((img) => formData.append("productImages", img.file));

    try {
      const res = await fetch("/api/leads", { method: "POST", body: formData });
      if (!res.ok) throw new Error("submit failed");
      setReferenceId(makeReferenceId());
      setStep("success");
    } catch {
      setSubmitError(t.review.submitError);
    } finally {
      setSubmitting(false);
    }
  }, [draft, t]);

  const restart = useCallback(() => {
    draft.productImages.forEach((i) => URL.revokeObjectURL(i.url));
    if (draft.businessCard) URL.revokeObjectURL(draft.businessCard.url);
    setDraft(EMPTY_DRAFT);
    setContactMode("card");
    setReferenceId("");
    setSubmitError("");
    setStep("landing");
  }, [draft]);

  /* ---------- full-screen states ---------- */

  if (step === "landing") {
    return <LandingScreen onStart={() => setStep("contact")} />;
  }
  if (step === "success") {
    return <SuccessScreen referenceId={referenceId} onRestart={restart} />;
  }

  /* ---------- wizard ---------- */

  const wizardIndex = WIZARD_KEYS.indexOf(step as (typeof WIZARD_KEYS)[number]);
  const stepLabels = [
    t.progress.contact,
    t.progress.products,
    t.progress.request,
    t.progress.submit,
  ];
  const canAdvance = step === "contact" ? contactReady(draft) : true;
  const isLastStep = step === "submit";

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      <Header onBack={goBack} />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-xl px-4 py-5 md:max-w-2xl md:px-6 md:py-10">
          <Progress index={wizardIndex} labels={stepLabels} />

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm md:mt-6 md:rounded-3xl md:shadow-xl">
            <div className="p-5 md:p-9">
              {step === "contact" && (
                <ContactScreen
                  draft={draft}
                  mode={contactMode}
                  onModeChange={setContactMode}
                  onChange={update}
                  onBusinessCard={setBusinessCard}
                  onRemoveBusinessCard={removeBusinessCard}
                />
              )}
              {step === "products" && (
                <ProductsScreen
                  images={draft.productImages}
                  onAdd={addProductImages}
                  onRemove={removeProductImage}
                  models={draft.productModels}
                  onAddModel={addProductModel}
                  onRemoveModel={removeProductModel}
                />
              )}
              {step === "request" && (
                <RequestScreen
                  selected={draft.requestedInformation}
                  message={draft.message}
                  onToggle={toggleRequest}
                  onMessageChange={(v) => update({ message: v })}
                />
              )}
              {step === "submit" && (
                <SubmitScreen draft={draft} goToStep={setStep} />
              )}
            </div>

            <div className="sticky bottom-0 z-10 flex gap-3 rounded-b-2xl border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur md:static md:rounded-b-3xl md:px-9">
              <Button variant="secondary" onClick={goBack} className="px-4">
                {t.common.back}
              </Button>
              {isLastStep ? (
                <Button
                  fullWidth
                  loading={submitting}
                  onClick={handleSubmit}
                  className="flex-1"
                >
                  {submitting ? t.review.submitting : t.review.submit}
                </Button>
              ) : (
                <Button
                  fullWidth
                  disabled={!canAdvance}
                  onClick={goNext}
                  className="flex-1"
                >
                  {t.common.next}
                </Button>
              )}
            </div>
          </div>

          {step === "contact" && !canAdvance && (
            <p className="mt-3 px-1 text-center text-xs text-slate-400">
              {t.contact.continueHint}
            </p>
          )}
          {step === "submit" && submitError && (
            <p className="mt-3 px-1 text-center text-xs text-rose-500">{submitError}</p>
          )}
        </div>
      </main>
    </div>
  );
}

/* ---------- page chrome ---------- */

function Header({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-3 md:h-16 md:max-w-2xl md:px-6">
        <button
          type="button"
          onClick={onBack}
          aria-label={t.header.backAria}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <BrandMark />
        <div className="ml-auto flex items-center gap-2">
          <LanguageToggle />
        </div>
      </div>
    </header>
  );
}

function Progress({ index, labels }: { index: number; labels: string[] }) {
  const { t } = useI18n();
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-medium text-slate-400 md:text-sm">
        <span>{t.progress.step(index + 1, labels.length)}</span>
        <span className="text-slate-500 md:hidden">{labels[index]}</span>
      </div>
      <div className="mt-2 flex gap-1.5">
        {labels.map((label, i) => (
          <div
            key={label}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= index ? "bg-slate-900" : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <div className="mt-2 hidden justify-between md:flex">
        {labels.map((label, i) => (
          <span
            key={label}
            className={`text-xs ${
              i === index ? "font-medium text-slate-900" : "text-slate-400"
            }`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
