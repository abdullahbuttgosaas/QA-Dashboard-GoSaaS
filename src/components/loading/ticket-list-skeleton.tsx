import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";

// Same columns as TicketTable, so the layout does not shift when rows arrive. No empty-state text while loading.
export function TicketTableSkeleton({ rows = 6, showOwner = false }: { rows?: number; showOwner?: boolean }) {
  const columns = ["Ticket", ...(showOwner ? ["QA"] : []), "Status", "Assigned", "QA completed", "Executed", "Pass rate", "Failed", "Bugs", "Retests"];
  return (
    <div className="overflow-x-auto" data-skeleton-table>
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="text-xs text-ink-muted">
          <tr className="border-b border-line">
            {columns.map((c, i) => (
              <th key={c} className={`${i === 0 ? "px-5" : i === columns.length - 1 ? "px-5 text-right" : i > columns.indexOf("QA completed") ? "px-3 text-right" : "px-3"} py-2.5 font-medium`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r} className="border-b border-line last:border-0" data-skeleton-row>
              <td className="px-5 py-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-1.5 h-3.5 w-56" />
              </td>
              {showOwner && (
                <td className="px-3 py-3">
                  <Skeleton className="h-3.5 w-24" />
                </td>
              )}
              <td className="px-3 py-3">
                <Skeleton className="h-5 w-24 rounded-full" />
              </td>
              <td className="px-3 py-3">
                <Skeleton className="h-3.5 w-20" />
              </td>
              <td className="px-3 py-3">
                <Skeleton className="h-3.5 w-20" />
              </td>
              {Array.from({ length: 5 }, (_, i) => (
                <td key={i} className={`${i === 4 ? "px-5" : "px-3"} py-3`}>
                  <Skeleton className="ml-auto h-3.5 w-8" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TicketListSkeleton({ showOwner = false }: { showOwner?: boolean }) {
  return (
    <SkeletonRegion label="Loading tickets…" kind="ticket-list">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-52 max-w-full" />
          </div>
          <Skeleton className="h-9 w-48 max-w-full" />
        </div>
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
            <Skeleton className="h-8 w-full max-w-xs" />
            <Skeleton className="h-8 w-32" />
          </div>
          <TicketTableSkeleton showOwner={showOwner} />
        </Card>
      </div>
    </SkeletonRegion>
  );
}
