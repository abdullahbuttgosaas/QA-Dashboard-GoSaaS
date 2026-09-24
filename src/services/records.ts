import "server-only";
import type { Db } from "@/lib/supabase/public";
import { parseQaData, type QaData, type QaRecordInput } from "@/types/qa";
import { getRecordMetrics, type RecordMetrics } from "@/services/metrics";
import type { Database } from "@/types/database";

type RecordRow = Database["public"]["Tables"]["qa_records"]["Row"];

export type QaRecord = Omit<RecordRow, "data"> & { data: QaData };

export type TicketSummary = Pick<
  RecordRow,
  "id" | "owner_id" | "ticket_number" | "title" | "functional_area" | "qa_status" | "assigned_on" | "qa_completed_on" | "updated_at"
> & { metrics: RecordMetrics | null };

export type RecordDocument = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  confirmed_at: string | null;
  created_at: string;
};

// ownerId = null lists every ticket the caller may see (RLS), e.g. all public QAs for managers.
export async function listTickets(db: Db, ownerId: string | null): Promise<TicketSummary[]> {
  let query = db
    .from("qa_records")
    .select("id, owner_id, ticket_number, title, functional_area, qa_status, assigned_on, qa_completed_on, updated_at")
    .order("qa_completed_on", { ascending: false, nullsFirst: true })
    .order("updated_at", { ascending: false });
  if (ownerId) query = query.eq("owner_id", ownerId);
  const [{ data, error }, metrics] = await Promise.all([query, getRecordMetrics(db, ownerId)]);
  if (error) throw new Error(`Failed to load tickets: ${error.message}`);
  const byId = new Map(metrics.map((m) => [m.record_id, m]));
  return (data ?? []).map((r) => ({ ...r, metrics: byId.get(r.id) ?? null }));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getTicketById(db: Db, id: string): Promise<QaRecord | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await db.from("qa_records").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to load ticket: ${error.message}`);
  return data ? { ...data, data: parseQaData(data.data) } : null;
}

export async function findTicketId(db: Db, ownerId: string, ticketNumber: string): Promise<string | null> {
  const { data } = await db.from("qa_records").select("id").eq("owner_id", ownerId).eq("ticket_number", ticketNumber).maybeSingle();
  return data?.id ?? null;
}

export async function getTicketDocuments(db: Db, recordId: string): Promise<RecordDocument[]> {
  const { data, error } = await db
    .from("qa_documents")
    .select("id, file_name, mime_type, size_bytes, storage_path, confirmed_at, created_at")
    .eq("record_id", recordId)
    .eq("extraction_status", "confirmed")
    .order("confirmed_at", { ascending: false });
  if (error) throw new Error(`Failed to load documents: ${error.message}`);
  return data ?? [];
}

// Relational columns + JSONB payload for insert/update from a validated input.
export function toRecordColumns(input: QaRecordInput) {
  return {
    ticket_number: input.ticket_number,
    title: input.title,
    functional_area: input.functional_area || null,
    qa_status: input.qa_status,
    assigned_on: input.assigned_on,
    qa_completed_on: input.qa_completed_on,
    data: input.data as unknown as Database["public"]["Tables"]["qa_records"]["Insert"]["data"],
  };
}

export function toRecordInput(record: QaRecord): QaRecordInput {
  return {
    ticket_number: record.ticket_number,
    title: record.title,
    functional_area: record.functional_area,
    qa_status: record.qa_status,
    assigned_on: record.assigned_on,
    qa_completed_on: record.qa_completed_on,
    data: record.data,
  };
}
