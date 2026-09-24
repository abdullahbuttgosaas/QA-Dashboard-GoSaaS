import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireQa } from "@/services/profiles";
import { getPeriodMetrics } from "@/services/metrics";
import { listTickets } from "@/services/records";
import { toTicketRows } from "@/services/tickets-view";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "QA dashboard" };

export default async function QaDashboardPage({ searchParams }: PageProps<"/qa">) {
  const sp = await searchParams;
  const { profile } = await requireQa();
  const db = await createClient();
  const [periods, tickets] = await Promise.all([getPeriodMetrics(db, profile.id), listTickets(db, profile.id)]);

  return (
    <DashboardView
      title="My QA summary"
      periods={periods}
      back={Number.parseInt(String(sp.back ?? "0"), 10) || 0}
      periodLabel={profile.reporting_period_anchor ? `${profile.reporting_period_days}-day period` : `Last ${profile.reporting_period_days} days`}
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
