import type { Metadata } from "next";
import Link from "next/link";
import { getDashboardContext } from "@/services/profiles";
import { listTickets } from "@/services/records";
import { toTicketRows } from "@/services/tickets-view";
import { TicketTable } from "@/components/tickets/ticket-table";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "Tickets" };

export default async function TicketsPage({ params }: PageProps<"/[slug]/tickets">) {
  const { slug } = await params;
  const { profile, canEdit } = await getDashboardContext(slug);
  const tickets = await listTickets(profile.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Tickets</h1>
          <p className="text-sm text-ink-muted">All tickets QA&apos;d by {profile.display_name}</p>
        </div>
        {canEdit && (
          <Link href={`/${slug}/tickets/new`} className={buttonClass("secondary", "sm")}>
            New ticket
          </Link>
        )}
      </div>
      <Card>
        <TicketTable slug={slug} rows={toTicketRows(tickets)} />
      </Card>
    </div>
  );
}
