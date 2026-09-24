"use client";

import { useState, useTransition } from "react";
import { deleteTicket } from "@/app/actions/records";
import { buttonClass } from "@/components/ui/button";

export function DeleteTicketButton({ recordId, ticketNumber }: { slug: string; recordId: string; ticketNumber: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        className={buttonClass("danger", "sm")}
        onClick={() => {
          if (!confirm(`Delete ${ticketNumber}? This removes the ticket and its QA data. The original report file is kept.`)) return;
          start(async () => {
            const result = await deleteTicket(recordId);
            if (result && !result.ok) setError(result.error);
          });
        }}
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </>
  );
}
