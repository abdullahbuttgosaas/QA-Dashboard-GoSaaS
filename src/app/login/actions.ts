"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { isAllowedEmail } from "@/lib/auth/domain";
import { safeNextPath, siteOrigin } from "@/lib/site";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = z.email().safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { status: "error", message: "Enter a valid email address." };

  const domain = serverEnv.allowedEmailDomain();
  // UX check only; the database rejects other domains even if this is bypassed.
  if (!isAllowedEmail(email.data, domain)) {
    return { status: "error", message: `Only @${domain} accounts can sign in.`, email: email.data };
  }

  const next = safeNextPath(String(form.get("next") ?? "")) ?? "/";
  const origin = siteOrigin(await headers());
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    const message =
      error.status === 429 ? "Too many sign-in emails were requested. Please wait a minute and try again." : error.message;
    return { status: "error", message, email: email.data };
  }
  return { status: "sent", email: email.data };
}
