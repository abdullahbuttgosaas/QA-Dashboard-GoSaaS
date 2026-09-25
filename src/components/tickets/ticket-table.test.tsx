import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TicketTable, type TicketRow } from "./ticket-table";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const row = (over: Partial<TicketRow>): TicketRow => ({
  id: "11111111-1111-4111-8111-111111111111",
  ticket_number: "CHG0046926",
  title: "t",
  owner: "Abdullah Butt",
  functional_area: null,
  qa_status: "qa_completed",
  qa_completed_on: "2026-09-24",
  assigned_on: "2026-09-21",
  executed: 3,
  passRate: 1,
  failed: 0,
  bugs: 1,
  retests: 0,
  ...over,
});

const headers = (html: string) => [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
const cells = (html: string) => /<tbody[^>]*>[\s\S]*?<\/tbody>/.exec(html)?.[0] ?? "";

describe("ticket table Assigned column", () => {
  it("manager (All QAs): Ticket | QA | Status | Assigned | QA completed | Executed | Pass rate | Failed | Bugs | Retests", () => {
    const html = renderToStaticMarkup(<TicketTable rows={[row({})]} hrefBase="/manager/tickets" showOwner />);
    expect(headers(html)).toEqual(["Ticket", "QA", "Status", "Assigned", "QA completed", "Executed", "Pass rate", "Failed", "Bugs", "Retests"]);
  });

  it("QA's own table: same columns without QA", () => {
    const html = renderToStaticMarkup(<TicketTable rows={[row({})]} hrefBase="/qa/tickets" />);
    expect(headers(html)).toEqual(["Ticket", "Status", "Assigned", "QA completed", "Executed", "Pass rate", "Failed", "Bugs", "Retests"]);
  });

  it("shows assigned_on with the app's date format, right after the status", () => {
    const html = renderToStaticMarkup(<TicketTable rows={[row({})]} hrefBase="/qa/tickets" />);
    expect(cells(html)).toMatch(/QA completed<\/span><\/td><td[^>]*>Sep 21, 2026<\/td><td[^>]*>Sep 24, 2026<\/td>/);
  });

  it("shows — when assigned_on is empty", () => {
    const html = renderToStaticMarkup(
      <TicketTable rows={[row({ assigned_on: null, qa_status: "in_progress", qa_completed_on: null })]} hrefBase="/qa/tickets" />,
    );
    expect(cells(html)).toMatch(/In progress<\/span><\/td><td[^>]*>—<\/td><td[^>]*>—<\/td>/);
  });
});
