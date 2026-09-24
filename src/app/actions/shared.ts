import "server-only";
import type { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { getOwnProfile, type PublicProfile } from "@/services/profiles";

export type ActionResult = { ok: false; error: string; fieldErrors?: Record<string, string> } | { ok: true };

// Every mutating action re-verifies the session server-side. RLS is the final guard.
export async function requireQaSession(): Promise<{ profile: PublicProfile } | { error: string }> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Your session has expired. Please sign in again." };
  if (!viewer.isQaUser) return { error: "Only QA users can make changes." };
  const profile = await getOwnProfile();
  if (!profile) return { error: "Profile not found." };
  return { profile };
}

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
