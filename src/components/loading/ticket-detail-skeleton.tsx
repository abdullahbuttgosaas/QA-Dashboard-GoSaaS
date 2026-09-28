import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";

function ListCard({ title, rows }: { title: string; rows: number }) {
  return (
    <Card>
      <CardHeader title={title} description={<Skeleton className="mt-1 h-3 w-24" />} />
      <ul className="divide-y divide-line">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-5 py-3">
            <Skeleton className="h-3.5 w-12 shrink-0" />
            <Skeleton className="h-3.5 min-w-0 flex-1" />
            <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

// Mirrors TicketDetailView: header + details, 6 metric tiles, main sections and the side column.
export function TicketDetailSkeleton() {
  return (
    <SkeletonRegion label="Loading ticket…" kind="ticket-detail">
      <div className="space-y-5">
        <Skeleton className="h-4 w-24" />
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <Skeleton className="h-5 w-80 max-w-full" />
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="rounded-lg border border-line bg-surface px-4 py-3.5" data-skeleton-tile>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-7 w-10" />
            </div>
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="min-w-0 space-y-5 lg:col-span-2">
            <Card>
              <CardHeader title="Overview" />
              <div className="space-y-2 p-5">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-11/12" />
                <Skeleton className="h-3.5 w-3/4" />
              </div>
            </Card>
            <ListCard title="Test cases" rows={4} />
            <ListCard title="Bugs / defects" rows={2} />
            <ListCard title="Retests" rows={1} />
            <ListCard title="Requirements" rows={2} />
          </div>
          <div className="min-w-0 space-y-5">
            <Card>
              <CardHeader title="QA report" description="Original uploaded document" />
              <div className="space-y-2 px-5 py-3">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="mt-2 h-8 w-28" />
              </div>
            </Card>
            <Card>
              <CardHeader title="Additional fields" />
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </SkeletonRegion>
  );
}
