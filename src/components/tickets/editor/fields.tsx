"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

export function Label({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-secondary">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-bad">{error}</span>}
    </label>
  );
}

type InputProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  placeholder?: string;
  type?: "text" | "date";
  className?: string;
  disabled?: boolean;
  name?: string;
};

export function TextField({ label, value, onChange, error, hint, placeholder, type = "text", className, disabled, name }: InputProps) {
  return (
    <div className={className}>
      <Label label={label} error={error} hint={hint}>
        <input
          type={type}
          name={name}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          className={cn(control, "h-9 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-muted", error ? "border-bad" : "border-line-strong")}
        />
      </Label>
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  error,
  hint,
  rows = 3,
  className,
}: Omit<InputProps, "type" | "placeholder"> & { rows?: number }) {
  return (
    <div className={className}>
      <Label label={label} error={error} hint={hint}>
        <textarea
          value={value}
          rows={rows}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          className={cn(control, "py-2 leading-relaxed", error ? "border-bad" : "border-line-strong")}
        />
      </Label>
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  error,
  className,
}: {
  label: string;
  value: T | "";
  options: ReadonlyArray<{ value: T | ""; label: string }>;
  onChange: (v: T | "") => void;
  error?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label label={label} error={error}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T | "")}
          className={cn(control, "h-9", error ? "border-bad" : "border-line-strong")}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Label>
    </div>
  );
}

// Multi-line list editing: one entry per line (used for steps).
export function LinesField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  className?: string;
}) {
  return (
    <TextArea
      label={label}
      hint="One per line"
      rows={Math.min(Math.max(value.length + 1, 3), 10)}
      value={value.join("\n")}
      onChange={(v) => onChange(v.split("\n"))}
      className={className}
    />
  );
}

// Comma-separated references (e.g. requirement refs).
export function RefsField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  className?: string;
}) {
  return (
    <TextField
      label={label}
      hint="Comma separated"
      value={value.join(", ")}
      onChange={(v) => onChange(v.split(",").map((s) => s.trimStart()))}
      className={className}
    />
  );
}
