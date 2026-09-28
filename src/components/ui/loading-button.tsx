"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  pending: boolean;
  pendingLabel: string;
  children: ReactNode;
  // Extra labels this button may show (e.g. multi-stage uploads) so its width never jumps between them.
  reserveLabels?: string[];
};

// A button with a stable-width label: idle and pending labels share one grid cell and the inactive ones are
// only visually hidden, so the button keeps the width of its longest label. While pending it is disabled,
// shows a compact spinner and exposes aria-busy.
export function LoadingButton({ pending, pendingLabel, children, reserveLabels = [], className, disabled, ...rest }: Props) {
  return (
    <button {...rest} disabled={disabled || pending} aria-busy={pending || undefined} className={className} data-pending={pending ? "true" : undefined}>
      <span className="inline-grid">
        <span className={cn("col-start-1 row-start-1 inline-flex items-center justify-center gap-2", pending && "invisible")} aria-hidden={pending || undefined}>
          {children}
        </span>
        <span
          className={cn("col-start-1 row-start-1 inline-flex items-center justify-center gap-2", !pending && "invisible")}
          aria-hidden={!pending || undefined}
          data-loading-label
        >
          <Spinner />
          {pendingLabel}
        </span>
        {reserveLabels.map((label) => (
          <span key={label} aria-hidden className="invisible col-start-1 row-start-1 inline-flex items-center gap-2">
            <Spinner />
            {label}
          </span>
        ))}
      </span>
    </button>
  );
}
