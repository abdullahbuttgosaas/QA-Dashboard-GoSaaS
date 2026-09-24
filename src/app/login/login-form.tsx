"use client";

import { useActionState, useEffect, useState } from "react";
import { loginAction, type LoginState } from "./actions";
import { buttonClass } from "@/components/ui/button";

const input = "h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink";

function useSecondsUntil(timestamp?: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timestamp || timestamp <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timestamp]);
  return timestamp ? Math.max(0, Math.ceil((timestamp - now) / 1000)) : 0;
}

export function LoginForm({ next, domain }: { next?: string; domain: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, { step: "email" });
  const resendIn = useSecondsUntil(state.resendAvailableAt);

  const messages = (
    <>
      {state.notice && !state.error && (
        <p role="status" className="rounded-md bg-good-soft px-3 py-2 text-sm text-good">
          {state.notice}
        </p>
      )}
      {state.error && (
        <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}
    </>
  );

  if (state.step === "code") {
    return (
      <form action={action} className="space-y-4">
        <input type="hidden" name="email" value={state.email} />
        <input type="hidden" name="next" value={next ?? ""} />
        {messages}
        <p className="text-sm text-ink-secondary">
          Signing in as <strong className="text-ink">{state.email}</strong>
        </p>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Sign-in code</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={12}
            required
            autoFocus
            placeholder="Code from the email"
            className={`${input} font-mono tracking-widest`}
          />
        </label>
        <button type="submit" name="intent" value="verify" disabled={pending} className={buttonClass("primary", "md", "h-10 w-full")}>
          {pending ? "Checking…" : "Sign in"}
        </button>
        <div className="flex items-center justify-between text-sm">
          <button type="submit" name="intent" value="change-email" formNoValidate className="text-ink-muted hover:text-ink">
            Use a different email
          </button>
          <button
            type="submit"
            name="intent"
            value="send"
            formNoValidate
            disabled={pending || resendIn > 0}
            className="text-accent hover:underline disabled:cursor-not-allowed disabled:text-ink-muted disabled:no-underline"
          >
            {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {messages}
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink">Work email</span>
        <input name="email" type="email" autoComplete="email" required defaultValue={state.email} placeholder={`you@${domain}`} className={input} />
      </label>
      <button type="submit" name="intent" value="send" disabled={pending} className={buttonClass("primary", "md", "h-10 w-full")}>
        {pending ? "Sending…" : "Email me a sign-in code"}
      </button>
      <button type="submit" name="intent" value="have-code" disabled={pending} className="w-full text-center text-sm text-ink-muted hover:text-ink">
        I already have a code
      </button>
    </form>
  );
}
