import { publicEnv } from "@/lib/env";

// Public origin of the current request (works on Vercel previews), falling back to NEXT_PUBLIC_SITE_URL.
// Auth redirects are additionally restricted by the Supabase "Redirect URLs" allow-list.
export function siteOrigin(h: Headers): string {
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return publicEnv.siteUrl();
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

// Only allow same-site relative redirects (prevents open redirects via ?next=).
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
