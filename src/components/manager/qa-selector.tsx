"use client";

import { formHref, usePendingNavigation } from "@/components/navigation/pending-navigation";
import { Spinner } from "@/components/ui/spinner";
import type { QaOption } from "@/services/profiles";

// Plain GET form: the selection lives in the URL (?qa=<slug>), so it is shareable and survives navigation.
// Choosing an option submits immediately; the button is the no-JavaScript fallback.
export function QaSelector({
  qas,
  selected,
  keep = {},
}: {
  qas: Array<Pick<QaOption, "display_name" | "public_slug">>;
  selected: string | null;
  keep?: Record<string, string>; // other params to carry along, e.g. the dashboard ?period=
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
      <label htmlFor="qa-selector" className="text-sm font-medium text-ink-secondary">
        QA
      </label>
      <select
        id="qa-selector"
        name="qa"
        key={selected ?? ""}
        defaultValue={selected ?? ""}
        disabled={pending}
        onChange={(e) => {
          const form = e.currentTarget.form;
          if (!form) return;
          if (nav) nav.navigate(formHref(form));
          else form.requestSubmit();
        }}
        className="h-9 min-w-44 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink disabled:cursor-wait disabled:opacity-70"
      >
        <option value="">All QAs</option>
        {qas.map((q) => (
          <option key={q.public_slug} value={q.public_slug}>
            {q.display_name}
          </option>
        ))}
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
