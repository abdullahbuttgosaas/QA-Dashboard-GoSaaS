import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireEditor } from "@/services/profiles";
import { getTicket, toRecordInput } from "@/services/records";
import { RecordEditor } from "@/components/tickets/editor/record-editor";
import { saveTicket } from "@/app/actions/records";

export const metadata: Metadata = { title: "Edit ticket" };

export default async function EditTicketPage({ params }: PageProps<"/[slug]/tickets/[ticket]/edit">) {
  const { slug, ticket } = await params;
  const ticketNumber = decodeURIComponent(ticket);
  const { profile } = await requireEditor(slug);
  const record = await getTicket(profile.id, ticketNumber);
  if (!record) notFound();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Edit {record.ticket_number}</h1>
        <p className="text-sm text-ink-muted">Changes update the dashboard immediately after saving.</p>
      </div>
      <RecordEditor
        initial={toRecordInput(record)}
        submitLabel="Save changes"
        onSubmit={saveTicket.bind(null, record.ticket_number)}
        cancelHref={`/${slug}/tickets/${encodeURIComponent(record.ticket_number)}`}
      />
    </div>
  );
}
