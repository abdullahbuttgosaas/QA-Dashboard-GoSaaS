import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireQa } from "@/services/profiles";
import { getOwnDocument } from "@/services/documents";
import { findTicketId } from "@/services/records";
import { draftFromStoredExtraction } from "@/services/extraction";
import { confirmExtraction } from "@/app/actions/documents";
import { RecordEditor } from "@/components/tickets/editor/record-editor";
import { AutoRefresh, DiscardDocumentButton, RetryExtractionButton } from "@/components/reports/document-actions";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";

export const metadata: Metadata = { title: "Review extraction" };

export default async function ReviewPage({ params }: PageProps<"/qa/review/[documentId]">) {
  const { documentId } = await params;
  const { profile } = await requireQa(`/qa/review/${documentId}`);
  const db = await createClient();
  const doc = await getOwnDocument(db, profile.id, documentId);
  if (!doc || doc.extraction_status === "discarded") notFound();
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
