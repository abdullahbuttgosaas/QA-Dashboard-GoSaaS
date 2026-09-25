import { describe, expect, it } from "vitest";
import { QaRecordInputSchema, completionDateAllowed, withStatus, type QaStatus } from "./qa";

const base = { ticket_number: "CHG0000001", data: {} };
const parse = (qa_status: QaStatus, qa_completed_on: string | null) =>
  QaRecordInputSchema.safeParse({ ...base, qa_status, qa_completed_on });
const dateError = (r: ReturnType<typeof parse>) =>
  r.success ? null : r.error.issues.find((i) => i.path.join(".") === "qa_completed_on")?.message;

describe("ticket status vs QA completed date (server-side validation)", () => {
  it("1. Assigned without a completion date is valid", () => {
    expect(parse("assigned", null).success).toBe(true);
  });
  it("2. Assigned with a completion date is rejected", () => {
    expect(dateError(parse("assigned", "2026-09-25"))).toMatch(/Only QA completed tickets/);
  });
  it("3. In progress without a completion date is valid", () => {
    expect(parse("in_progress", null).success).toBe(true);
  });
  it("4. In progress with a completion date is rejected", () => {
    expect(dateError(parse("in_progress", "2026-09-25"))).toMatch(/Only QA completed tickets/);
  });
  it("5. QA completed with a valid completion date is valid", () => {
    expect(parse("qa_completed", "2026-09-25").success).toBe(true);
  });
  it("QA completed without a date is still rejected (date required)", () => {
    expect(dateError(parse("qa_completed", null))).toMatch(/required/);
  });
  it("6. Changing QA completed -> in progress clears the completion date", () => {
    const completed = { qa_status: "qa_completed" as QaStatus, qa_completed_on: "2026-09-25", title: "x" };
    const moved = withStatus(completed, "in_progress");
    expect(moved).toEqual({ qa_status: "in_progress", qa_completed_on: null, title: "x" });
    expect(parse(moved.qa_status, moved.qa_completed_on).success).toBe(true);
    expect(withStatus(completed, "assigned").qa_completed_on).toBeNull();
    expect(withStatus(completed, "qa_completed").qa_completed_on).toBe("2026-09-25");
  });
  it("only QA completed allows a completion date", () => {
    expect(["assigned", "in_progress", "qa_completed"].map((s) => completionDateAllowed(s as QaStatus))).toEqual([false, false, true]);
  });
});
