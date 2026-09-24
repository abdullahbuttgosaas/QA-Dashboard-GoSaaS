import { notFound, redirect } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { getProfileBySlug } from "@/services/profiles";

// Legacy public link (e.g. /abdullah). /manager is now the canonical manager URL.
// Only slugs of existing QA profiles redirect; anything else is a normal 404.
export default async function LegacyDashboard({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  if (!(await getProfileBySlug(await createPublicClient(), slug))) notFound();
  redirect("/manager");
}
