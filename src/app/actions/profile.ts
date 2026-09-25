"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { MAX_REPORTING_WEEKS } from "@/lib/reporting";
import { requireQaSession, zodFieldErrors, type ActionResult } from "./shared";

const SettingsSchema = z.object({
  display_name: z.string().trim().min(1, "Name is required").max(120),
  public_slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/, "Use 1–40 lowercase letters, numbers or hyphens"),
  reporting_period_weeks: z.coerce.number().int().min(1, "Choose 1–12 weeks").max(MAX_REPORTING_WEEKS, "Choose 1–12 weeks"),
});

export async function updateSettings(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const session = await requireQaSession();
  if ("error" in session) return { ok: false, error: session.error };

  const parsed = SettingsSchema.safeParse({
    display_name: form.get("display_name"),
    public_slug: form.get("public_slug"),
    reporting_period_weeks: form.get("reporting_period_weeks"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: zodFieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", session.profile.id);
  if (error) {
    const message =
      error.code === "23505"
        ? "That URL is already taken."
        : error.code === "23514"
          ? "That URL is reserved. Please choose another."
          : `Could not save: ${error.message}`;
    return { ok: false, error: message };
  }

  revalidatePath("/", "layout");
  redirect("/qa/settings?saved=1");
}
