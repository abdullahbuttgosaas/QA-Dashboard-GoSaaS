"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { discardDocument } from "@/app/actions/documents";
import { buttonClass } from "@/components/ui/button";

export function RetryExtractionButton({ documentId, label = "Retry extraction" }: { documentId: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={buttonClass("secondary", "sm")}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await fetch(`/api/documents/${documentId}/extract`, { method: "POST" });
            if (!res.ok) {
              const body = (await res.json().catch(() => null)) as { error?: string } | null;
              setError(body?.error ?? "Extraction failed.");
            }
            router.refresh();
          })
        }
      >
        {pending ? "Extracting…" : label}
      </button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </span>
  );
}

export function DiscardDocumentButton({ documentId, redirectTo }: { documentId: string; redirectTo?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={buttonClass("ghost", "sm", "text-bad")}
      onClick={() => {
        if (!confirm("Discard this upload? The file will be deleted and nothing will be saved.")) return;
        start(async () => {
          const res = await discardDocument(documentId);
          if (!res.ok) return alert(res.error);
          if (redirectTo) router.push(redirectTo);
          else router.refresh();
        });
      }}
    >
      {pending ? "Discarding…" : "Discard"}
    </button>
  );
}

// While extraction is running elsewhere (e.g. another tab), refresh until it finishes.
export function AutoRefresh({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
