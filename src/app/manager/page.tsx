import type { Metadata } from "next";
import { getManagerScope } from "@/services/manager";
import { getDashboardMetrics } from "@/services/metrics";
import { DEFAULT_REPORTING_WEEKS, clampBack, clampWeeks, parsePeriod, periodValue } from "@/lib/reporting";
import { listTickets } from "@/services/records";
import { toTicketRows } from "@/services/tickets-view";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { QaSelector } from "@/components/manager/qa-selector";

export const metadata: Metadata = { title: "Manager dashboard" };

export default async function ManagerDashboardPage({ searchParams }: PageProps<"/manager">) {
  const sp = await searchParams;
  const scope = await getManagerScope(sp.qa);
  const ownerId = scope.selected?.id ?? null;
  // Default: All QAs -> 2 weeks; one QA -> that QA's own configured weeks. ?period= overrides (1..12 or lifetime).
  const defaultWeeks = clampWeeks(scope.selected?.reporting_period_weeks ?? DEFAULT_REPORTING_WEEKS);
  const mode = parsePeriod(sp.period, defaultWeeks);
  const back = mode.kind === "weeks" ? clampBack(sp.back) : 0;
  const periodParam: Record<string, string> = typeof sp.period === "string" && sp.period ? { period: periodValue(mode) } : {};
  const [{ weeks, lifetimeTotals }, tickets] = await Promise.all([
    getDashboardMetrics(scope.db, ownerId, mode, back),
    listTickets(scope.db, ownerId),
  ]);

  return (
    <DashboardView
      title={scope.selected ? `QA summary · ${scope.selected.display_name}` : "QA summary · All QAs"}
      weeks={weeks}
      mode={mode}
      lifetimeTotals={lifetimeTotals}
      back={back}
      basePath="/manager"
      ticketsPath="/manager/tickets"
      params={{ ...scope.params, ...periodParam }}
      rows={toTicketRows(tickets, scope.ownerNames)}
      showOwner={!scope.selected}
      toolbar={
        <>
          <QaSelector qas={scope.qas} selected={scope.selected?.public_slug ?? null} keep={periodParam} />
          <PeriodSelector value={periodValue(mode)} defaultWeeks={defaultWeeks} keep={scope.params} />
        </>
      }
    />
  );
}
