"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { registerDocument } from "@/app/actions/documents";
import { buttonClass } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Spinner } from "@/components/ui/spinner";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/cn";

type Stage = "idle" | "uploading" | "extracting" | "preparing" | "error";
type BusyStage = "uploading" | "extracting" | "preparing";

const STAGE_TEXT: Record<Stage, string> = {
  idle: "",
  uploading: "Uploading report…",
  extracting: "Reading the report with AI. This can take up to a minute…",
  preparing: "Preparing the review screen…",
  error: "",
};

// Step indicator + button labels, in order. The button reserves the width of the longest label.
export const UPLOAD_STEPS: Array<{ stage: BusyStage; step: string; button: string }> = [
  { stage: "uploading", step: "Upload", button: "Uploading…" },
  { stage: "extracting", step: "Extract", button: "Extracting…" },
  { stage: "preparing", step: "Prepare review", button: "Preparing review…" },
];

function UploadSteps({ stage }: { stage: BusyStage }) {
  const current = UPLOAD_STEPS.findIndex((s) => s.stage === stage);
  return (
    <ol className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-label="Upload progress" data-upload-steps>
      {UPLOAD_STEPS.map((s, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li
            key={s.stage}
            data-step-state={state}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5",
              state === "done" && "text-good",
              state === "current" && "font-medium text-ink",
              state === "todo" && "text-ink-muted",
            )}
          >
            <span className="inline-flex size-3.5 items-center justify-center" aria-hidden>
              {state === "current" ? <Spinner /> : state === "done" ? "✓" : "○"}
            </span>
            {s.step}
          </li>
        );
      })}
    </ol>
  );
}

// Uploads directly from the browser to Supabase Storage (avoids serverless body limits),
// registers the document, then triggers AI extraction and opens the review screen.
export function UploadForm({
  ownerId,
  accept,
  maxBytes,
}: {
  ownerId: string;
  accept: Record<string, string>;
  maxBytes: number;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const busy = stage === "uploading" || stage === "extracting" || stage === "preparing";
  // Guards against a second upload (double click) before React re-renders the disabled button.
  const inFlight = useRef(false);

  function pick(f: File | undefined) {
    setError(null);
    if (!f) return;
    const type = f.type || (f.name.toLowerCase().endsWith(".md") ? "text/markdown" : "");
    if (!(type in accept)) return setError(`Unsupported file type. Use ${Object.values(accept).join(", ")}.`);
    if (f.size > maxBytes) return setError(`File is too large (max ${formatBytes(maxBytes)}).`);
    setFile(f);
  }

  async function submit() {
    if (!file || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setStage("uploading");
    const supabase = createClient();
    const id = crypto.randomUUID();
    const mimeType = file.type || "text/markdown";
    const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-150);
    const storagePath = `${ownerId}/${id}/${safeName}`;

    const { error: upErr } = await supabase.storage
      .from("qa-reports")
      .upload(storagePath, file, { contentType: mimeType, upsert: false });
    if (upErr) {
      inFlight.current = false;
      setStage("error");
      return setError(`Upload failed: ${upErr.message}`);
    }

    const reg = await registerDocument({ id, storagePath, fileName: file.name, mimeType, size: file.size });
    if (!reg.ok) {
      await supabase.storage.from("qa-reports").remove([storagePath]);
      inFlight.current = false;
      setStage("error");
      return setError(reg.error);
    }

    setStage("extracting");
    // Even if extraction fails, the review screen lets the user retry or fill in manually.
    await fetch(`/api/documents/${id}/extract`, { method: "POST" }).catch(() => null);
    // Stays in this state (inputs disabled) until the review page replaces this one.
    setStage("preparing");
    router.push(`/qa/review/${id}`);
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) pick(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-surface",
        )}
      >
        <p className="text-sm font-medium text-ink">{file ? file.name : "Drop your QA report here"}</p>
        <p className="mt-1 text-xs text-ink-muted">
          {file ? formatBytes(file.size) : `${Object.values(accept).join(", ")} · up to ${formatBytes(maxBytes)}`}
        </p>
        <input
          ref={input}
          type="file"
          className="sr-only"
          accept={[...Object.keys(accept), ".md", ".docx", ".pdf", ".txt"].join(",")}
          onChange={(e) => pick(e.target.files?.[0])}
          disabled={busy}
        />
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className={buttonClass("secondary", "sm", "mt-4")}>
          {file ? "Choose a different file" : "Choose file"}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1.5" aria-live="polite">
          {busy && <UploadSteps stage={stage} />}
          <p className="text-sm text-ink-muted">{STAGE_TEXT[stage]}</p>
        </div>
        <LoadingButton
          type="button"
          disabled={!file}
          pending={busy}
          pendingLabel={UPLOAD_STEPS.find((s) => s.stage === stage)?.button ?? "Uploading…"}
          reserveLabels={UPLOAD_STEPS.map((s) => s.button)}
          onClick={submit}
          className={buttonClass("primary", "md", "ml-auto")}
        >
          Upload and extract
        </LoadingButton>
      </div>
    </div>
  );
}
