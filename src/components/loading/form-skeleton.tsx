import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";

// Generic page-with-form placeholder (settings, create/edit ticket, upload, review).
export function FormSkeleton({ label, fields = 4, narrow = false }: { label: string; fields?: number; narrow?: boolean }) {
  return (
    <SkeletonRegion label={label} kind="form">
      <div className={narrow ? "mx-auto max-w-2xl space-y-4" : "space-y-4"}>
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Card className="space-y-5 p-6">
          {Array.from({ length: fields }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
          <div className="flex justify-end">
            <Skeleton className="h-9 w-32" />
          </div>
        </Card>
      </div>
    </SkeletonRegion>
  );
}
