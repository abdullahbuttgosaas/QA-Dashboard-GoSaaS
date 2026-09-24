"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";
import { buttonClass } from "@/components/ui/button";

export function LoginForm({ next, domain }: { next?: string; domain: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });

  if (state.status === "sent") {
    return (
      <div role="status" className="rounded-md border border-line bg-good-soft px-4 py-4 text-sm">
        <p className="font-medium text-good">Check your inbox</p>
        <p className="mt-1 text-ink-secondary">
          We sent a sign-in link to <strong className="text-ink">{state.email}</strong>. It expires in one hour.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink">Work email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          placeholder={`you@${domain}`}
          className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink"
        />
      </label>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-bad">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass("primary", "md", "h-10 w-full")}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
