import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireQa } from "@/services/profiles";
import { ACCEPTED_REPORT_TYPES, listOwnDocuments, MAX_REPORT_BYTES, type DocumentRow } from "@/services/documents";
import { UploadForm } from "@/components/reports/upload-form";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { formatBytes, formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "QA reports" };

const STATUS: Record<DocumentRow["extraction_status"], { label: string; className: string }> = {
  pending: { label: "Uploaded", className: "bg-surface-muted text-ink-secondary" },
  processing: { label: "Extracting", className: "bg-accent-soft text-accent" },
  ready_for_review: { label: "Needs review", className: "bg-warn-soft text-warn-ink" },
  confirmed: { label: "Confirmed", className: "bg-good-soft text-good" },
  failed: { label: "Extraction failed", className: "bg-bad-soft text-bad" },
  discarded: { label: "Discarded", className: "bg-surface-muted text-ink-muted" },
};

export default async function UploadPage() {
  const { profile } = await requireQa("/qa/upload");
  const documents = await listOwnDocuments(await createClient(), profile.id);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Upload QA report</h1>
          <p className="text-sm text-ink-muted">
            Upload your finished QA report. AI extracts the test cases, bugs and retests, then you review and confirm before
            anything is saved.
          </p>
        </div>
        <Card className="p-5">
          <UploadForm ownerId={profile.id} accept={ACCEPTED_REPORT_TYPES} maxBytes={MAX_REPORT_BYTES} />
        </Card>
        <p className="text-sm text-ink-muted">
          Prefer to enter data by hand?{" "}
          <Link href="/qa/tickets/new" className="text-accent hover:underline">
            Create a ticket manually
          </Link>
          .
        </p>
      </div>

      <Card className="lg:col-span-2">
        <CardHeader title="Recent uploads" />
        {documents.length === 0 ? (
          <EmptyState title="No reports uploaded yet" />
        ) : (
          <ul className="divide-y divide-line">
            {documents.map((doc) => {
              const s = STATUS[doc.extraction_status];
              const href = doc.extraction_status === "confirmed" ? `/qa/documents/${doc.id}` : `/qa/review/${doc.id}`;
              return (
                <li key={doc.id}>
                  <Link href={href} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-muted">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink" title={doc.file_name}>
                        {doc.file_name}
                      </div>
                      <div className="text-xs text-ink-muted">
                        {formatDate(doc.created_at)} · {formatBytes(doc.size_bytes)}
                      </div>
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", s.className)}>{s.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
