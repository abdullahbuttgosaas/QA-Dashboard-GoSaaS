import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/site";

// Completes magic-link sign-in. Supports both the PKCE `code` flow and `token_hash` email templates.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get("next")) ?? "/";
  const supabase = await createClient();

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("Missing sign-in code") };

  if (error) {
    const description = url.searchParams.get("error_description") ?? "The sign-in link is invalid or has expired. Request a new one.";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(description)}`, url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
