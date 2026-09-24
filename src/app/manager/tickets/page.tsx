import type { Metadata } from "next";
import { getManagerScope } from "@/services/manager";
import { listTickets } from "@/services/records";
import { toTicketRows } from "@/services/tickets-view";
import { TicketTable } from "@/components/tickets/ticket-table";
import { QaSelector } from "@/components/manager/qa-selector";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Manager tickets" };

export default async function ManagerTicketsPage({ searchParams }: PageProps<"/manager/tickets">) {
  const scope = await getManagerScope((await searchParams).qa);
  const tickets = await listTickets(scope.db, scope.selected?.id ?? null);
  const query = scope.selected ? `?qa=${encodeURIComponent(scope.selected.public_slug)}` : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Tickets</h1>
          <p className="text-sm text-ink-muted">{scope.selected ? `Tickets QA'd by ${scope.selected.display_name}` : "Tickets from all QAs"}</p>
        </div>
        <QaSelector qas={scope.qas} selected={scope.selected?.public_slug ?? null} />
      </div>
      <Card>
        <TicketTable rows={toTicketRows(tickets, scope.ownerNames)} hrefBase="/manager/tickets" linkQuery={query} showOwner={!scope.selected} />
      </Card>
    </div>
  );
}
