"use client";

import { useActionState } from "react";
import { updateSettings } from "@/app/actions/profile";
import { buttonClass } from "@/components/ui/button";
import { Label } from "@/components/tickets/editor/fields";
import { MAX_REPORTING_WEEKS } from "@/lib/reporting";
import type { PublicProfile } from "@/services/profiles";

const input = "h-9 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink";

export function SettingsForm({ profile, siteUrl, saved }: { profile: PublicProfile; siteUrl: string; saved: boolean }) {
  const [state, action, pending] = useActionState(updateSettings, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={action} className="space-y-6">
      {state && !state.ok && (
        <div role="alert" className="rounded-md border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">
          {state.error}
        </div>
      )}
      {saved && !state && (
        <div role="status" className="rounded-md border border-line bg-good-soft px-4 py-3 text-sm text-good">
          Settings saved.
        </div>
      )}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink">Profile</legend>
        <Label label="Display name" error={errors.display_name}>
          <input name="display_name" defaultValue={profile.display_name} className={input} required />
        </Label>
        <Label label="Manager filter name" error={errors.public_slug} hint="Used in the manager dashboard link that shows only your work.">
          {/* Long hosts (e.g. the production domain) wrap inside the prefix; on phones the prefix sits above the input. */}
          <div className="flex min-w-0 flex-col sm:flex-row">
            <span
              data-slug-prefix
              className="flex min-h-9 min-w-0 items-center rounded-t-md border border-b-0 border-line-strong bg-surface-muted px-3 py-1.5 text-sm text-ink-muted wrap-anywhere sm:rounded-l-md sm:rounded-tr-none sm:border-r-0 sm:border-b"
            >
              {siteUrl.replace(/^https?:\/\//, "")}/manager?qa=
            </span>
            <input
              name="public_slug"
              defaultValue={profile.public_slug}
              className={`${input} min-w-0 rounded-t-none sm:h-auto sm:min-h-9 sm:flex-1 sm:rounded-l-none sm:rounded-tr-md`}
              required
            />
          </div>
        </Label>
        <p className="text-xs text-ink-muted">Managers can always see your confirmed tickets, reports and metrics (read-only).</p>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink">Reporting period</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Label
            label="Period length"
            error={errors.reporting_period_weeks}
            hint="Complete calendar weeks (Monday–Friday) ending with the current week. Weekends are not counted."
          >
            <select name="reporting_period_weeks" defaultValue={String(profile.reporting_period_weeks)} className={input}>
              {Array.from({ length: MAX_REPORTING_WEEKS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "1 week (current week)" : n === 2 ? "2 weeks (previous + current week)" : `${n} weeks`}
                </option>
              ))}
            </select>
          </Label>
        </div>
      </fieldset>

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
