"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { QaStatusBadge } from "@/components/ui/badges";
import { EmptyState } from "@/components/ui/card";
import { formatDate, formatPercent } from "@/lib/format";
import { QA_STATUSES, type QaStatus } from "@/types/qa";

export type TicketRow = {
  id: string;
  ticket_number: string;
  owner: string | null; // QA display name, shown in the team view
  title: string;
  functional_area: string | null;
  qa_status: QaStatus;
  qa_completed_on: string | null;
  assigned_on: string | null;
  executed: number;
  passRate: number | null;
  failed: number;
  bugs: number;
  retests: number;
};

const STATUS_LABEL: Record<QaStatus, string> = {
  assigned: "Assigned",
  in_progress: "In progress",
  qa_completed: "QA completed",
};

type Props = {
  rows: TicketRow[];
  hrefBase: string; // e.g. "/manager/tickets" or "/qa/tickets"
  linkQuery?: string; // preserved on ticket links, e.g. "?qa=abdullah"
  showOwner?: boolean;
  filterable?: boolean;
};

export function TicketTable({ rows, hrefBase, linkQuery = "", showOwner = false, filterable = true }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<QaStatus | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (status === "all" || r.qa_status === status) &&
        (!q || `${r.ticket_number} ${r.title} ${r.functional_area ?? ""} ${r.owner ?? ""}`.toLowerCase().includes(q)),
    );
  }, [rows, query, status]);

  return (
    <div>
      {filterable && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={showOwner ? "Search ticket, title, area or QA" : "Search ticket, title or area"}
            aria-label="Search tickets"
            className="h-8 w-full max-w-xs rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-muted"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as QaStatus | "all")}
            aria-label="Filter by status"
            className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink"
          >
            <option value="all">All statuses</option>
            {QA_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs text-ink-muted">
            {filtered.length} of {rows.length} tickets
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState title={rows.length === 0 ? "No tickets yet" : "No tickets match your filters"} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs text-ink-muted">
              <tr className="border-b border-line">
                <th className="px-5 py-2.5 font-medium">Ticket</th>
                {showOwner && <th className="px-3 py-2.5 font-medium">QA</th>}
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">QA completed</th>
                <th className="px-3 py-2.5 text-right font-medium">Executed</th>
                <th className="px-3 py-2.5 text-right font-medium">Pass rate</th>
                <th className="px-3 py-2.5 text-right font-medium">Failed</th>
                <th className="px-3 py-2.5 text-right font-medium">Bugs</th>
                <th className="px-5 py-2.5 text-right font-medium">Retests</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface-muted">
                  <td className="max-w-md px-5 py-3">
                    <Link
                      href={`${hrefBase}/${r.id}${linkQuery}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {r.ticket_number}
                    </Link>
                    <div className="truncate text-ink-secondary" title={r.title}>
                      {r.title || "Untitled"}
                    </div>
                    {r.functional_area && <div className="text-xs text-ink-muted">{r.functional_area}</div>}
                  </td>
                  {showOwner && <td className="px-3 py-3 whitespace-nowrap text-ink-secondary">{r.owner ?? "—"}</td>}
                  <td className="px-3 py-3">
                    <QaStatusBadge status={r.qa_status} />
                  </td>
                  <td className="px-3 py-3 text-ink-secondary">{formatDate(r.qa_completed_on)}</td>
                  <td className="px-3 py-3 text-right text-ink">{r.executed}</td>
                  <td className="px-3 py-3 text-right text-ink">{formatPercent(r.passRate)}</td>
                  <td className="px-3 py-3 text-right text-ink">{r.failed}</td>
                  <td className="px-3 py-3 text-right text-ink">{r.bugs}</td>
                  <td className="px-5 py-3 text-right text-ink">{r.retests}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
