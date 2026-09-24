"use client";

import { useActionState } from "react";
import { updateSettings } from "@/app/actions/profile";
import { buttonClass } from "@/components/ui/button";
import { Label } from "@/components/tickets/editor/fields";
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
        <Label label="Public dashboard URL" error={errors.public_slug} hint="Share this link with managers. It is read-only.">
          <div className="flex items-center">
            <span className="flex h-9 items-center rounded-l-md border border-r-0 border-line-strong bg-surface-muted px-3 text-sm text-ink-muted">
              {siteUrl.replace(/^https?:\/\//, "")}/
            </span>
            <input name="public_slug" defaultValue={profile.public_slug} className={`${input} rounded-l-none`} required />
          </div>
        </Label>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="is_public" defaultChecked={profile.is_public} className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>
            <span className="block text-sm font-medium text-ink">Public read-only dashboard</span>
            <span className="block text-xs text-ink-muted">
              When off, only you can see your dashboard, tickets and reports.
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink">Reporting period</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Label label="Period length (days)" error={errors.reporting_period_days}>
            <input
              name="reporting_period_days"
              type="number"
              min={1}
              max={92}
              defaultValue={profile.reporting_period_days}
              className={input}
            />
          </Label>
          <Label
            label="Period start date (optional)"
            error={errors.reporting_period_anchor}
            hint="Any date a period starts on, e.g. a sprint start. Leave empty for a rolling window ending today."
          >
            <input name="reporting_period_anchor" type="date" defaultValue={profile.reporting_period_anchor ?? ""} className={input} />
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
