"use client";

import { useRef, useState, useTransition } from "react";
import { deleteTicket } from "@/app/actions/records";
import { buttonClass } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";

export function DeleteTicketButton({ recordId, ticketNumber }: { recordId: string; ticketNumber: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  return (
    <>
      <LoadingButton
        type="button"
        pending={pending}
        pendingLabel="Deleting…"
        className={buttonClass("danger", "sm")}
        onClick={() => {
          if (inFlight.current) return;
          if (!confirm(`Delete ${ticketNumber}? This removes the ticket and its QA data. The original report file is kept.`)) return;
          inFlight.current = true;
          setError(null);
          start(async () => {
            try {
              const result = await deleteTicket(recordId);
              if (result && !result.ok) setError(result.error);
            } finally {
              inFlight.current = false;
            }
          });
        }}
      >
        Delete
      </LoadingButton>
      {error && <span className="text-xs text-bad">{error}</span>}
    </>
  );
}
