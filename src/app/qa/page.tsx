import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireQa } from "@/services/profiles";
import { getWeeklyMetrics } from "@/services/metrics";
import { clampBack, clampWeeks } from "@/lib/reporting";
import { listTickets } from "@/services/records";
import { toTicketRows } from "@/services/tickets-view";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "QA dashboard" };

export default async function QaDashboardPage({ searchParams }: PageProps<"/qa">) {
  const sp = await searchParams;
  const { profile } = await requireQa();
  const db = await createClient();
  const weeksPerPeriod = clampWeeks(profile.reporting_period_weeks);
  const back = clampBack(sp.back);
  const [weeks, tickets] = await Promise.all([getWeeklyMetrics(db, profile.id, weeksPerPeriod, back), listTickets(db, profile.id)]);

  return (
    <DashboardView
      title="My QA summary"
      weeks={weeks}
      weeksPerPeriod={weeksPerPeriod}
      back={back}
      basePath="/qa"
      ticketsPath="/qa/tickets"
      rows={toTicketRows(tickets)}
      ticketActions={
        <Link href="/qa/tickets/new" className={buttonClass("secondary", "sm")}>
          New ticket
        </Link>
      }
    />
  );
}
