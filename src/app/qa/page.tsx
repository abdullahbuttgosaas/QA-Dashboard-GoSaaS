import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireQa } from "@/services/profiles";
import { getDashboardMetrics } from "@/services/metrics";
import { clampBack, clampWeeks, parsePeriod, periodValue } from "@/lib/reporting";
import { listTickets } from "@/services/records";
import { toTicketRows } from "@/services/tickets-view";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "QA dashboard" };

export default async function QaDashboardPage({ searchParams }: PageProps<"/qa">) {
  const sp = await searchParams;
  const { profile } = await requireQa();
  const db = await createClient();
  // Saved setting is the default; ?period= overrides it for this view only (1..12 weeks or lifetime).
  const defaultWeeks = clampWeeks(profile.reporting_period_weeks);
  const mode = parsePeriod(sp.period, defaultWeeks);
  const back = mode.kind === "weeks" ? clampBack(sp.back) : 0;
  const periodParam: Record<string, string> = typeof sp.period === "string" && sp.period ? { period: periodValue(mode) } : {};
  const [{ weeks, lifetimeTotals }, tickets] = await Promise.all([
    getDashboardMetrics(db, profile.id, mode, back),
    listTickets(db, profile.id),
  ]);

  return (
    <DashboardView
      title="My QA summary"
      weeks={weeks}
      mode={mode}
      lifetimeTotals={lifetimeTotals}
      back={back}
      basePath="/qa"
      ticketsPath="/qa/tickets"
      params={periodParam}
      rows={toTicketRows(tickets)}
      toolbar={<PeriodSelector value={periodValue(mode)} defaultWeeks={defaultWeeks} />}
      ticketActions={
        <Link href="/qa/tickets/new" className={buttonClass("secondary", "sm")}>
          New ticket
        </Link>
      }
    />
  );
}
