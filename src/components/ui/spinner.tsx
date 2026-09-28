import { cn } from "@/lib/cn";

// Compact inline spinner for buttons and inline status. Decorative: the surrounding text carries the meaning.
// Uses motion-safe so users who prefer reduced motion see a static ring.
export function Spinner({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" className={cn("size-3.5 shrink-0 motion-safe:animate-spin", className)}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
