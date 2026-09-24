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

// Server-only values. Importing this from a client component is a bug.
export const serverEnv = {
  geminiApiKey: () => required("GEMINI_API_KEY", process.env.GEMINI_API_KEY),
  geminiModel: () => process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  allowedEmailDomain: () => (process.env.ALLOWED_EMAIL_DOMAIN ?? "gosaas.ai").toLowerCase(),
};
