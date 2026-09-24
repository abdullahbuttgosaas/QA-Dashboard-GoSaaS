import { z } from "zod";
import {
  BUG_SEVERITIES,
  BUG_STATUSES,
  QA_STATUSES,
  QA_DATA_SCHEMA_VERSION,
  RETEST_RESULTS,
  TEST_CASE_STATUSES,
  type QaRecordInput,
} from "@/types/qa";

// Schema the AI is asked to produce. Every field is required-but-nullable so the model
// states "unknown" explicitly instead of inventing values. Custom fields are a list of
// name/value pairs because free-form object keys are poorly supported by structured output.

const str = z.string().nullable();
const date = z.string().nullable().describe("ISO date YYYY-MM-DD, or null if not stated");

export const AiExtractionSchema = z.object({
  ticket: z.object({
    ticket_number: str.describe("Change/ticket identifier, e.g. CHG0045893"),
    title: str,
    functional_area: str.describe("Business/functional area or module under test"),
    qa_status: z.enum(QA_STATUSES).nullable(),
    assigned_on: date,
    qa_completed_on: date,
  }),
  summary: str.describe("Short overview of what was tested and the outcome"),
  environment: str,
  requirements: z.array(z.object({ ref: str, text: z.string() })),
  test_cases: z.array(
    z.object({
      ref: str,
      title: z.string(),
      requirement_refs: z.array(z.string()),
      steps: z.array(z.string()),
      expected_result: str,
      actual_result: str,
      status: z.enum(TEST_CASE_STATUSES),
      executed_on: date,
      notes: str,
    }),
  ),
  bugs: z.array(
    z.object({
      ref: str,
      title: z.string(),
      description: str,
      severity: z.enum(BUG_SEVERITIES).nullable(),
      status: z.enum(BUG_STATUSES).nullable(),
      steps_to_reproduce: z.array(z.string()),
      test_case_refs: z.array(z.string()),
      found_on: date,
    }),
  ),
  retests: z.array(
    z.object({
      bug_ref: str,
      test_case_ref: str,
      date,
      result: z.enum(RETEST_RESULTS),
      notes: str,
    }),
  ),
  evidence: z.array(z.object({ description: z.string(), location: str })),
  custom_fields: z.array(z.object({ name: z.string(), value: z.string() })),
  custom_sections: z.array(z.object({ heading: z.string(), content: z.string() })),
  extraction_notes: z
    .array(z.string())
    .describe("Anything ambiguous, missing or uncertain that the reviewer should double-check"),
});

export type AiExtraction = z.infer<typeof AiExtractionSchema>;

// JSON Schema for the provider, trimmed to keywords structured-output APIs support.
export function aiExtractionJsonSchema(): Record<string, unknown> {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "$schema" || key === "additionalProperties") continue;
      out[key] = strip(value);
    }
    return out;
  };
  return strip(z.toJSONSchema(AiExtractionSchema)) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tolerant normalization: never trust model output shape. Anything malformed
// degrades to empty/default values rather than failing the whole extraction.
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

const asObj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStr = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const asStrOrNull = (v: unknown): string | null => asStr(v) || null;
const asStrList = (v: unknown): string[] => asArr(v).map(asStr).filter(Boolean);
const asDate = (v: unknown): string | null => {
  const s = asStr(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
};
function asEnum<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  const s = asStr(v).toLowerCase().replace(/[\s-]+/g, "_");
  return (allowed as readonly string[]).includes(s) ? (s as T) : null;
}

export type ReviewDraft = {
  record: QaRecordInput;
  notes: string[];
};

export function normalizeExtraction(raw: unknown): ReviewDraft {
  const root = asObj(raw);
  const ticket = asObj(root.ticket);

  const customFields: Record<string, string> = {};
  for (const item of asArr(root.custom_fields)) {
    const { name, value } = asObj(item);
    const key = asStr(name);
    if (key) customFields[key] = asStr(value);
  }

  const record: QaRecordInput = {
    ticket_number: asStr(ticket.ticket_number).toUpperCase(),
    title: asStr(ticket.title),
    functional_area: asStrOrNull(ticket.functional_area),
    qa_status: asEnum(ticket.qa_status, QA_STATUSES) ?? "qa_completed",
    assigned_on: asDate(ticket.assigned_on),
    qa_completed_on: asDate(ticket.qa_completed_on),
    data: {
      schema_version: QA_DATA_SCHEMA_VERSION,
      summary: asStr(root.summary),
      environment: asStr(root.environment),
      requirements: asArr(root.requirements).map((r) => {
        const o = asObj(r);
        return { ref: asStr(o.ref), text: asStr(o.text) };
      }),
      test_cases: asArr(root.test_cases).map((t) => {
        const o = asObj(t);
        return {
          ref: asStr(o.ref),
          title: asStr(o.title),
          requirement_refs: asStrList(o.requirement_refs),
          steps: asStrList(o.steps),
          expected_result: asStr(o.expected_result),
          actual_result: asStr(o.actual_result),
          status: asEnum(o.status, TEST_CASE_STATUSES) ?? "not_run",
          executed_on: asDate(o.executed_on),
          notes: asStr(o.notes),
        };
      }),
      bugs: asArr(root.bugs).map((b) => {
        const o = asObj(b);
        return {
          ref: asStr(o.ref),
          title: asStr(o.title),
          description: asStr(o.description),
          severity: asEnum(o.severity, BUG_SEVERITIES),
          status: asEnum(o.status, BUG_STATUSES) ?? "open",
          steps_to_reproduce: asStrList(o.steps_to_reproduce),
          test_case_refs: asStrList(o.test_case_refs),
          found_on: asDate(o.found_on),
        };
      }),
      retests: asArr(root.retests).map((r) => {
        const o = asObj(r);
        return {
          bug_ref: asStrOrNull(o.bug_ref),
          test_case_ref: asStrOrNull(o.test_case_ref),
          date: asDate(o.date),
          result: asEnum(o.result, RETEST_RESULTS) ?? "pending",
          notes: asStr(o.notes),
        };
      }),
      evidence: asArr(root.evidence).map((e) => {
        const o = asObj(e);
        return { description: asStr(o.description), location: asStr(o.location) };
      }),
      custom_fields: customFields,
      custom_sections: asArr(root.custom_sections)
        .map((s) => {
          const o = asObj(s);
          return { heading: asStr(o.heading), content: asStr(o.content) };
        })
        .filter((s) => s.heading),
    },
  };

  // Blocking issues first, then the model's own notes, then softer warnings.
  const notes: string[] = [];
  if (!record.ticket_number) notes.push("No ticket number was found. Enter it before confirming.");
  if (record.qa_status === "qa_completed" && !record.qa_completed_on) {
    notes.push("No QA completion date was found. It is required for period metrics.");
  }
  notes.push(...asStrList(root.extraction_notes));
  const bugsWithoutSeverity = record.data.bugs.filter((b) => !b.severity).length;
  if (bugsWithoutSeverity) notes.push(`${bugsWithoutSeverity} bug(s) have no severity.`);

  return { record, notes };
}
