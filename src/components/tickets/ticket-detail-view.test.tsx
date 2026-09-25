import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QaDataSchema } from "@/types/qa";
import type { QaRecord, RecordDocument } from "@/services/records";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const LONG = "https://example.com/" + "x".repeat(400) + "/screenshot-with-a-very-long-unbroken-identifier.png";

const record = {
  id: "11111111-1111-4111-8111-111111111111",
  owner_id: "22222222-2222-4222-8222-222222222222",
  ticket_number: "CHG0045893",
  title: "Updates to Equipment Procurement",
  functional_area: "Procurement",
  qa_status: "qa_completed",
  assigned_on: null,
  qa_completed_on: "2026-09-25",
  source_document_id: null,
  created_at: "2026-09-25T00:00:00Z",
  updated_at: "2026-09-25T00:00:00Z",
  data: QaDataSchema.parse({ evidence: [{ description: LONG, location: "Image 1" }] }),
} as QaRecord;

const documents: RecordDocument[] = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    file_name: "CHG0045893 - Break Fix QA.docx",
    mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size_bytes: 539727,
    storage_path: "x/y/z.docx",
    confirmed_at: "2026-09-25T00:00:00Z",
    created_at: "2026-09-25T00:00:00Z",
  },
];

async function render(documentsBase: string, actions?: React.ReactNode) {
  const { TicketDetailView } = await import("./ticket-detail-view");
  return renderToStaticMarkup(
    <TicketDetailView record={record} documents={documents} backHref="/x" documentsBase={documentsBase} actions={actions} />,
  );
}

const anchor = (html: string, action: "open" | "download") =>
  new RegExp(`<a[^>]*data-report-action="${action}"[^>]*>`).exec(html)?.[0] ?? "";
const classOf = (tag: string) => /class="([^"]*)"/.exec(tag)?.[1];

describe("QA report actions", () => {
  it.each([
    ["manager", "/manager/documents"],
    ["QA", "/qa/documents"],
  ])("%s: Open opens the signed-link route in a new tab", async (_who, base) => {
    const open = anchor(await render(base), "open");
    expect(open).toContain(`href="${base}/${documents[0].id}"`);
    expect(open).toContain('target="_blank"');
    expect(open).toContain('rel="noopener noreferrer"');
    expect(open).toContain(`aria-label="Open ${documents[0].file_name} in a new tab"`);
  });

  it.each([
    ["manager", "/manager/documents"],
    ["QA", "/qa/documents"],
  ])("%s: Download requests an attachment download", async (_who, base) => {
    const download = anchor(await render(base), "download");
    expect(download).toContain(`href="${base}/${documents[0].id}?download=1"`);
    expect(download).toContain(`download="${documents[0].file_name}"`);
    expect(download).not.toContain("target=");
    expect(download).toContain(`aria-label="Download ${documents[0].file_name}"`);
  });

  it("both actions share identical button styling (incl. hover/focus states)", async () => {
    const html = await render("/manager/documents");
    const openClass = classOf(anchor(html, "open"));
    expect(openClass).toBeTruthy();
    expect(classOf(anchor(html, "download"))).toBe(openClass);
    expect(openClass).toMatch(/border/);
    expect(openClass).toMatch(/hover:/);
    expect(openClass).toMatch(/focus-visible:/);
  });

  it("actions wrap instead of overflowing, and the file name wraps instead of being cut", async () => {
    const html = await render("/manager/documents");
    expect(html).toMatch(/<div class="mt-2 flex flex-wrap gap-2"><a[^>]*data-report-action="open"/);
    expect(html).toMatch(/class="[^"]*wrap-anywhere[^"]*"[^>]*>CHG0045893 - Break Fix QA.docx/);
  });
});

describe("evidence text", () => {
  it("keeps long unbroken text inside the card (wraps, not truncated, no scroll)", async () => {
    const html = await render("/manager/documents");
    const item = /<li[^>]*data-evidence-item[^>]*>.*?<\/li>/.exec(html)?.[0] ?? "";
    expect(item).toMatch(/<li class="[^"]*min-w-0[^"]*"/);
    expect(item).toMatch(/<span class="[^"]*min-w-0[^"]*flex-1[^"]*wrap-anywhere[^"]*">https:\/\/example.com\/x{400}/);
    expect(item).toContain(LONG); // full text, not truncated
    expect(item).not.toMatch(/truncate|overflow-x-auto|overflow-hidden/);
  });
});

describe("manager vs QA ticket detail", () => {
  it("manager view renders no edit/delete controls", async () => {
    const html = await render("/manager/documents");
    expect(html).not.toMatch(/>Edit<|>Delete</);
    expect(anchor(html, "open")).not.toBe("");
  });

  it("QA view keeps the same report/evidence UI plus its own actions", async () => {
    const html = await render("/qa/documents", <button>Edit</button>);
    expect(html).toContain(">Edit<");
    expect(anchor(html, "open")).not.toBe("");
    expect(anchor(html, "download")).not.toBe("");
    expect(html).toContain(LONG);
  });
});
