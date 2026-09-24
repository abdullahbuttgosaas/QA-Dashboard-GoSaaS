"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { isAllowedEmail } from "@/lib/auth/domain";
import { describeSignInError, describeSignUpError, validateNewPassword } from "@/lib/auth/password-errors";
import { safeNextPath } from "@/lib/site";

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
  // Email confirmation is disabled (accounts are admin-managed), so Supabase signs the new user in immediately.
  // Temporary: public sign-up will be removed once the app is validated.
  const { data, error } = await supabase.auth.signUp({ email: parsed.email, password });
  if (error) return { error: describeSignUpError(error), email: parsed.email };
  if (data.session) redirect("/");
  return { email: parsed.email, notice: "Account created. Sign in with your password." };
}
