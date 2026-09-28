"use client";

import { formHref, usePendingNavigation } from "@/components/navigation/pending-navigation";
import { Spinner } from "@/components/ui/spinner";
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
  // Inside a PendingNavigationProvider a change navigates client-side with a pending state (the select is disabled
  // until the new data arrives); otherwise it is a plain GET submit.
  const nav = usePendingNavigation();
  const pending = nav?.pending ?? false;
  return (
    <form method="get" className="flex items-center gap-2" aria-busy={pending || undefined}>
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label htmlFor="period-selector" className="text-sm font-medium text-ink-secondary">
        Period
      </label>
      <select
        id="period-selector"
        name="period"
        key={value}
        defaultValue={value}
        disabled={pending}
        onChange={(e) => {
          const form = e.currentTarget.form;
          if (!form) return;
          if (nav) nav.navigate(formHref(form));
          else form.requestSubmit();
        }}
        className="h-9 min-w-40 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink disabled:cursor-wait disabled:opacity-70"
      >
        {Array.from({ length: MAX_REPORTING_WEEKS }, (_, i) => i + 1).map((n) => (
          <option key={n} value={String(n)}>
            {n === 1 ? "1 week" : `${n} weeks`}
            {n === defaultWeeks ? " (default)" : ""}
          </option>
        ))}
        <option value={LIFETIME}>Lifetime</option>
      </select>
      <span className="inline-flex w-3.5 text-ink-muted" aria-hidden>
        {pending && <Spinner />}
      </span>
      {pending && (
        <span role="status" className="sr-only">
          Loading…
        </span>
      )}
      <noscript>
        <button type="submit" className="h-9 rounded-md border border-line-strong px-3 text-sm">
          Apply
        </button>
      </noscript>
    </form>
  );
}
