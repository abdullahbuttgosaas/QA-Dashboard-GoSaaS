import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer, type Viewer } from "@/lib/auth/viewer";

// Columns readable by anonymous visitors (email is intentionally excluded at the DB level).
const PUBLIC_PROFILE_COLUMNS =
  "id, display_name, public_slug, is_public, role, reporting_period_days, reporting_period_anchor" as const;

export type PublicProfile = {
  id: string;
  display_name: string;
  public_slug: string;
  is_public: boolean;
  role: "qa" | "manager" | "admin";
  reporting_period_days: number;
  reporting_period_anchor: string | null;
};

export const getProfileBySlug = cache(async (slug: string): Promise<PublicProfile | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PUBLIC_PROFILE_COLUMNS)
    .eq("public_slug", slug.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`Failed to load profile: ${error.message}`);
  return data;
});

export const getOwnProfile = cache(async (): Promise<PublicProfile | null> => {
  const viewer = await getViewer();
  if (!viewer) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select(PUBLIC_PROFILE_COLUMNS).eq("id", viewer.userId).maybeSingle();
  return data;
});

export type DashboardContext = {
  profile: PublicProfile;
  viewer: Viewer | null;
  // UI capability flag only. Actual write authorization is enforced by RLS and server actions.
  canEdit: boolean;
};

export const getDashboardContext = cache(async (slug: string): Promise<DashboardContext> => {
  const [profile, viewer] = await Promise.all([getProfileBySlug(slug), getViewer()]);
  if (!profile) notFound();
  return { profile, viewer, canEdit: !!viewer && viewer.isQaUser && viewer.userId === profile.id };
});

// For owner-only pages: behaves as "not found" for everyone else.
export async function requireEditor(slug: string): Promise<DashboardContext & { viewer: Viewer }> {
  const ctx = await getDashboardContext(slug);
  if (!ctx.canEdit || !ctx.viewer) notFound();
  return { ...ctx, viewer: ctx.viewer };
}
