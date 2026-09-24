import { z } from "zod";

// Shape of qa_records.data (JSONB). Validated before every write.
// Unknown/custom information goes into custom_fields (short key/values) or
// custom_sections (headed free text), so nothing from a report is discarded.

export const QA_DATA_SCHEMA_VERSION = 1;

export const TEST_CASE_STATUSES = ["pass", "fail", "blocked", "not_run"] as const;
export const BUG_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export const BUG_STATUSES = ["open", "fixed", "closed", "wont_fix"] as const;
export const RETEST_RESULTS = ["pass", "fail", "pending"] as const;
export const QA_STATUSES = ["assigned", "in_progress", "qa_completed"] as const;

export type TestCaseStatus = (typeof TEST_CASE_STATUSES)[number];
export type BugSeverity = (typeof BUG_SEVERITIES)[number];
export type BugStatus = (typeof BUG_STATUSES)[number];
export type RetestResult = (typeof RETEST_RESULTS)[number];
export type QaStatus = (typeof QA_STATUSES)[number];

const text = z.string().trim().max(20_000);
const shortText = z.string().trim().max(500);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .nullable();

export const RequirementSchema = z.object({
  ref: shortText.default(""),
  text: text.default(""),
});

export const TestCaseSchema = z.object({
  ref: shortText.default(""),
  title: shortText.default(""),
  requirement_refs: z.array(shortText).default([]),
  steps: z.array(text).default([]),
  expected_result: text.default(""),
  actual_result: text.default(""),
  status: z.enum(TEST_CASE_STATUSES).default("not_run"),
  executed_on: isoDate.default(null),
  notes: text.default(""),
});

export const BugSchema = z.object({
  ref: shortText.default(""),
  title: shortText.default(""),
  description: text.default(""),
  severity: z.enum(BUG_SEVERITIES).nullable().default(null),
  status: z.enum(BUG_STATUSES).default("open"),
  steps_to_reproduce: z.array(text).default([]),
  test_case_refs: z.array(shortText).default([]),
  found_on: isoDate.default(null),
});

export const RetestSchema = z.object({
  bug_ref: shortText.nullable().default(null),
  test_case_ref: shortText.nullable().default(null),
  date: isoDate.default(null),
  result: z.enum(RETEST_RESULTS).default("pending"),
  notes: text.default(""),
});

export const EvidenceSchema = z.object({
  description: text.default(""),
  location: shortText.default(""),
});

export const CustomSectionSchema = z.object({
  heading: shortText,
  content: text.default(""),
});

export const QaDataSchema = z.object({
  schema_version: z.literal(QA_DATA_SCHEMA_VERSION).default(QA_DATA_SCHEMA_VERSION),
  summary: text.default(""),
  environment: shortText.default(""),
  requirements: z.array(RequirementSchema).default([]),
  test_cases: z.array(TestCaseSchema).default([]),
  bugs: z.array(BugSchema).default([]),
  retests: z.array(RetestSchema).default([]),
  evidence: z.array(EvidenceSchema).default([]),
  custom_fields: z.record(shortText, text).default({}),
  custom_sections: z.array(CustomSectionSchema).default([]),
});

export type Requirement = z.infer<typeof RequirementSchema>;
export type TestCase = z.infer<typeof TestCaseSchema>;
export type Bug = z.infer<typeof BugSchema>;
export type Retest = z.infer<typeof RetestSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type CustomSection = z.infer<typeof CustomSectionSchema>;
export type QaData = z.infer<typeof QaDataSchema>;

// A full ticket as entered/reviewed by a QA user (relational columns + JSONB data).
export const QaRecordInputSchema = z
  .object({
    ticket_number: z.string().trim().min(1, "Ticket number is required").max(64),
    title: shortText.default(""),
    functional_area: shortText.nullable().default(null),
    qa_status: z.enum(QA_STATUSES).default("qa_completed"),
    assigned_on: isoDate.default(null),
    qa_completed_on: isoDate.default(null),
    data: QaDataSchema,
  })
  .refine((r) => r.qa_status !== "qa_completed" || !!r.qa_completed_on, {
    message: "QA completed date is required when status is QA completed",
    path: ["qa_completed_on"],
  });

export type QaRecordInput = z.infer<typeof QaRecordInputSchema>;

export function emptyQaData(): QaData {
  return QaDataSchema.parse({});
}

// Tolerant parse for data read from the DB (older/partial shapes still render).
export function parseQaData(value: unknown): QaData {
  const result = QaDataSchema.safeParse(value ?? {});
  return result.success ? result.data : emptyQaData();
}
