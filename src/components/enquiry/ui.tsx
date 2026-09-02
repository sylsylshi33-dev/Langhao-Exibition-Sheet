"use client";

/* Reusable presentational building blocks for the enquiry flow. */

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { CameraIcon, ImageIcon, SpinnerIcon } from "./icons";

/* ---------- Button ---------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  fullWidth?: boolean;
  loading?: boolean;
};

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors select-none " +
  "h-12 md:h-14 px-5 text-[15px] md:text-base disabled:opacity-45 disabled:pointer-events-none " +
  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/15";

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950",
  secondary:
    "bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 active:bg-slate-100",
  ghost: "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
};

export function Button({
  variant = "primary",
  fullWidth,
  loading,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${
        fullWidth ? "w-full" : ""
      } ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <SpinnerIcon className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ---------- Form field ---------- */

export const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 h-12 text-slate-900 " +
  "placeholder:text-slate-400 outline-none transition " +
  "focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10";

export const textareaClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 " +
  "placeholder:text-slate-400 outline-none transition resize-none " +
  "focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10";

export function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/* ---------- Section heading ---------- */

export function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">
        {title}
      </h1>
      {subtitle && (
        <p className="text-sm leading-relaxed text-slate-500 md:text-base">
          {subtitle}
        </p>
      )}
    </div>
  );
}

/* ---------- Segmented control ---------- */

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      className="grid gap-1 rounded-xl bg-slate-100 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`h-10 rounded-lg text-sm font-medium transition ${
              active
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Photo input ---------- */

/**
 * A file `<input>` styled as a button. When `capture` is set the phone opens
 * the camera directly ("take a photo"); without it the OS shows the album /
 * file picker ("upload").
 */
function FileButton({
  onFiles,
  multiple,
  capture,
  icon,
  children,
}: {
  onFiles: (files: FileList) => void;
  multiple?: boolean;
  capture?: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-medium text-slate-800 transition hover:bg-slate-50 active:bg-slate-100 md:h-14 md:text-base">
      {icon}
      {children}
      <input
        type="file"
        accept="image/*"
        {...(capture ? { capture: "environment" as const } : {})}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}

/** Side-by-side "Take photo" / "Upload" actions. */
export function PhotoSourceButtons({
  onFiles,
  multiple,
  takeLabel,
  uploadLabel,
  className = "",
}: {
  onFiles: (files: FileList) => void;
  multiple?: boolean;
  takeLabel: string;
  uploadLabel: string;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${className}`}>
      <FileButton onFiles={onFiles} capture icon={<CameraIcon className="h-5 w-5 text-slate-500" />}>
        {takeLabel}
      </FileButton>
      <FileButton
        onFiles={onFiles}
        multiple={multiple}
        icon={<ImageIcon className="h-5 w-5 text-slate-500" />}
      >
        {uploadLabel}
      </FileButton>
    </div>
  );
}
