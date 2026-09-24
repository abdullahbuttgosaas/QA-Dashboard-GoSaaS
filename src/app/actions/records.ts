"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QaRecordInputSchema } from "@/types/qa";
import { toRecordColumns } from "@/services/records";
import { requireQaSession, zodFieldErrors, type ActionResult } from "./shared";

function ticketUrl(slug: string, ticketNumber: string) {
  return `/${slug}/tickets/${encodeURIComponent(ticketNumber)}`;
}

// Create (originalTicketNumber = null) or update a ticket from the manual editor.
export async function saveTicket(originalTicketNumber: string | null, payload: unknown): Promise<ActionResult> {
  const session = await requireQaSession();
  if ("error" in session) return { ok: false, error: session.error };

  const parsed = QaRecordInputSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: zodFieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const columns = toRecordColumns(parsed.data);
  const { profile } = session;

  if (originalTicketNumber === null) {
    const { error } = await supabase.from("qa_records").insert({ ...columns, owner_id: profile.id });
    if (error) {
      return {
        ok: false,
        error: error.code === "23505" ? `Ticket ${columns.ticket_number} already exists.` : `Could not save: ${error.message}`,
      };
    }
  } else {
    const { data, error } = await supabase
      .from("qa_records")
      .update(columns)
      .eq("owner_id", profile.id)
      .eq("ticket_number", originalTicketNumber)
      .select("id");
    if (error) {
      return {
        ok: false,
        error: error.code === "23505" ? `Ticket ${columns.ticket_number} already exists.` : `Could not save: ${error.message}`,
      };
    }
    if (!data?.length) return { ok: false, error: "Ticket not found or you do not have permission to edit it." };
  }

  revalidatePath(`/${profile.public_slug}`, "layout");
  redirect(ticketUrl(profile.public_slug, columns.ticket_number));
}

export async function deleteTicket(recordId: string): Promise<ActionResult> {
  const session = await requireQaSession();
  if ("error" in session) return { ok: false, error: session.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("qa_records")
    .delete()
    .eq("id", recordId)
    .eq("owner_id", session.profile.id)
    .select("id");
  if (error) return { ok: false, error: `Could not delete: ${error.message}` };
  if (!data?.length) return { ok: false, error: "Ticket not found." };

  revalidatePath(`/${session.profile.public_slug}`, "layout");
  redirect(`/${session.profile.public_slug}/tickets`);
}
