import "server-only";
import type { Db } from "@/lib/supabase/public";
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

export async function listOwnDocuments(db: Db, ownerId: string, limit = 20): Promise<DocumentRow[]> {
  const { data, error } = await db
    .from("qa_documents")
    .select("*")
    .eq("owner_id", ownerId)
    .neq("extraction_status", "discarded")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load documents: ${error.message}`);
  return data ?? [];
}

export async function getOwnDocument(db: Db, ownerId: string, id: string): Promise<DocumentRow | null> {
  const { data, error } = await db.from("qa_documents").select("*").eq("owner_id", ownerId).eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to load document: ${error.message}`);
  return data;
}

// Adds the `download` query parameter to a storage signed URL, encoded exactly once.
// (storage-js's own `download` option percent-encodes the name twice — URLSearchParams, then encodeURI over the
// whole URL — so "(1)" arrived as "%281%29". The parameter is not part of the signed token.)
export function withDownloadName(signedUrl: string, fileName: string): string {
  const url = new URL(signedUrl);
  url.searchParams.set("download", fileName);
  return url.toString();
}

// Short-lived (5 min) signed link. Storage RLS decides whether the caller (anonymous manager or QA user) may read
// the object; the bucket itself stays private.
// - open:     no Content-Disposition, so the browser shows the file inline when it can (e.g. PDF). Formats browsers
//             cannot render (e.g. .docx) are downloaded by the browser itself.
// - download: Content-Disposition: attachment with the original upload's file name.
export async function createDocumentUrl(db: Db, documentId: string, download = false): Promise<string | null> {
  const { data: doc } = await db.from("qa_documents").select("storage_path, file_name").eq("id", documentId).maybeSingle();
  if (!doc) return null;
  const { data, error } = await db.storage.from(REPORTS_BUCKET).createSignedUrl(doc.storage_path, 60 * 5);
  if (error || !data) return null;
  return download ? withDownloadName(data.signedUrl, doc.file_name) : data.signedUrl;
}
