import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Neutral placeholder block. Pulses only when motion is allowed.
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rounded-md bg-surface-muted motion-safe:animate-pulse", className)} />;
}

// Wraps a page-shaped skeleton: announced once to assistive tech, hidden visually otherwise.
export function SkeletonRegion({ label, kind, children }: { label: string; kind: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" data-skeleton={kind} className="min-w-0">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
