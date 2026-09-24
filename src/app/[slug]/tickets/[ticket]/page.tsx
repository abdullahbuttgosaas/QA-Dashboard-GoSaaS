import { notFound, redirect } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { getProfileBySlug } from "@/services/profiles";
import { findTicketId } from "@/services/records";

// Legacy ticket link (e.g. /abdullah/tickets/CHG0045893) -> read-only manager ticket page.
export default async function LegacyTicket({ params }: PageProps<"/[slug]/tickets/[ticket]">) {
  const { slug, ticket } = await params;
  const db = await createPublicClient();
  const profile = await getProfileBySlug(db, slug);
  const id = profile ? await findTicketId(db, profile.id, decodeURIComponent(ticket)) : null;
  if (!id) notFound();
  redirect(`/manager/tickets/${id}`);
}
