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

const BUG_TITLE = "Prospective_Supplier_Registration_Approval_Group_missing_Ryan_Approver_in_GKOS_BPM_Approval_Groups_Configuration";
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
  data: QaDataSchema.parse({
    evidence: [{ description: LONG, location: "Image 1" }],
    bugs: [{ ref: "Bug 1", title: BUG_TITLE, severity: "high", status: "open" }],
  }),
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
  ])("%s: no Open action is rendered", async (_who, base) => {
    const html = await render(base);
    expect(anchor(html, "open")).toBe("");
    // No link/button labelled Open (the bug status badge "Open" is a <span>, not an action).
    expect(html).not.toMatch(/<(a|button)\b[^>]*>(?:(?!<\/\1>)[\s\S])*\bOpen\b(?:(?!<\/\1>)[\s\S])*<\/\1>/);
    expect(html).not.toMatch(/in a new tab/);
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

  it("Download keeps its button styling (incl. hover/focus states)", async () => {
    const downloadClass = classOf(anchor(await render("/manager/documents"), "download"));
    expect(downloadClass).toMatch(/border/);
    expect(downloadClass).toMatch(/hover:/);
    expect(downloadClass).toMatch(/focus-visible:/);
  });

  it("Download sits in a wrapping row and the file name wraps instead of being cut", async () => {
    const html = await render("/manager/documents");
    expect(html).toMatch(/<div class="mt-2 flex flex-wrap gap-2"><a[^>]*data-report-action="download"/);
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

describe("bug title", () => {
  it("wraps a long unbroken identifier inside the card (full title, no truncation, no scroll)", async () => {
    const html = await render("/manager/documents");
    const title = /<span class="([^"]*)" data-bug-title="true">([^<]*)<\/span>/.exec(html);
    expect(title?.[2]).toBe(BUG_TITLE);
    expect(title?.[1]).toMatch(/\bmin-w-0\b/);
    expect(title?.[1]).toMatch(/\bwrap-anywhere\b/);
    expect(title?.[1]).not.toMatch(/truncate|overflow-hidden|overflow-x-auto|whitespace-nowrap/);
    const item = /<li[^>]*data-bug-item[^>]*>/.exec(html)?.[0] ?? "";
    expect(item).toMatch(/min-w-0/);
    expect(html).toMatch(/<span class="ml-auto flex shrink-0 flex-wrap gap-2">/); // badges keep size, may wrap
  });
});

describe("manager vs QA ticket detail", () => {
  it("manager view renders no edit/delete controls", async () => {
    const html = await render("/manager/documents");
    expect(html).not.toMatch(/>Edit<|>Delete</);
    expect(anchor(html, "download")).not.toBe("");
  });

  it("QA view keeps the same report/evidence UI plus its own actions", async () => {
    const html = await render("/qa/documents", <button>Edit</button>);
    expect(html).toContain(">Edit<");
    expect(anchor(html, "open")).toBe("");
    expect(anchor(html, "download")).not.toBe("");
    expect(html).toContain(LONG);
  });
});
