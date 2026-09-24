import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Landing page for the sign-up confirmation email (only used when email confirmation is enabled).
// Supabase has already confirmed the address before redirecting here. If this is the same browser that
// signed up, the PKCE code also signs the user in; otherwise they sign in with their password.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", request.nextUrl.origin));
  }
  return NextResponse.redirect(new URL("/login?confirmed=1", request.nextUrl.origin));
}
