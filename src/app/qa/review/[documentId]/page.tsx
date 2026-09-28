import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireQa } from "@/services/profiles";
import { getOwnDocument } from "@/services/documents";
import { findTicketId, getTicketById } from "@/services/records";
import { draftFromStoredExtraction, replacementDraft } from "@/services/extraction";
import { confirmExtraction, replaceTicketFromExtraction } from "@/app/actions/documents";
import { RecordEditor } from "@/components/tickets/editor/record-editor";
import { AutoRefresh, DiscardDocumentButton, RetryExtractionButton } from "@/components/reports/document-actions";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { formatBytes, formatDate } from "@/lib/format";
import type { DocumentRow } from "@/services/documents";
import type { QaRecord } from "@/services/records";

export const metadata: Metadata = { title: "Review extraction" };

export default async function ReviewPage({ params }: PageProps<"/qa/review/[documentId]">) {
  const { documentId } = await params;
  const { profile } = await requireQa(`/qa/review/${documentId}`);
  const db = await createClient();
  const doc = await getOwnDocument(db, profile.id, documentId);
  if (!doc || doc.extraction_status === "discarded") notFound();
  if (doc.replaces_record_id) {
    if (doc.extraction_status === "confirmed") redirect(`/qa/tickets/${doc.replaces_record_id}`);
    const target = await getTicketById(db, doc.replaces_record_id);
    if (!target || target.owner_id !== profile.id) notFound();
    return <ReplaceReview doc={doc} target={target} />;
  }
  if (doc.extraction_status === "confirmed") redirect("/qa/upload");

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <Link href="/qa/upload" className="text-sm text-ink-muted hover:text-ink">
          ← QA reports
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-ink">Review extracted QA data</h1>
        <p className="truncate text-sm text-ink-muted">
          {doc.file_name} · {formatBytes(doc.size_bytes)}
          {doc.extraction_model ? ` · extracted by ${doc.extraction_model}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <a href={`/qa/documents/${doc.id}`} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>
          Open original
        </a>
        <DiscardDocumentButton documentId={doc.id} redirectTo="/qa/upload" />
      </div>
    </div>
  );

  if (doc.extraction_status === "pending" || doc.extraction_status === "processing") {
    return (
      <div className="space-y-4">
        {header}
        <Card className="p-8 text-center">
          <p className="text-sm font-medium text-ink">
            {doc.extraction_status === "processing" ? "AI extraction in progress…" : "Waiting to extract"}
          </p>
          <p className="mt-1 text-sm text-ink-muted">This page refreshes automatically.</p>
          {doc.extraction_status === "pending" && (
            <div className="mt-4">
              <RetryExtractionButton documentId={doc.id} label="Start extraction" />
            </div>
          )}
          <AutoRefresh />
        </Card>
      </div>
    );
  }

  const failed = doc.extraction_status === "failed";
  const draft = draftFromStoredExtraction(doc.extraction);
  const existingId = draft.record.ticket_number ? await findTicketId(db, profile.id, draft.record.ticket_number) : null;

  return (
    <div className="space-y-4">
      {header}
      <RecordEditor
        key={doc.extracted_at ?? doc.updated_at}
        initial={draft.record}
        notes={failed ? [] : draft.notes}
        submitLabel="Confirm and save"
        pendingLabel="Confirming…"
        onSubmit={confirmExtraction.bind(null, doc.id)}
        cancelHref="/qa/upload"
        banner={
          <>
            {failed ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-bad/30 bg-bad-soft px-4 py-3 text-sm">
                <div>
                  <div className="font-medium text-bad">AI extraction failed</div>
                  <div className="text-ink-secondary">{doc.extraction_error ?? "Unknown error"}. You can retry, or fill in the form manually.</div>
                </div>
                <RetryExtractionButton documentId={doc.id} />
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-accent-soft px-4 py-3 text-sm">
                <p className="text-ink-secondary">
                  <strong className="text-ink">Nothing is saved yet.</strong> AI output can be wrong. Check it against the original report,
                  edit anything as needed, then confirm.
                </p>
                <RetryExtractionButton documentId={doc.id} label="Re-run extraction" />
              </div>
            )}
            {existingId && (
              <div className="rounded-md border border-line bg-warn-soft px-4 py-3 text-sm text-ink-secondary">
                <strong className="text-warn-ink">{draft.record.ticket_number} already exists.</strong> Confirming will replace its QA data with
                this report.
              </div>
            )}
          </>
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Replacement review: the uploaded document will replace an existing ticket's report data (not a merge).
// Until "Replace ticket data" is confirmed nothing on the ticket changes; failures leave it untouched.
// ---------------------------------------------------------------------------
function ReplaceReview({ doc, target }: { doc: DocumentRow; target: QaRecord }) {
  const editHref = `/qa/tickets/${target.id}/edit`;
  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <Link href={editHref} className="text-sm text-ink-muted hover:text-ink">
          ← Edit {target.ticket_number}
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-ink">Replace existing ticket data</h1>
        <p className="text-sm text-ink-muted wrap-anywhere">
          {target.ticket_number} from {doc.file_name} · {formatBytes(doc.size_bytes)}
          {doc.extraction_model ? ` · extracted by ${doc.extraction_model}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <a href={`/qa/documents/${doc.id}`} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>
          Open original
        </a>
        <DiscardDocumentButton documentId={doc.id} redirectTo={editHref} />
      </div>
    </div>
  );

  if (doc.extraction_status === "pending" || doc.extraction_status === "processing") {
    return (
      <div className="space-y-4" data-replace-review="extracting">
        {header}
        <Card className="p-8 text-center">
          <p className="text-sm font-medium text-ink">
            {doc.extraction_status === "processing" ? "AI extraction in progress…" : "Waiting to extract"}
          </p>
          <p className="mt-1 text-sm text-ink-muted">The ticket has not been changed. This page refreshes automatically.</p>
          {doc.extraction_status === "pending" && (
            <div className="mt-4">
              <RetryExtractionButton documentId={doc.id} label="Start extraction" />
            </div>
          )}
          <AutoRefresh />
        </Card>
      </div>
    );
  }

  if (doc.extraction_status === "failed") {
    return (
      <div className="space-y-4" data-replace-review="failed">
        {header}
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-bad/30 bg-bad-soft px-4 py-3 text-sm">
          <div className="min-w-0">
            <div className="font-medium text-bad">AI extraction failed</div>
            <div className="text-ink-secondary wrap-anywhere">
              {doc.extraction_error ?? "Unknown error"}. {target.ticket_number} has not been changed.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RetryExtractionButton documentId={doc.id} />
            <Link href={editHref} className={buttonClass("ghost", "sm")}>
              Cancel
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const draft = replacementDraft(draftFromStoredExtraction(doc.extraction), target);
  const d = draft.record.data;
  const counts: Array<[string, number, number]> = [
    ["Requirements", target.data.requirements.length, d.requirements.length],
    ["Test cases", target.data.test_cases.length, d.test_cases.length],
    ["Bugs", target.data.bugs.length, d.bugs.length],
    ["Retests", target.data.retests.length, d.retests.length],
    ["Evidence", target.data.evidence.length, d.evidence.length],
  ];

  return (
    <div className="space-y-4" data-replace-review="ready">
      {header}
      <RecordEditor
        key={doc.extracted_at ?? doc.updated_at}
        initial={draft.record}
        notes={draft.notes}
        locked={{ ticket_number: true, assigned_on: true }}
        submitLabel="Replace ticket data"
        pendingLabel="Replacing…"
        onSubmit={replaceTicketFromExtraction.bind(null, doc.id)}
        cancelHref={editHref}
        banner={
          <div className="space-y-3 rounded-md border border-warn-ink/30 bg-warn-soft px-4 py-3 text-sm" data-replace-warning>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="min-w-0 text-ink-secondary">
                <strong className="text-warn-ink">Replace existing ticket data.</strong> This form shows what {target.ticket_number} will
                become. Confirming replaces all of its current QA report data (title, status, dates, overview, environment, requirements,
                test cases, bugs, retests, evidence and custom fields) with this reviewed extraction. Nothing is merged: anything
                missing here will be empty on the ticket. Only the ticket number and the Assigned date
                {target.assigned_on ? ` (${formatDate(target.assigned_on)})` : ""} are preserved. Nothing changes until you confirm.
              </p>
              <RetryExtractionButton documentId={doc.id} label="Re-run extraction" />
            </div>
            <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-secondary" data-replace-counts>
              {counts.map(([label, before, after]) => (
                <div key={label} className="flex gap-1">
                  <dt>{label}:</dt>
                  <dd>
                    {before} now → <span className="font-medium text-ink">{after} from document</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        }
      />
    </div>
  );
}
