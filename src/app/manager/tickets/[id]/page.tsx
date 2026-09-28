import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getManagerScope } from "@/services/manager";
import { getTicketById, getTicketDocuments, type QaRecord } from "@/services/records";
import { TicketDetailView } from "@/components/tickets/ticket-detail-view";
import { TicketDetailSkeleton } from "@/components/loading/ticket-detail-skeleton";

export const metadata: Metadata = { title: "Ticket" };

// Read-only ticket view. No actions are passed, so no edit/delete controls can render here.
// No route-level loading.tsx: a missing ticket must still return a real 404, so that check runs before streaming.
export default async function ManagerTicketPage({ params, searchParams }: PageProps<"/manager/tickets/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const scope = await getManagerScope(sp.qa);
  const record = await getTicketById(scope.db, id);
  if (!record) notFound();

  return (
    <Suspense fallback={<TicketDetailSkeleton />}>
      <ManagerTicketDetail record={record} scope={scope} />
    </Suspense>
  );
}

async function ManagerTicketDetail({ record, scope }: { record: QaRecord; scope: Awaited<ReturnType<typeof getManagerScope>> }) {
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
