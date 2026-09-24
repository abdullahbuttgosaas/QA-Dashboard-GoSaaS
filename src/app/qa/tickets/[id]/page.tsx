import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireQa } from "@/services/profiles";
import { getTicketById, getTicketDocuments } from "@/services/records";
import { TicketDetailView } from "@/components/tickets/ticket-detail-view";
import { DeleteTicketButton } from "@/components/tickets/delete-ticket-button";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "Ticket" };

export default async function QaTicketPage({ params }: PageProps<"/qa/tickets/[id]">) {
  const { id } = await params;
  const { profile } = await requireQa(`/qa/tickets/${id}`);
  const db = await createClient();
  const record = await getTicketById(db, id);
  // The QA workspace only shows the signed-in user's own tickets.
  if (!record || record.owner_id !== profile.id) notFound();
  const documents = await getTicketDocuments(db, record.id);

  return (
    <TicketDetailView
      record={record}
      documents={documents}
      backHref="/qa/tickets"
      documentsBase="/qa/documents"
      actions={
        <>
          <Link href={`/qa/tickets/${record.id}/edit`} className={buttonClass("secondary", "sm")}>
            Edit
          </Link>
          <DeleteTicketButton recordId={record.id} ticketNumber={record.ticket_number} />
        </>
      }
    />
  );
}
