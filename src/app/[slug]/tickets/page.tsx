import { notFound, redirect } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { getProfileBySlug } from "@/services/profiles";

// Legacy link (e.g. /abdullah/tickets) -> canonical manager tickets page.
export default async function LegacyTickets({ params }: PageProps<"/[slug]/tickets">) {
  const { slug } = await params;
  if (!(await getProfileBySlug(await createPublicClient(), slug))) notFound();
  redirect("/manager/tickets");
}
