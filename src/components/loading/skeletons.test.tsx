import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { TicketListSkeleton, TicketTableSkeleton } from "./ticket-list-skeleton";
import { TicketDetailSkeleton } from "./ticket-detail-skeleton";
import { FormSkeleton } from "./form-skeleton";

const headers = (html: string) => [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
const count = (html: string, attr: string) => html.split(attr).length - 1;

describe("loading skeletons", () => {
  it("dashboard: metric cards, charts and a ticket table, announced as loading", () => {
    const html = renderToStaticMarkup(<DashboardSkeleton showOwner />);
    expect(html).toContain('data-skeleton="dashboard"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading dashboard…");
    expect(html).toContain("QA activity");
    expect(html).toContain("Solution quality");
    expect(count(html, "data-skeleton-tile")).toBe(8);
    expect(count(html, "data-skeleton-chart")).toBeGreaterThan(0);
    expect(count(html, "data-skeleton-row")).toBe(4);
  });

  it("ticket list keeps the real columns (QA column only across all QAs) and shows no empty state", () => {
    const all = renderToStaticMarkup(<TicketListSkeleton showOwner />);
    expect(all).toContain('data-skeleton="ticket-list"');
    expect(headers(all)).toEqual(["Ticket", "QA", "Status", "Assigned", "QA completed", "Executed", "Pass rate", "Failed", "Bugs", "Retests"]);
    expect(all).not.toMatch(/No tickets/i);
    expect(headers(renderToStaticMarkup(<TicketTableSkeleton />))).not.toContain("QA");
  });

  it("ticket detail covers every section", () => {
    const html = renderToStaticMarkup(<TicketDetailSkeleton />);
    expect(html).toContain('data-skeleton="ticket-detail"');
    for (const s of ["Overview", "Test cases", "Bugs / defects", "Retests", "Requirements", "QA report"]) expect(html).toContain(s);
  });

  it("forms", () => {
    const html = renderToStaticMarkup(<FormSkeleton label="Loading settings…" fields={3} narrow />);
    expect(html).toContain('data-skeleton="form"');
    expect(html).toContain("Loading settings…");
  });

  it("animations respect reduced motion", () => {
    const html = renderToStaticMarkup(<DashboardSkeleton />);
    expect(html).toContain("motion-safe:animate-pulse");
    expect(html).not.toMatch(/(^|[\s"])animate-pulse/);
  });
});

describe("skeleton markup validity", () => {
  it("never nests a block element inside a <p> (hydration-safe)", () => {
    for (const html of [renderToStaticMarkup(<DashboardSkeleton />), renderToStaticMarkup(<TicketDetailSkeleton />), renderToStaticMarkup(<TicketListSkeleton />)]) {
      for (const p of html.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) ?? []) expect(p).not.toMatch(/<(div|section|ul|table)\b/);
    }
  });
});
