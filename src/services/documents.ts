import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export const REPORTS_BUCKET = "qa-reports";
export const MAX_REPORT_BYTES = 25 * 1024 * 1024;

export const ACCEPTED_REPORT_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word (.docx)",
  "text/plain": "Text",
  "text/markdown": "Markdown",
};

export type DocumentRow = Database["public"]["Tables"]["qa_documents"]["Row"];

export async function listOwnDocuments(ownerId: string, limit = 20): Promise<DocumentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("qa_documents")
    .select("*")
    .eq("owner_id", ownerId)
    .neq("extraction_status", "discarded")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load documents: ${error.message}`);
  return data ?? [];
}

export async function getOwnDocument(ownerId: string, id: string): Promise<DocumentRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("qa_documents")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load document: ${error.message}`);
  return data;
}

// Short-lived link. Storage RLS decides whether the caller (anon or user) may read the object.
export async function createDocumentUrl(storagePath: string, download = false): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(REPORTS_BUCKET)
    .createSignedUrl(storagePath, 60 * 5, download ? { download: true } : undefined);
  if (error || !data) return null;
  return data.signedUrl;
}
