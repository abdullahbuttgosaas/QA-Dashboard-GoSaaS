import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { TicketTableSkeleton } from "./ticket-list-skeleton";

function TileSkeleton({ bar = false }: { bar?: boolean }) {
  return (
    <div className="flex flex-col rounded-lg border border-line bg-surface px-4 py-3.5" data-skeleton-tile>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2 h-7 w-14" />
      <Skeleton className="mt-2 h-3 w-32 max-w-full" />
      {bar && <Skeleton className="mt-3 h-2 w-full" />}
    </div>
  );
}

function SectionSkeleton({ title, last }: { title: string; last?: boolean }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">{title}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TileSkeleton />
        <TileSkeleton />
        <TileSkeleton />
        <TileSkeleton bar={last} />
      </div>
    </section>
  );
}

// Mirrors DashboardView: header, 2 x 4 metric tiles, 6 trend charts, recent tickets table.
export function DashboardSkeleton({ label = "Loading dashboard…", showOwner = false }: { label?: string; showOwner?: boolean }) {
  return (
    <SkeletonRegion label={label} kind="dashboard">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <Skeleton className="h-9 w-56 max-w-full" />
        </div>
        <SectionSkeleton title="QA activity" />
        <SectionSkeleton title="Solution quality" last />
        <Card>
          <CardHeader title="Trends" description={<Skeleton className="mt-1 h-3 w-56 max-w-full" />} />
          <div className="grid gap-x-8 gap-y-6 p-5 md:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="min-w-0" data-skeleton-chart>
                <Skeleton className="mb-3 h-4 w-40 max-w-full" />
                <Skeleton className="aspect-[520/200] w-full" />
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Recent tickets" />
          <TicketTableSkeleton rows={4} showOwner={showOwner} />
        </Card>
      </div>
    </SkeletonRegion>
  );
}
