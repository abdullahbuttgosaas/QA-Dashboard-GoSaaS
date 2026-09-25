import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QaRecordInputSchema, type QaStatus } from "@/types/qa";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

async function renderEditor(qa_status: QaStatus, qa_completed_on: string | null) {
  const { RecordEditor } = await import("./record-editor");
  const initial = QaRecordInputSchema.parse({ ticket_number: "CHG1", qa_status: "qa_completed", qa_completed_on: "2026-09-25", data: {} });
  return renderToStaticMarkup(
    <RecordEditor initial={{ ...initial, qa_status, qa_completed_on }} submitLabel="Save" onSubmit={async () => ({ ok: true })} cancelHref="/qa" />,
  );
}

// The completion-date <input> as rendered.
const dateInput = (html: string) => /<input[^>]*name="qa_completed_on"[^>]*>/.exec(html)?.[0] ?? "";

describe("record editor: QA completed date field", () => {
  it("7. is disabled for Assigned", async () => {
    const html = await renderEditor("assigned", null);
    expect(dateInput(html)).toMatch(/ disabled=""/);
    expect(html).toContain("Only available when the status is QA completed");
  });
  it("8. is disabled for In progress", async () => {
    const html = await renderEditor("in_progress", null);
    expect(dateInput(html)).toMatch(/ disabled=""/);
  });
  it("9. is enabled (and marked required) for QA completed", async () => {
    const html = await renderEditor("qa_completed", "2026-09-25");
    expect(dateInput(html)).not.toMatch(/ disabled=""/);
    expect(dateInput(html)).toContain('value="2026-09-25"');
    expect(html).toContain("QA completed on *");
  });
});
