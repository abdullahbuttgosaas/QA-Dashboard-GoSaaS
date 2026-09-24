"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp, type AuthFormState } from "./actions";
import { buttonClass } from "@/components/ui/button";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-errors";

const input = "h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink";

function Messages({ state }: { state: AuthFormState }) {
  return (
    <>
      {state.notice && (
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
}

function EmailField({ domain, defaultValue }: { domain: string; defaultValue?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">Work email</span>
      <input name="email" type="email" autoComplete="email" required defaultValue={defaultValue} placeholder={`you@${domain}`} className={input} />
    </label>
  );
}

export function SignInForm({ next, domain }: { next?: string; domain: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signIn, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Messages state={state} />
      <EmailField domain={domain} defaultValue={state.email} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className={input} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass("primary", "md", "h-10 w-full")}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-sm text-ink-muted">
        New QA team member?{" "}
        <Link href="/login?mode=signup" className="text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm({ domain }: { domain: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signUp, {});
  return (
    <form action={action} className="space-y-4">
      <Messages state={state} />
      <EmailField domain={domain} defaultValue={state.email} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink">Password</span>
        <input name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required className={input} />
        <span className="mt-1 block text-xs text-ink-muted">At least {MIN_PASSWORD_LENGTH} characters.</span>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink">Confirm password</span>
        <input name="confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required className={input} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass("primary", "md", "h-10 w-full")}>
        {pending ? "Creating account…" : "Create account"}
      </button>
      <p className="text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
