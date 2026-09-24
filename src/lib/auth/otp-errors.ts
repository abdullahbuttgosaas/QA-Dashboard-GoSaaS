// Maps Supabase Auth errors for the email-OTP flow to actionable messages.
// Supabase uses HTTP 429 for three different limits, which need different advice:
//   - per-email cooldown ("you can only request this after N seconds", auth.email.max_frequency)
//   - project-wide email cap (built-in sender: a few emails per hour, only raised with custom SMTP)
//   - per-IP request limits (sign-in / verification requests per 5 minutes)

export type OtpErrorInfo = { message: string; retryAfterSeconds?: number; canEnterExistingCode: boolean };

type AuthErrorLike = { status?: number; code?: string; message?: string } | null | undefined;

export function describeSendError(error: AuthErrorLike): OtpErrorInfo {
  const message = error?.message ?? "";
  const cooldown = /after (\d+) seconds?/i.exec(message);
  if (cooldown) {
    const seconds = Number(cooldown[1]);
    return {
      message: `A code was just sent to this email. You can request another in ${seconds} seconds, or enter the code you already received.`,
      retryAfterSeconds: seconds,
      canEnterExistingCode: true,
    };
  }
  if (error?.code === "over_email_send_rate_limit" || /email rate limit/i.test(message)) {
    return {
      message:
        "The sign-in email limit for this hour has been reached (the built-in email service only sends a few emails per hour). If you already received a code in the last hour, enter it below; otherwise try again later.",
      canEnterExistingCode: true,
    };
  }
  if (error?.status === 429 || error?.code === "over_request_rate_limit") {
    return { message: "Too many sign-in attempts from this network. Please wait a few minutes and try again.", canEnterExistingCode: true };
  }
  if (error?.status === 403 || error?.status === 422) {
    // Covers the @gosaas.ai hook rejection and disabled signups.
    return { message: message || "This email cannot sign in.", canEnterExistingCode: false };
  }
  return { message: message || "Could not send a sign-in code. Please try again.", canEnterExistingCode: false };
}

export function describeVerifyError(error: AuthErrorLike): string {
  if (error?.code === "otp_expired" || /expired|invalid/i.test(error?.message ?? "")) {
    return "That code is invalid or has expired. Check the latest email, or request a new code.";
  }
  if (error?.status === 429 || error?.code === "over_request_rate_limit") {
    return "Too many code attempts. Please wait a few minutes and try again.";
  }
  return error?.message || "Could not verify the code. Please try again.";
}

// Codes are digits only; hosted length is configurable (auth.email.otp_length, 6-10).
export function normalizeOtp(input: string): string | null {
  const digits = input.replace(/\s+/g, "");
  return /^\d{6,10}$/.test(digits) ? digits : null;
}
