// Centralized, validated access to environment variables.
// Public values are inlined by Next.js at build time, so they must be referenced literally.

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const publicEnv = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabasePublishableKey: () =>
    required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  siteUrl: () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

// Last-resort extraction model: the only Flash model that kept answering structured-JSON requests in live probes while
// gemini-3.5-flash-lite (the previous fallback) returned 503/504 on every attempt.
export const GEMINI_BACKUP_MODEL = "gemini-3.1-flash-lite";

// Server-only values. Importing this from a client component is a bug.
export const serverEnv = {
  geminiApiKey: () => required("GEMINI_API_KEY", process.env.GEMINI_API_KEY),
  geminiModel: () => process.env.GEMINI_MODEL || "gemini-3.6-flash",
  // Tried when the primary model is overloaded, timing out or unavailable. Set to "none" to disable all fallbacks.
  geminiFallbackModel: () => {
    const value = process.env.GEMINI_FALLBACK_MODEL || GEMINI_BACKUP_MODEL;
    return value === "none" ? null : value;
  },
  // Always tried last (unless fallbacks are disabled), so extraction still has a working model when the configured
  // fallback is itself overloaded. Chosen from repeated live probes; see GEMINI_BACKUP_MODEL.
  geminiBackupModel: () => (process.env.GEMINI_FALLBACK_MODEL === "none" ? null : GEMINI_BACKUP_MODEL),
  allowedEmailDomain: () => (process.env.ALLOWED_EMAIL_DOMAIN ?? "gosaas.ai").toLowerCase(),
};
