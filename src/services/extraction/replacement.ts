import { NOTE_NO_COMPLETION_DATE, NOTE_NO_TICKET_NUMBER, type ReviewDraft } from "./schema";

// What an existing ticket becomes when a document replaces its report data.
// The document is the complete source of truth: nothing from the old ticket is mixed in, except its identity
// (ticket number) and its Assigned date, which are always preserved (the database function enforces the same).
export type ReplacementTarget = { ticket_number: string; assigned_on: string | null };

export function replacementDraft(draft: ReviewDraft, target: ReplacementTarget): ReviewDraft {
  const extracted = draft.record;
  const record = { ...extracted, ticket_number: target.ticket_number, assigned_on: target.assigned_on };
  const notes: string[] = [];

  // Status: the document's own status; with neither a status nor a completion date, the ticket default (Assigned).
  // Never the old ticket's status or completion date.
  const defaulted = !draft.statusFound && !extracted.qa_completed_on;
  if (defaulted) {
    record.qa_status = "assigned";
    record.qa_completed_on = null;
    notes.push("The report does not state a QA status or completion date, so the ticket will be set to Assigned with no completion date. Change it here if needed.");
  }
  if (extracted.ticket_number && extracted.ticket_number !== target.ticket_number) {
    notes.push(`The report refers to ${extracted.ticket_number}; it will replace the data of ${target.ticket_number} (the ticket number is kept).`);
  }
  if (extracted.assigned_on && extracted.assigned_on !== target.assigned_on) {
    notes.push(`The report's assigned date (${extracted.assigned_on}) is not used; the ticket keeps its Assigned date.`);
  }
  for (const note of draft.notes) {
    if (note === NOTE_NO_TICKET_NUMBER) continue; // the ticket number is fixed
    if (note === NOTE_NO_COMPLETION_DATE && defaulted) continue;
    notes.push(note);
  }
  return { record, notes, statusFound: draft.statusFound };
}
