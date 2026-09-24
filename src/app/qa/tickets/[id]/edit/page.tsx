import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireQa } from "@/services/profiles";
import { getTicketById, toRecordInput } from "@/services/records";
import { RecordEditor } from "@/components/tickets/editor/record-editor";
import { saveTicket } from "@/app/actions/records";

export const metadata: Metadata = { title: "Edit ticket" };

export default async function EditTicketPage({ params }: PageProps<"/qa/tickets/[id]/edit">) {
  const { id } = await params;
  const { profile } = await requireQa(`/qa/tickets/${id}/edit`);
  const record = await getTicketById(await createClient(), id);
  if (!record || record.owner_id !== profile.id) notFound();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Edit {record.ticket_number}</h1>
        <p className="text-sm text-ink-muted">Changes update the dashboards immediately after saving.</p>
      </div>
      <RecordEditor
        initial={toRecordInput(record)}
        submitLabel="Save changes"
        onSubmit={saveTicket.bind(null, record.id)}
        cancelHref={`/qa/tickets/${record.id}`}
      />
    </div>
  );
}
