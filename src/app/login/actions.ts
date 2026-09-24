"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { isAllowedEmail } from "@/lib/auth/domain";
import { describeSendError, describeVerifyError, normalizeOtp } from "@/lib/auth/otp-errors";
import { safeNextPath } from "@/lib/site";

// Minimum wait before offering "Resend code"; matches the hosted auth.email.max_frequency (1 minute).
const RESEND_COOLDOWN_SECONDS = 60;

export type LoginState = {
  step: "email" | "code";
  email?: string;
  error?: string;
  notice?: string;
  resendAvailableAt?: number; // epoch ms
};

export async function loginAction(prev: LoginState, form: FormData): Promise<LoginState> {
  const intent = String(form.get("intent") ?? "send");
  const parsedEmail = z.email().safeParse(String(form.get("email") ?? prev.email ?? "").trim().toLowerCase());
  if (!parsedEmail.success) return { step: "email", error: "Enter a valid email address." };
  const email = parsedEmail.data;

  const domain = serverEnv.allowedEmailDomain();
  // UX check only; the database and auth hook reject other domains even if this is bypassed.
  if (!isAllowedEmail(email, domain)) return { step: "email", email, error: `Only @${domain} accounts can sign in.` };

  if (intent === "change-email") return { step: "email", email };
  if (intent === "have-code") return { step: "code", email, notice: "Enter the most recent code sent to this email." };
  if (intent === "verify") {
    const result = await verify(email, String(form.get("code") ?? ""), String(form.get("next") ?? ""));
    // Keep the resend cooldown running across failed attempts for the same email.
    return { ...result, resendAvailableAt: prev.email === email ? prev.resendAvailableAt : undefined };
  }
  return send(email);
}

async function send(email: string): Promise<LoginState> {
  const supabase = await createClient();
  // No emailRedirectTo: the email contains a one-time code only (see supabase/templates).
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) {
    const info = describeSendError(error);
    return {
      step: info.canEnterExistingCode ? "code" : "email",
      email,
      error: info.message,
      resendAvailableAt: info.retryAfterSeconds ? Date.now() + info.retryAfterSeconds * 1000 : undefined,
    };
  }
  return {
    step: "code",
    email,
    notice: `We sent a sign-in code to ${email}. It expires in 1 hour.`,
    resendAvailableAt: Date.now() + RESEND_COOLDOWN_SECONDS * 1000,
  };
}

async function verify(email: string, rawCode: string, rawNext: string): Promise<LoginState> {
  const token = normalizeOtp(rawCode);
  if (!token) return { step: "code", email, error: "Enter the numeric code from the email." };

  const supabase = await createClient();
  // type "email" accepts codes from both the first-sign-in (confirmation) and later sign-in emails.
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { step: "code", email, error: describeVerifyError(error) };

  // Session cookies are set by the server client; the profile was created by the auth.users trigger.
  redirect(safeNextPath(rawNext) ?? "/");
}
