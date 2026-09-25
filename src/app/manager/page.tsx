import type { Metadata } from "next";
import { getManagerScope } from "@/services/manager";
import { getWeeklyMetrics } from "@/services/metrics";
import { DEFAULT_REPORTING_WEEKS, clampBack, clampWeeks } from "@/lib/reporting";
import { listTickets } from "@/services/records";
import { toTicketRows } from "@/services/tickets-view";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { QaSelector } from "@/components/manager/qa-selector";

export const metadata: Metadata = { title: "Manager dashboard" };

export default async function ManagerDashboardPage({ searchParams }: PageProps<"/manager">) {
  const sp = await searchParams;
  const scope = await getManagerScope(sp.qa);
  const ownerId = scope.selected?.id ?? null;
  // All QAs: the default 2-week period. One QA: that QA's own configured number of weeks.
  const weeksPerPeriod = clampWeeks(scope.selected?.reporting_period_weeks ?? DEFAULT_REPORTING_WEEKS);
  const back = clampBack(sp.back);
  const [weeks, tickets] = await Promise.all([getWeeklyMetrics(scope.db, ownerId, weeksPerPeriod, back), listTickets(scope.db, ownerId)]);

  return (
    <DashboardView
      title={scope.selected ? `QA summary · ${scope.selected.display_name}` : "QA summary · All QAs"}
      weeks={weeks}
      weeksPerPeriod={weeksPerPeriod}
      back={back}
      basePath="/manager"
      ticketsPath="/manager/tickets"
      params={scope.params}
      rows={toTicketRows(tickets, scope.ownerNames)}
      showOwner={!scope.selected}
      toolbar={<QaSelector qas={scope.qas} selected={scope.selected?.public_slug ?? null} />}
    />
  );
}
