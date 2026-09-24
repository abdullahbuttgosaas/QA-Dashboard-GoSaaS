import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getManagerScope } from "@/services/manager";
import { getTicketById, getTicketDocuments } from "@/services/records";
import { TicketDetailView } from "@/components/tickets/ticket-detail-view";

export const metadata: Metadata = { title: "Ticket" };

// Read-only ticket view. No actions are passed, so no edit/delete controls can render here.
export default async function ManagerTicketPage({ params, searchParams }: PageProps<"/manager/tickets/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const scope = await getManagerScope(sp.qa);
  const record = await getTicketById(scope.db, id);
  if (!record) notFound(); // also covers tickets of private (non-public) QAs, which RLS hides
  const documents = await getTicketDocuments(scope.db, record.id);
  const query = scope.selected ? `?qa=${encodeURIComponent(scope.selected.public_slug)}` : "";

  return (
    <TicketDetailView
      record={record}
      documents={documents}
      backHref={`/manager/tickets${query}`}
      documentsBase="/manager/documents"
      ownerName={scope.ownerNames.get(record.owner_id)}
    />
  );
}
