import { describe, expect, it } from "vitest";
import { QaRecordInputSchema } from "@/types/qa";
import { aiExtractionJsonSchema, normalizeExtraction } from "./schema";

describe("normalizeExtraction", () => {
  it("maps a well-formed AI response into a reviewable record", () => {
    const { record, notes } = normalizeExtraction({
      ticket: { ticket_number: "chg0045893", title: "Updates to Equipment Procurement", qa_status: "qa_completed", qa_completed_on: "2026-09-20" },
      test_cases: [
        { ref: "TC-1", title: "Create request", status: "pass", steps: ["Open", "Submit"] },
        { ref: "TC-2", title: "Approval", status: "fail" },
      ],
      bugs: [{ ref: "BUG-1", title: "Wrong approver", severity: "High" }],
      retests: [{ bug_ref: "BUG-1", result: "pass", date: "2026-09-22" }],
      custom_fields: [{ name: "Tester", value: "Abdullah" }],
      custom_sections: [{ heading: "Business Impact", content: "Controls bypassed" }],
      extraction_notes: ["Check TC-2 date"],
    });

    expect(record.ticket_number).toBe("CHG0045893");
    expect(record.data.test_cases.map((t) => t.status)).toEqual(["pass", "fail"]);
    expect(record.data.bugs[0].severity).toBe("high");
    expect(record.data.retests[0]).toMatchObject({ bug_ref: "BUG-1", result: "pass", date: "2026-09-22" });
    expect(record.data.custom_fields).toEqual({ Tester: "Abdullah" });
    expect(record.data.custom_sections[0].heading).toBe("Business Impact");
    expect(notes).toContain("Check TC-2 date");
    expect(QaRecordInputSchema.safeParse(record).success).toBe(true);
  });

  it("degrades malformed output to safe defaults instead of throwing", () => {
    const { record, notes } = normalizeExtraction({
      ticket: "nope",
      test_cases: [{ status: "PASSED!!" }, null, 42],
      bugs: "not a list",
      retests: [{ result: "maybe", date: "22/09/2026" }],
    });

    expect(record.ticket_number).toBe("");
    expect(record.data.test_cases.every((t) => t.status === "not_run")).toBe(true);
    expect(record.data.bugs).toEqual([]);
    expect(record.data.retests[0]).toMatchObject({ result: "pending", date: null });
    expect(notes[0]).toMatch(/ticket number/i);
  });

  it("drops a completion date when the extracted status is not QA completed", () => {
    const { record, notes } = normalizeExtraction({ ticket: { ticket_number: "CHG1", qa_status: "in_progress", qa_completed_on: "2026-09-20" } });
    expect(record.qa_status).toBe("in_progress");
    expect(record.qa_completed_on).toBeNull();
    expect(notes.some((n) => /not QA completed/.test(n))).toBe(true);
  });

  it("flags a completed ticket without a completion date", () => {
    const { notes } = normalizeExtraction({ ticket: { ticket_number: "CHG1", qa_status: "qa_completed" } });
    expect(notes.some((n) => /completion date/i.test(n))).toBe(true);
  });

  it("produces a provider schema without unsupported keywords", () => {
    const json = JSON.stringify(aiExtractionJsonSchema());
    expect(json).not.toContain("$schema");
    expect(json).not.toContain("additionalProperties");
    expect(json).toContain("custom_sections");
  });
});
