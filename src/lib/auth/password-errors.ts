// Maps Supabase Auth password sign-in/sign-up errors to clear messages.
// Wording for bad credentials is deliberately generic so it does not reveal which accounts exist.

type AuthErrorLike = { status?: number; code?: string; message?: string } | null | undefined;

export const MIN_PASSWORD_LENGTH = 8;

export function describeSignInError(error: AuthErrorLike): string {
  if (error?.code === "email_not_confirmed") {
    return "This account's email address has not been confirmed yet. Use the confirmation email sent at sign-up, then sign in.";
  }
  if (error?.code === "invalid_credentials" || /invalid login credentials/i.test(error?.message ?? "")) {
    return "Incorrect email or password.";
  }
  if (error?.status === 429 || error?.code === "over_request_rate_limit") {
    return "Too many sign-in attempts. Please wait a few minutes and try again.";
  }
  return error?.message || "Could not sign in. Please try again.";
}

export function describeSignUpError(error: AuthErrorLike): string {
  if (error?.code === "user_already_exists" || /already registered/i.test(error?.message ?? "")) {
    return "An account with this email already exists. Sign in instead.";
  }
  if (error?.code === "weak_password") return error.message || "Password is too weak.";
  if (error?.code === "signup_disabled") return "New accounts are created by an administrator. Please ask them to add you.";
  if (error?.status === 429 || error?.code === "over_request_rate_limit" || error?.code === "over_email_send_rate_limit") {
    return "Too many sign-up attempts right now. Please try again later.";
  }
  // 403 from the "Before User Created" hook carries the @gosaas.ai message.
  return error?.message || "Could not create the account. Please try again.";
}

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > 72) return "Use at most 72 characters.";
  if (password !== confirm) return "Passwords do not match.";
  return null;
}
