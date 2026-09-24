"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { QaRecordInputSchema } from "@/types/qa";
import { ACCEPTED_REPORT_TYPES, MAX_REPORT_BYTES, REPORTS_BUCKET } from "@/services/documents";
import { requireQaSession, zodFieldErrors, type ActionResult } from "./shared";

const RegisterSchema = z.object({
  id: z.uuid(),
  storagePath: z.string().min(1).max(1024),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().refine((t) => t in ACCEPTED_REPORT_TYPES, "Unsupported file type"),
  size: z.number().int().min(1).max(MAX_REPORT_BYTES),
});

// Records a file the browser already uploaded to Storage (under the user's own folder).
export async function registerDocument(input: z.infer<typeof RegisterSchema>): Promise<ActionResult> {
  const session = await requireQaSession();
  if ("error" in session) return { ok: false, error: session.error };

  const parsed = RegisterSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid upload." };
  const { id, storagePath, fileName, mimeType, size } = parsed.data;
  if (!storagePath.startsWith(`${session.profile.id}/${id}/`)) return { ok: false, error: "Invalid storage path." };

  const supabase = await createClient();
  const { error } = await supabase.from("qa_documents").insert({
    id,
    owner_id: session.profile.id,
    storage_path: storagePath,
    file_name: fileName,
    mime_type: mimeType,
    size_bytes: size,
  });
  if (error) return { ok: false, error: `Could not register upload: ${error.message}` };
  return { ok: true };
}

// Human-confirmed extraction -> ticket. The DB function upserts the ticket and links the document atomically.
export async function confirmExtraction(documentId: string, payload: unknown): Promise<ActionResult> {
  const session = await requireQaSession();
  if ("error" in session) return { ok: false, error: session.error };

  const parsed = QaRecordInputSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: zodFieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_extraction", {
    p_document_id: documentId,
    p_record: parsed.data as never,
  });
  if (error) return { ok: false, error: `Could not save: ${error.message}` };

  const slug = session.profile.public_slug;
  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/tickets/${encodeURIComponent(parsed.data.ticket_number)}`);
}

// Discard an unconfirmed upload: marks it discarded and removes the stored file.
export async function discardDocument(documentId: string): Promise<ActionResult> {
  const session = await requireQaSession();
  if ("error" in session) return { ok: false, error: session.error };

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("qa_documents")
    .select("id, storage_path, extraction_status")
    .eq("id", documentId)
    .eq("owner_id", session.profile.id)
    .maybeSingle();
  if (!doc) return { ok: false, error: "Document not found." };
  if (doc.extraction_status === "confirmed") return { ok: false, error: "Confirmed reports cannot be discarded." };

  await supabase.storage.from(REPORTS_BUCKET).remove([doc.storage_path]);
  const { error } = await supabase.from("qa_documents").update({ extraction_status: "discarded" }).eq("id", doc.id);
  if (error) return { ok: false, error: `Could not discard: ${error.message}` };

  revalidatePath(`/${session.profile.public_slug}/upload`);
  return { ok: true };
}
