"use client";

import type { QaOption } from "@/services/profiles";

// Plain GET form: the selection lives in the URL (?qa=<slug>), so it is shareable and survives navigation.
// Choosing an option submits immediately; the button is the no-JavaScript fallback.
export function QaSelector({ qas, selected }: { qas: Array<Pick<QaOption, "display_name" | "public_slug">>; selected: string | null }) {
  return (
    <form method="get" className="flex items-center gap-2">
      <label htmlFor="qa-selector" className="text-sm font-medium text-ink-secondary">
        QA
      </label>
      <select
        id="qa-selector"
        name="qa"
        defaultValue={selected ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-9 min-w-44 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink"
      >
        <option value="">All QAs</option>
        {qas.map((q) => (
          <option key={q.public_slug} value={q.public_slug}>
            {q.display_name}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="h-9 rounded-md border border-line-strong px-3 text-sm">
          Apply
        </button>
      </noscript>
    </form>
  );
}
