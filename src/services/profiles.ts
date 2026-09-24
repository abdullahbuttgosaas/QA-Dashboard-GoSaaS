import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Db } from "@/lib/supabase/public";
import { getViewer, type Viewer } from "@/lib/auth/viewer";

// Columns readable by anonymous visitors (email is intentionally excluded at the DB level).
const PUBLIC_PROFILE_COLUMNS = "id, display_name, public_slug, role, reporting_period_days, reporting_period_anchor" as const;

export type PublicProfile = {
  id: string;
  display_name: string;
  public_slug: string;
  role: "qa" | "manager" | "admin";
  reporting_period_days: number;
  reporting_period_anchor: string | null;
};

export type QaOption = Pick<PublicProfile, "id" | "display_name" | "public_slug">;

// QAs shown in the manager selector. With the anonymous manager client RLS returns every QA profile
// (QAs cannot hide themselves); email is not granted to anon, so it cannot be selected.
export async function listVisibleQas(db: Db): Promise<QaOption[]> {
  const { data, error } = await db.from("profiles").select("id, display_name, public_slug").order("display_name");
  if (error) throw new Error(`Failed to load QA users: ${error.message}`);
  return data ?? [];
}

export async function getProfileBySlug(db: Db, slug: string): Promise<PublicProfile | null> {
  const { data, error } = await db.from("profiles").select(PUBLIC_PROFILE_COLUMNS).eq("public_slug", slug.toLowerCase()).maybeSingle();
  if (error) throw new Error(`Failed to load profile: ${error.message}`);
  return data;
}

export const getOwnProfile = cache(async (): Promise<PublicProfile | null> => {
  const viewer = await getViewer();
  if (!viewer) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select(PUBLIC_PROFILE_COLUMNS).eq("id", viewer.userId).maybeSingle();
  return data;
});

// Gate for every /qa page: signed-in @gosaas.ai user with a profile, otherwise sent to sign in.
// This is a UI gate only; RLS and server actions enforce write permissions independently.
export const requireQa = cache(async (nextPath = "/qa"): Promise<{ viewer: Viewer; profile: PublicProfile }> => {
  const viewer = await getViewer();
  if (!viewer?.isQaUser) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  const profile = await getOwnProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return { viewer, profile };
});
