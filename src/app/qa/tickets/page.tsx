import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireQa } from "@/services/profiles";
import { listTickets } from "@/services/records";
import { toTicketRows } from "@/services/tickets-view";
import { TicketTable } from "@/components/tickets/ticket-table";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "My tickets" };

export default async function QaTicketsPage() {
  const { profile } = await requireQa("/qa/tickets");
  const tickets = await listTickets(await createClient(), profile.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">My tickets</h1>
          <p className="text-sm text-ink-muted">Tickets you have QA&apos;d</p>
        </div>
        <div className="flex gap-2">
          <Link href="/qa/upload" className={buttonClass("secondary", "sm")}>
            Upload QA report
          </Link>
          <Link href="/qa/tickets/new" className={buttonClass("secondary", "sm")}>
            New ticket
          </Link>
        </div>
      </div>
      <Card>
        <TicketTable rows={toTicketRows(tickets)} hrefBase="/qa/tickets" />
      </Card>
    </div>
  );
}
