import type { Metadata } from "next";
import { getManagerScope } from "@/services/manager";
import { getPeriodMetrics } from "@/services/metrics";
import { listTickets } from "@/services/records";
import { toTicketRows } from "@/services/tickets-view";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { QaSelector } from "@/components/manager/qa-selector";

export const metadata: Metadata = { title: "Manager dashboard" };

export default async function ManagerDashboardPage({ searchParams }: PageProps<"/manager">) {
  const sp = await searchParams;
  const scope = await getManagerScope(sp.qa);
  const ownerId = scope.selected?.id ?? null;
  const [periods, tickets] = await Promise.all([getPeriodMetrics(scope.db, ownerId), listTickets(scope.db, ownerId)]);

  return (
    <DashboardView
      title={scope.selected ? `QA summary · ${scope.selected.display_name}` : "QA summary · All QAs"}
      periods={periods}
      back={Number.parseInt(String(sp.back ?? "0"), 10) || 0}
      periodLabel={scope.selected ? "Current reporting period" : "Last 14 days"}
      basePath="/manager"
      ticketsPath="/manager/tickets"
      params={scope.params}
      rows={toTicketRows(tickets, scope.ownerNames)}
      showOwner={!scope.selected}
      toolbar={<QaSelector qas={scope.qas} selected={scope.selected?.public_slug ?? null} />}
    />
  );
}
