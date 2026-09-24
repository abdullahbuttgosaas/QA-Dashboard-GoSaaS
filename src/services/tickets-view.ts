import "server-only";
import type { TicketRow } from "@/components/tickets/ticket-table";
import type { TicketSummary } from "@/services/records";
import { passRate } from "@/services/metrics";

export function toTicketRows(tickets: TicketSummary[]): TicketRow[] {
  return tickets.map((t) => {
    const m = t.metrics;
    const passed = m?.test_cases_passed ?? 0;
    const failed = m?.test_cases_failed ?? 0;
    return {
      ticket_number: t.ticket_number,
      title: t.title,
      functional_area: t.functional_area,
      qa_status: t.qa_status,
      qa_completed_on: t.qa_completed_on,
      assigned_on: t.assigned_on,
      executed: passed + failed + (m?.test_cases_blocked ?? 0),
      passRate: passRate(passed, failed),
      failed,
      bugs: m?.bugs_total ?? 0,
      retests: m?.retests_total ?? 0,
    };
  });
}
