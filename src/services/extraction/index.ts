import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { REPORTS_BUCKET } from "@/services/documents";
import { prepareDocument } from "./prepare";
import { GeminiExtractionProvider } from "./gemini";
import { normalizeExtraction, type ReviewDraft } from "./schema";
import type { ExtractionProvider } from "./provider";

export { normalizeExtraction, type ReviewDraft };
export { replacementDraft, type ReplacementTarget } from "./replacement";

// Persisted in qa_documents.extraction. The AI output stays here until a human confirms it.
export type StoredExtraction = {
  version: 1;
  provider: string;
  model: string;
  raw: unknown;
};

const STALE_PROCESSING_MS = 10 * 60 * 1000;

export function getExtractionProvider(): ExtractionProvider {
  return new GeminiExtractionProvider();
}

// Runs extraction for a document owned by the caller. Uses the caller's Supabase client,
// so RLS guarantees users can only process their own documents.
export async function runExtraction(
  supabase: SupabaseClient<Database>,
  documentId: string,
  providerFactory: () => ExtractionProvider = getExtractionProvider,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: doc, error } = await supabase.from("qa_documents").select("*").eq("id", documentId).maybeSingle();
  if (error || !doc) return { ok: false, error: "Document not found." };

  const staleProcessing =
    doc.extraction_status === "processing" && Date.now() - new Date(doc.updated_at).getTime() > STALE_PROCESSING_MS;
  if (!["pending", "failed", "ready_for_review"].includes(doc.extraction_status) && !staleProcessing) {
    return { ok: false, error: `Document cannot be processed in status "${doc.extraction_status}".` };
  }

  // Claim the document; the status filter prevents two concurrent runs.
  const { data: claimed } = await supabase
    .from("qa_documents")
    .update({ extraction_status: "processing", extraction_error: null })
    .eq("id", documentId)
    .eq("extraction_status", doc.extraction_status)
    .select("id");
  if (!claimed?.length) return { ok: false, error: "Document is already being processed." };

  try {
    // Created inside the guard so configuration errors (e.g. missing API key) mark the document failed.
    const provider = providerFactory();
    const { data: file, error: dlError } = await supabase.storage.from(REPORTS_BUCKET).download(doc.storage_path);
    if (dlError || !file) throw new Error("Could not read the uploaded file from storage.");

    const prepared = await prepareDocument(Buffer.from(await file.arrayBuffer()), doc.mime_type);
    const output = await provider.extract(prepared);
    const stored: StoredExtraction = { version: 1, provider: provider.name, model: output.model, raw: output.raw };

    const { error: saveError } = await supabase
      .from("qa_documents")
      .update({
        extraction_status: "ready_for_review",
        extraction: stored as unknown as Json,
        extraction_model: output.model,
        extracted_at: new Date().toISOString(),
      })
      .eq("id", documentId);
    if (saveError) throw new Error(`Could not save extraction: ${saveError.message}`);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed.";
    await supabase
      .from("qa_documents")
      .update({ extraction_status: "failed", extraction_error: message.slice(0, 1000) })
      .eq("id", documentId);
    return { ok: false, error: message };
  }
}

export function draftFromStoredExtraction(extraction: unknown): ReviewDraft {
  const stored = extraction as Partial<StoredExtraction> | null;
  return normalizeExtraction(stored?.raw ?? {});
}
