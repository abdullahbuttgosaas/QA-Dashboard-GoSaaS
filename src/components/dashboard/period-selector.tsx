"use client";

import { LIFETIME, MAX_REPORTING_WEEKS } from "@/lib/reporting";

// Dashboard reporting-period filter kept in the URL (?period=1..12 | lifetime). It does not change the saved
// setting; `defaultWeeks` is what applies when no period is chosen. Other params (e.g. ?qa=) are carried along.
export function PeriodSelector({
  value,
  defaultWeeks,
  keep = {},
}: {
  value: string;
  defaultWeeks: number;
  keep?: Record<string, string>;
}) {
  return (
    <form method="get" className="flex items-center gap-2">
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label htmlFor="period-selector" className="text-sm font-medium text-ink-secondary">
        Period
      </label>
      <select
        id="period-selector"
        name="period"
        defaultValue={value}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-9 min-w-40 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink"
      >
        {Array.from({ length: MAX_REPORTING_WEEKS }, (_, i) => i + 1).map((n) => (
          <option key={n} value={String(n)}>
            {n === 1 ? "1 week" : `${n} weeks`}
            {n === defaultWeeks ? " (default)" : ""}
          </option>
        ))}
        <option value={LIFETIME}>Lifetime</option>
      </select>
      <noscript>
        <button type="submit" className="h-9 rounded-md border border-line-strong px-3 text-sm">
          Apply
        </button>
      </noscript>
    </form>
  );
}
