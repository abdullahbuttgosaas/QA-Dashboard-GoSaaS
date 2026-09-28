import { describe, expect, it } from "vitest";
import { QaRecordInputSchema } from "@/types/qa";
import { normalizeExtraction } from "./schema";
import { replacementDraft } from "./replacement";

// The existing ticket (from the task's example): assigned Sep 11, completed Sep 15, lots of old data.
const target = { ticket_number: "CHG0047193", assigned_on: "2026-09-11" };

// New document: no status, no completion date, new overview, 1 bug, 8 test cases, 4 requirements, nothing else.
const newDocument = {
  ticket: { ticket_number: "CHG0047193", title: "New title" },
  summary: "New overview",
  requirements: [1, 2, 3, 4].map((i) => ({ ref: `R${i}`, text: `Req ${i}` })),
  test_cases: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ ref: `TC-${i}`, status: "pass" })),
  bugs: [{ ref: "BUG-9", title: "Only bug", severity: "low" }],
};

describe("replacementDraft (upload & extract into an existing ticket)", () => {
  it("is built only from the document, plus the preserved ticket number and Assigned date", () => {
    const { record, notes } = replacementDraft(normalizeExtraction(newDocument), target);
    expect(record.assigned_on).toBe("2026-09-11");
    expect(record.ticket_number).toBe("CHG0047193");
    expect(record.title).toBe("New title");
    expect(record.data.summary).toBe("New overview");
    expect(record.data.bugs).toHaveLength(1);
    expect(record.data.test_cases).toHaveLength(8);
    expect(record.data.requirements).toHaveLength(4);
    expect(record.data.retests).toEqual([]);
    expect(record.data.evidence).toEqual([]);
    expect(record.data.custom_fields).toEqual({});
    expect(record.data.custom_sections).toEqual([]);
    expect(record.data.environment).toBe("");
    expect(record.functional_area).toBeNull();
    // No status and no completion date in the document -> default status, no date (old values never survive).
    expect(record.qa_status).toBe("assigned");
    expect(record.qa_completed_on).toBeNull();
    expect(notes.join(" ")).toMatch(/does not state a QA status/);
    expect(notes.join(" ")).not.toMatch(/No QA completion date was found/);
    // Valid as-is under the normal status/completion-date rules.
    expect(QaRecordInputSchema.safeParse(record).success).toBe(true);
  });

  it("keeps the document's own status and completion date", () => {
    const { record } = replacementDraft(
      normalizeExtraction({ ...newDocument, ticket: { ...newDocument.ticket, qa_status: "qa_completed", qa_completed_on: "2026-09-24" } }),
      target,
    );
    expect(record.qa_status).toBe("qa_completed");
    expect(record.qa_completed_on).toBe("2026-09-24");
  });

  it("a completion date without a status means QA completed (the normal extraction rule)", () => {
    const { record } = replacementDraft(normalizeExtraction({ ...newDocument, ticket: { qa_completed_on: "2026-09-24" } }), target);
    expect([record.qa_status, record.qa_completed_on]).toEqual(["qa_completed", "2026-09-24"]);
  });

  it("status In progress drops a completion date (status rule stays authoritative)", () => {
    const { record } = replacementDraft(
      normalizeExtraction({ ...newDocument, ticket: { qa_status: "in_progress", qa_completed_on: "2026-09-24" } }),
      target,
    );
    expect([record.qa_status, record.qa_completed_on]).toEqual(["in_progress", null]);
  });

  it("ignores the document's ticket number and assigned date, and says so", () => {
    const { record, notes } = replacementDraft(
      normalizeExtraction({ ...newDocument, ticket: { ticket_number: "CHG9999999", assigned_on: "2026-01-01", qa_status: "assigned" } }),
      target,
    );
    expect(record.ticket_number).toBe("CHG0047193");
    expect(record.assigned_on).toBe("2026-09-11");
    expect(notes.join(" ")).toMatch(/refers to CHG9999999/);
    expect(notes.join(" ")).toMatch(/keeps its Assigned date/);
  });

  it("preserves an empty Assigned date as empty", () => {
    const { record } = replacementDraft(normalizeExtraction({ ticket: { assigned_on: "2026-02-02" } }), { ticket_number: "X-1", assigned_on: null });
    expect(record.assigned_on).toBeNull();
    expect(record.data.test_cases).toEqual([]);
  });

  it("never asks for a ticket number (it is fixed)", () => {
    const { notes } = replacementDraft(normalizeExtraction({}), target);
    expect(notes.join(" ")).not.toMatch(/No ticket number was found/);
  });
});
