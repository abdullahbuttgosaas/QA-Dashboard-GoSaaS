import Link from "next/link";
import type { ReactNode } from "react";
import type { QaRecord, RecordDocument } from "@/services/records";
import { passRate } from "@/services/metrics";
import { QaStatusBadge } from "@/components/ui/badges";
import { Card, CardHeader } from "@/components/ui/card";
import { StatTile } from "@/components/dashboard/stat-tile";
import { ReportActions } from "@/components/tickets/report-actions";
import {
  BugsSection,
  CustomSections,
  EvidenceSection,
  OverviewSection,
  RequirementsSection,
  RetestsSection,
  TestCasesSection,
} from "@/components/tickets/ticket-sections";
import { formatBytes, formatDate, formatPercent } from "@/lib/format";

type Props = {
  record: QaRecord;
  documents: RecordDocument[];
  backHref: string;
  documentsBase: string; // e.g. "/manager/documents" -> `${documentsBase}/${id}`
  ownerName?: string | null;
  actions?: ReactNode; // QA-only Edit/Delete; manager pages never pass this
};

// Shared read view of a single ticket. It renders no mutation controls itself.
export function TicketDetailView({ record, documents, backHref, documentsBase, ownerName, actions }: Props) {
  const { data } = record;
  const count = (s: string) => data.test_cases.filter((t) => t.status === s).length;
  const passed = count("pass");
  const failed = count("fail");
  const blocked = count("blocked");
  const retestsPassed = data.retests.filter((r) => r.result === "pass").length;
  const retestsFailed = data.retests.filter((r) => r.result === "fail").length;

  return (
    <div className="space-y-5">
      <Link href={backHref} className="text-sm text-ink-muted hover:text-ink">
        ← All tickets
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-xl font-semibold text-ink">{record.ticket_number}</h1>
            <QaStatusBadge status={record.qa_status} />
          </div>
          <p className="mt-1 text-base text-ink-secondary">{record.title || "Untitled"}</p>
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {ownerName && (
              <div className="flex gap-1.5">
                <dt className="text-ink-muted">QA</dt>
                <dd className="text-ink">{ownerName}</dd>
              </div>
            )}
            <div className="flex gap-1.5">
              <dt className="text-ink-muted">Functional area</dt>
              <dd className="text-ink">{record.functional_area || "—"}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-muted">Assigned</dt>
              <dd className="text-ink">{formatDate(record.assigned_on)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-muted">QA completed</dt>
              <dd className="text-ink">{formatDate(record.qa_completed_on)}</dd>
            </div>
          </dl>
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Test cases" value={String(data.test_cases.length)} />
        <StatTile label="Executed" value={String(passed + failed + blocked)} hint={blocked ? `${blocked} blocked` : undefined} />
        <StatTile label="Pass rate" value={formatPercent(passRate(passed, failed))} hint={`${passed} passed · ${failed} failed`} />
        <StatTile label="Bugs" value={String(data.bugs.length)} />
        <StatTile label="Retests" value={String(data.retests.length)} hint={`${retestsPassed} passed · ${retestsFailed} failed`} />
        <StatTile label="Requirements" value={String(data.requirements.length)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <OverviewSection data={data} />
          <TestCasesSection data={data} />
          <BugsSection data={data} />
          <RetestsSection data={data} />
          <RequirementsSection data={data} />
        </div>
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="QA report" description="Original uploaded document" />
            {documents.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-muted">No report attached (entered manually).</p>
            ) : (
              <ul className="divide-y divide-line">
                {documents.map((doc) => (
                  <li key={doc.id} className="min-w-0 px-5 py-3">
                    <div className="text-sm font-medium text-ink wrap-anywhere" title={doc.file_name}>
                      {doc.file_name}
                    </div>
                    <div className="text-xs text-ink-muted">
                      {formatBytes(doc.size_bytes)} · uploaded {formatDate(doc.created_at)}
                    </div>
                    <ReportActions href={`${documentsBase}/${doc.id}`} fileName={doc.file_name} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <EvidenceSection data={data} />
          <CustomSections data={data} />
        </div>
      </div>
    </div>
  );
}

