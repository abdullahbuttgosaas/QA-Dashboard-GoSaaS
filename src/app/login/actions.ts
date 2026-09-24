"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { isAllowedEmail } from "@/lib/auth/domain";
import { describeSignInError, describeSignUpError, validateNewPassword } from "@/lib/auth/password-errors";
import { safeNextPath, siteOrigin } from "@/lib/site";

export type AuthFormState = { error?: string; notice?: string; email?: string };

// UX check only; the "Before User Created" hook and the auth.users trigger reject other domains regardless.
function parseEmail(form: FormData): { email: string } | { error: string; email?: string } {
  const parsed = z.email().safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { error: "Enter a valid email address." };
  const domain = serverEnv.allowedEmailDomain();
  if (!isAllowedEmail(parsed.data, domain)) return { error: `Only @${domain} accounts can sign in.`, email: parsed.data };
  return { email: parsed.data };
}

export async function signIn(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = parseEmail(form);
  if ("error" in parsed) return parsed;
  const password = String(form.get("password") ?? "");
  if (!password) return { error: "Enter your password.", email: parsed.email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.email, password });
  if (error) return { error: describeSignInError(error), email: parsed.email };

  // Session cookies are set by the server client.
  redirect(safeNextPath(String(form.get("next") ?? "")) ?? "/");
}

export async function signUp(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = parseEmail(form);
  if ("error" in parsed) return parsed;
  const password = String(form.get("password") ?? "");
  const invalid = validateNewPassword(password, String(form.get("confirm") ?? ""));
  if (invalid) return { error: invalid, email: parsed.email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.email,
    password,
    // Only used when email confirmation is enabled: where the confirmation link lands.
    options: { emailRedirectTo: `${siteOrigin(await headers())}/auth/callback` },
  });
  if (error) return { error: describeSignUpError(error), email: parsed.email };

  // With confirmation disabled Supabase returns a session immediately; the profile is created by the DB trigger.
  if (data.session) redirect("/");

  // With confirmation enabled no session exists yet. (Supabase also returns this shape for an already-registered
  // email, without saying so, to avoid revealing which accounts exist.)
  return {
    email: parsed.email,
    notice: "Account created. Confirm your email address using the link we sent, then sign in with your password.",
  };
}
