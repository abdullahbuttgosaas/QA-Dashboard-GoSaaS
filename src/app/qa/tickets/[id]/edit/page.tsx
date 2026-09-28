import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireQa } from "@/services/profiles";
import { getTicketById, toRecordInput } from "@/services/records";
import { ACCEPTED_REPORT_TYPES, MAX_REPORT_BYTES } from "@/services/documents";
import { RecordEditor } from "@/components/tickets/editor/record-editor";
import { UploadForm } from "@/components/reports/upload-form";
import { saveTicket } from "@/app/actions/records";
import { formatDate } from "@/lib/format";

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

      {/* Replace this ticket's report data from a document: upload -> AI extraction -> review -> replace. */}
      <details className="group rounded-lg border border-line bg-surface" data-replace-from-document>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">Upload &amp; Extract Report</span>
            <span className="block text-xs text-ink-muted">Replace report data from document</span>
          </span>
          <span aria-hidden className="text-ink-muted transition-transform group-open:rotate-180 motion-reduce:transition-none">
            ▾
          </span>
        </summary>
        <div className="space-y-4 border-t border-line px-5 py-4">
          <p role="note" className="rounded-md border border-warn-ink/30 bg-warn-soft px-4 py-3 text-sm text-warn-ink" data-replace-warning>
            This will replace the ticket&apos;s existing QA report data with the information extracted from this document.
            The Assigned date{record.assigned_on ? ` (${formatDate(record.assigned_on)})` : ""} will be preserved. You review the
            extracted data before anything is changed.
          </p>
          <UploadForm
            ownerId={profile.id}
            accept={ACCEPTED_REPORT_TYPES}
            maxBytes={MAX_REPORT_BYTES}
            replacesRecordId={record.id}
            submitLabel="Upload & Extract"
          />
        </div>
      </details>

      <RecordEditor
        initial={toRecordInput(record)}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        onSubmit={saveTicket.bind(null, record.id)}
        cancelHref={`/qa/tickets/${record.id}`}
      />
    </div>
  );
}
