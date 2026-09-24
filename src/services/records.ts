import "server-only";
import { createClient } from "@/lib/supabase/server";
import { parseQaData, type QaData, type QaRecordInput } from "@/types/qa";
import { getRecordMetrics, type RecordMetrics } from "@/services/metrics";
import type { Database } from "@/types/database";

type RecordRow = Database["public"]["Tables"]["qa_records"]["Row"];

export type QaRecord = Omit<RecordRow, "data"> & { data: QaData };

export type TicketSummary = Pick<
  RecordRow,
  "id" | "ticket_number" | "title" | "functional_area" | "qa_status" | "assigned_on" | "qa_completed_on" | "updated_at"
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

export async function listTickets(ownerId: string): Promise<TicketSummary[]> {
  const supabase = await createClient();
  const [{ data, error }, metrics] = await Promise.all([
    supabase
      .from("qa_records")
      .select("id, ticket_number, title, functional_area, qa_status, assigned_on, qa_completed_on, updated_at")
      .eq("owner_id", ownerId)
      .order("qa_completed_on", { ascending: false, nullsFirst: true })
      .order("updated_at", { ascending: false }),
    getRecordMetrics(ownerId),
  ]);
  if (error) throw new Error(`Failed to load tickets: ${error.message}`);
  const byId = new Map(metrics.map((m) => [m.record_id, m]));
  return (data ?? []).map((r) => ({ ...r, metrics: byId.get(r.id) ?? null }));
}

export async function getTicket(ownerId: string, ticketNumber: string): Promise<QaRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("qa_records")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("ticket_number", ticketNumber)
    .maybeSingle();
  if (error) throw new Error(`Failed to load ticket: ${error.message}`);
  return data ? { ...data, data: parseQaData(data.data) } : null;
}

export async function getTicketDocuments(recordId: string): Promise<RecordDocument[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
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
