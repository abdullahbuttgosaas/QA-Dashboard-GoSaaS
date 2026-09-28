import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { WeekBucket, WeekTotals } from "@/lib/reporting";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const zero: WeekTotals = {
  tickets_assigned: 0,
  tickets_completed: 0,
  test_cases_executed: 0,
  test_cases_passed: 0,
  test_cases_failed: 0,
  test_cases_blocked: 0,
  bugs_total: 0,
  bugs_critical: 0,
  bugs_high: 0,
  bugs_medium: 0,
  bugs_low: 0,
  retests_total: 0,
  retests_passed: 0,
  retests_failed: 0,
  retests_pending: 0,
};
const week = (i: number, start: string, end: string, bugs: number): WeekBucket => ({ ...zero, week_index: i, week_start: start, week_end: end, bugs_total: bugs, tickets_completed: 1 });
const fourWeeks = [
  week(0, "2026-08-31", "2026-09-04", 0),
  week(1, "2026-09-07", "2026-09-11", 1),
  week(2, "2026-09-14", "2026-09-18", 5),
  week(3, "2026-09-21", "2026-09-25", 1),
];
const metric = (html: string, name: string) => new RegExp(`data-metric="${name}"[^>]*>([^<]*)<`).exec(html)?.[1];

async function render(props: Partial<React.ComponentProps<typeof import("./dashboard-view").DashboardView>>) {
  const { DashboardView } = await import("./dashboard-view");
  return renderToStaticMarkup(
    <DashboardView title="QA summary" weeks={fourWeeks} mode={{ kind: "weeks", weeks: 2 }} back={0} basePath="/manager" ticketsPath="/manager/tickets" rows={[]} {...props} />,
  );
}

describe("dashboard: N-week periods (unchanged)", () => {
  it("2 weeks: label, comparison and period navigation", async () => {
    const html = await render({});
    expect(html).toContain('data-period="2026-09-14..2026-09-25"');
    expect(html).toMatch(/Last 2 weeks/);
    expect(html).toMatch(/Monday–Friday/);
    expect(metric(html, "bugs_total")).toBe("6");
    expect(html).toMatch(/vs previous period/);
    expect(html).toMatch(/Previous period/);
    expect(html).toMatch(/Previous week/);
  });
});

describe("dashboard: Lifetime", () => {
  const lifetimeWeeks = [week(0, "2026-01-05", "2026-01-09", 2), ...fourWeeks.map((w, i) => ({ ...w, week_index: i + 1 }))];
  const totals: WeekTotals = { ...zero, bugs_total: 12, tickets_completed: 9, test_cases_executed: 20 };

  it("labels the period 'Lifetime · All historical data' and uses the all-history totals", async () => {
    const html = await render({ mode: { kind: "lifetime" }, weeks: lifetimeWeeks, lifetimeTotals: totals });
    expect(html).toContain('data-period="lifetime"');
    expect(html).toMatch(/Lifetime · All historical data/);
    expect(metric(html, "bugs_total")).toBe("12");
    expect(metric(html, "tickets_completed")).toBe("9");
  });

  it("shows no fabricated previous-period comparison or period navigation", async () => {
    const html = await render({ mode: { kind: "lifetime" }, weeks: lifetimeWeeks, lifetimeTotals: totals });
    expect(html).not.toMatch(/vs previous period|No change|▲|▼/);
    expect(html).not.toMatch(/Previous period|Next period/);
    expect(html).not.toMatch(/Last \d+ weeks|Previous week|Current week/);
  });

  it("trend spans every historical week (dated buckets)", async () => {
    const html = await render({ mode: { kind: "lifetime" }, weeks: lifetimeWeeks, lifetimeTotals: totals });
    expect(html).toMatch(/All history · 5 calendar weeks · Monday–Friday/);
    expect(html).toMatch(/Week of Jan 5 – Jan 9, 2026/);
  });
});

describe("period selector", () => {
  it("offers 1 week through 12 weeks plus Lifetime, marking the default", async () => {
    const { PeriodSelector } = await import("./period-selector");
    const html = renderToStaticMarkup(<PeriodSelector value="2" defaultWeeks={2} keep={{ qa: "abdullah" }} />);
    const options = [...html.matchAll(/<option value="([^"]+)"[^>]*>([^<]*(?:<!-- -->[^<]*)*)<\/option>/g)].map((m) => [m[1], m[2].replace(/<!-- -->/g, "")]);
    expect(options.map((o) => o[0])).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "lifetime"]);
    expect(options[0][1]).toBe("1 week");
    expect(options[1][1]).toBe("2 weeks (default)");
    expect(options[11][1]).toBe("12 weeks");
    expect(options[12][1]).toBe("Lifetime");
    expect(html).toContain('<input type="hidden" name="qa" value="abdullah"/>');
  });
});
