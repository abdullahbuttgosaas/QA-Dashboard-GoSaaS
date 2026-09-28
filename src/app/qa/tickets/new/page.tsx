import type { Metadata } from "next";
import { requireQa } from "@/services/profiles";
import { RecordEditor } from "@/components/tickets/editor/record-editor";
import { saveTicket } from "@/app/actions/records";
import { QaRecordInputSchema } from "@/types/qa";
import { todayIso } from "@/lib/format";

export const metadata: Metadata = { title: "New ticket" };

export default async function NewTicketPage() {
  await requireQa("/qa/tickets/new");
  const initial = QaRecordInputSchema.parse({ ticket_number: "NEW", qa_completed_on: todayIso(), data: {} });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">New ticket</h1>
        <p className="text-sm text-ink-muted">Enter QA information manually. To extract it from a report instead, use Upload QA report.</p>
      </div>
      <RecordEditor initial={{ ...initial, ticket_number: "" }} submitLabel="Create ticket" pendingLabel="Creating…" onSubmit={saveTicket.bind(null, null)} cancelHref="/qa/tickets" />
    </div>
  );
}
