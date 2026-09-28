"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { buttonClass } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { cn } from "@/lib/cn";
import { OutcomeBadge, SeverityBadge } from "@/components/ui/badges";
import { formatPercent } from "@/lib/format";
import {
  BUG_SEVERITIES,
  BUG_STATUSES,
  QA_STATUSES,
  RETEST_RESULTS,
  TEST_CASE_STATUSES,
  completionDateAllowed,
  withStatus,
  type Bug,
  type QaRecordInput,
  type Retest,
  type TestCase,
} from "@/types/qa";
import { LinesField, RefsField, SelectField, TextArea, TextField } from "./fields";
import { ListSection } from "./list-section";

type ActionResult = { ok: false; error: string; fieldErrors?: Record<string, string> } | { ok: true } | undefined;

type Props = {
  initial: QaRecordInput;
  submitLabel: string;
  pendingLabel?: string; // e.g. "Creating…", "Confirming…"
  onSubmit: (payload: QaRecordInput) => Promise<ActionResult>;
  cancelHref: string;
  notes?: string[];
  banner?: React.ReactNode;
};

const labels = {
  qa_status: { assigned: "Assigned", in_progress: "In progress", qa_completed: "QA completed" },
  tc: { pass: "Pass", fail: "Fail", blocked: "Blocked", not_run: "Not run" },
  sev: { critical: "Critical", high: "High", medium: "Medium", low: "Low" },
  bug: { open: "Open", fixed: "Fixed", closed: "Closed", wont_fix: "Won't fix" },
  retest: { pass: "Pass", fail: "Fail", pending: "Pending" },
} as const;

const opts = <T extends string>(values: readonly T[], map: Record<T, string>) => values.map((v) => ({ value: v, label: map[v] }));

const newTestCase = (): TestCase => ({
  ref: "",
  title: "",
  requirement_refs: [],
  steps: [],
  expected_result: "",
  actual_result: "",
  status: "not_run",
  executed_on: null,
  notes: "",
});
const newBug = (): Bug => ({
  ref: "",
  title: "",
  description: "",
  severity: null,
  status: "open",
  steps_to_reproduce: [],
  test_case_refs: [],
  found_on: null,
});
const newRetest = (): Retest => ({ bug_ref: null, test_case_ref: null, date: null, result: "pending", notes: "" });

// "data.test_cases.2.executed_on" -> "Test cases #3 executed on"
function readablePath(path: string): string {
  const text = path
    .replace(/^data\./, "")
    .replace(/\.(\d+)(\.|$)/g, (_, n: string) => ` #${Number(n) + 1} `)
    .replace(/_/g, " ")
    .trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const clean = (list: string[]) => list.map((s) => s.trim()).filter(Boolean);

// Drops blank list entries and converts editor-only shapes back to the stored shape.
function finalize(record: QaRecordInput, customFields: Array<{ key: string; value: string }>): QaRecordInput {
  const d = record.data;
  return {
    ...record,
    ticket_number: record.ticket_number.trim(),
    data: {
      ...d,
      requirements: d.requirements.filter((r) => r.ref.trim() || r.text.trim()),
      test_cases: d.test_cases.map((t) => ({ ...t, steps: clean(t.steps), requirement_refs: clean(t.requirement_refs) })),
      bugs: d.bugs.map((b) => ({ ...b, steps_to_reproduce: clean(b.steps_to_reproduce), test_case_refs: clean(b.test_case_refs) })),
      evidence: d.evidence.filter((e) => e.description.trim() || e.location.trim()),
      custom_sections: d.custom_sections.filter((s) => s.heading.trim()),
      custom_fields: Object.fromEntries(customFields.filter((f) => f.key.trim()).map((f) => [f.key.trim(), f.value])),
    },
  };
}

export function RecordEditor({ initial, submitLabel, pendingLabel = "Saving…", onSubmit, cancelHref, notes = [], banner }: Props) {
  const [record, setRecord] = useState<QaRecordInput>(initial);
  const [customFields, setCustomFields] = useState(() =>
    Object.entries(initial.data.custom_fields).map(([key, value]) => ({ key, value })),
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  // Blocks a second submit (double click / Enter) before React has re-rendered the disabled button.
  const inFlight = useRef(false);

  const set = (patch: Partial<QaRecordInput>) => setRecord((r) => ({ ...r, ...patch }));
  const setData = (patch: Partial<QaRecordInput["data"]>) => setRecord((r) => ({ ...r, data: { ...r.data, ...patch } }));
  const d = record.data;

  const stats = useMemo(() => {
    const c = (s: string) => d.test_cases.filter((t) => t.status === s).length;
    const passed = c("pass");
    const failed = c("fail");
    return {
      passed,
      failed,
      blocked: c("blocked"),
      rate: passed + failed ? passed / (passed + failed) : null,
    };
  }, [d.test_cases]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      let result: ActionResult;
      try {
        result = await onSubmit(finalize(record, customFields));
      } finally {
        inFlight.current = false;
      }
      if (result && !result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  return (
    <form onSubmit={submit} aria-busy={pending || undefined} className="space-y-5">
      {banner}
      {error && (
        <div role="alert" className="rounded-md border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">
          {error}
          {Object.keys(fieldErrors).length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {Object.entries(fieldErrors).map(([path, message]) => (
                <li key={path}>
                  {readablePath(path)}: {message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {notes.length > 0 && (
        <div className="rounded-md border border-line bg-warn-soft px-4 py-3 text-sm">
          <div className="mb-1 font-medium text-warn-ink">Please verify</div>
          <ul className="list-disc space-y-0.5 pl-5 text-ink-secondary">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="rounded-lg border border-line bg-surface">
        <div className="border-b border-line px-5 py-3">
          <h3 className="text-sm font-semibold text-ink">Ticket</h3>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Ticket number *"
            value={record.ticket_number}
            onChange={(v) => set({ ticket_number: v.toUpperCase() })}
            error={fieldErrors.ticket_number}
            placeholder="CHG0045893"
          />
          <TextField label="Title" value={record.title} onChange={(v) => set({ title: v })} className="sm:col-span-1 lg:col-span-3" />
          <TextField
            label="Functional area"
            value={record.functional_area ?? ""}
            onChange={(v) => set({ functional_area: v || null })}
          />
          <SelectField
            label="QA status"
            value={record.qa_status}
            options={opts(QA_STATUSES, labels.qa_status)}
            onChange={(v) => setRecord((r) => withStatus(r, v || "assigned"))}
          />
          <TextField
            label="Assigned on"
            type="date"
            value={record.assigned_on ?? ""}
            onChange={(v) => set({ assigned_on: v || null })}
            error={fieldErrors.assigned_on}
          />
          <TextField
            label={completionDateAllowed(record.qa_status) ? "QA completed on *" : "QA completed on"}
            name="qa_completed_on"
            type="date"
            value={record.qa_completed_on ?? ""}
            onChange={(v) => set({ qa_completed_on: v || null })}
            disabled={!completionDateAllowed(record.qa_status)}
            hint={completionDateAllowed(record.qa_status) ? undefined : "Only available when the status is QA completed"}
            error={fieldErrors.qa_completed_on}
          />
          <TextArea label="Summary" value={d.summary} onChange={(v) => setData({ summary: v })} className="sm:col-span-2 lg:col-span-3" />
          <TextField label="Environment" value={d.environment} onChange={(v) => setData({ environment: v })} />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-line px-5 py-3 text-xs text-ink-muted">
          <span>
            Test cases <strong className="text-ink">{d.test_cases.length}</strong>
          </span>
          <span>
            Pass rate <strong className="text-ink">{formatPercent(stats.rate)}</strong> ({stats.passed} passed · {stats.failed} failed ·{" "}
            {stats.blocked} blocked)
          </span>
          <span>
            Bugs <strong className="text-ink">{d.bugs.length}</strong>
          </span>
          <span>
            Retests <strong className="text-ink">{d.retests.length}</strong>
          </span>
        </div>
      </section>

      <ListSection
        title="Test cases"
        items={d.test_cases}
        onChange={(test_cases) => setData({ test_cases })}
        create={newTestCase}
        addLabel="Test case"
        itemTitle={(t, i) => (
          <span className="flex items-center gap-3">
            <span className="max-w-[9rem] shrink-0 truncate font-mono text-xs text-ink-muted">{t.ref || `#${i + 1}`}</span>
            <span className="truncate text-ink">{t.title || "Untitled test case"}</span>
            <OutcomeBadge value={t.status} />
          </span>
        )}
        renderItem={(t, update) => (
          <>
            <TextField label="Reference" value={t.ref} onChange={(ref) => update({ ref })} />
            <SelectField
              label="Status"
              value={t.status}
              options={opts(TEST_CASE_STATUSES, labels.tc)}
              onChange={(v) => update({ status: v || "not_run" })}
            />
            <TextField label="Title" value={t.title} onChange={(title) => update({ title })} className="sm:col-span-2" />
            <LinesField label="Steps" value={t.steps} onChange={(steps) => update({ steps })} className="sm:col-span-2" />
            <TextArea label="Expected result" value={t.expected_result} onChange={(v) => update({ expected_result: v })} />
            <TextArea label="Actual result" value={t.actual_result} onChange={(v) => update({ actual_result: v })} />
            <RefsField label="Requirement refs" value={t.requirement_refs} onChange={(v) => update({ requirement_refs: v })} />
            <TextField label="Executed on" type="date" value={t.executed_on ?? ""} onChange={(v) => update({ executed_on: v || null })} />
            <TextArea label="Notes" value={t.notes} onChange={(notes) => update({ notes })} className="sm:col-span-2" rows={2} />
          </>
        )}
      />

      <ListSection
        title="Bugs / defects"
        items={d.bugs}
        onChange={(bugs) => setData({ bugs })}
        create={newBug}
        addLabel="Bug"
        itemTitle={(b, i) => (
          <span className="flex items-center gap-3">
            <span className="max-w-[9rem] shrink-0 truncate font-mono text-xs text-ink-muted">{b.ref || `#${i + 1}`}</span>
            <span className="truncate text-ink">{b.title || "Untitled bug"}</span>
            <SeverityBadge severity={b.severity} />
          </span>
        )}
        renderItem={(b, update) => (
          <>
            <TextField label="Reference" value={b.ref} onChange={(ref) => update({ ref })} />
            <TextField label="Title" value={b.title} onChange={(title) => update({ title })} />
            <SelectField
              label="Severity"
              value={b.severity ?? ""}
              options={[{ value: "", label: "Unrated" }, ...opts(BUG_SEVERITIES, labels.sev)]}
              onChange={(v) => update({ severity: v || null })}
            />
            <SelectField
              label="Status"
              value={b.status}
              options={opts(BUG_STATUSES, labels.bug)}
              onChange={(v) => update({ status: v || "open" })}
            />
            <TextArea label="Description" value={b.description} onChange={(description) => update({ description })} className="sm:col-span-2" />
            <LinesField
              label="Steps to reproduce"
              value={b.steps_to_reproduce}
              onChange={(v) => update({ steps_to_reproduce: v })}
              className="sm:col-span-2"
            />
            <RefsField label="Related test cases" value={b.test_case_refs} onChange={(v) => update({ test_case_refs: v })} />
            <TextField label="Found on" type="date" value={b.found_on ?? ""} onChange={(v) => update({ found_on: v || null })} />
          </>
        )}
      />

      <ListSection
        title="Retests"
        description="One entry per re-execution after a fix"
        items={d.retests}
        onChange={(retests) => setData({ retests })}
        create={newRetest}
        addLabel="Retest"
        itemTitle={(r, i) => (
          <span className="flex items-center gap-3">
            <span className="max-w-[9rem] shrink-0 truncate font-mono text-xs text-ink-muted">#{i + 1}</span>
            <span className="truncate text-ink-secondary">
              {[r.bug_ref, r.test_case_ref].filter(Boolean).join(" · ") || "Retest"}
            </span>
            <OutcomeBadge value={r.result} />
          </span>
        )}
        renderItem={(r, update) => (
          <>
            <TextField label="Bug ref" value={r.bug_ref ?? ""} onChange={(v) => update({ bug_ref: v || null })} />
            <TextField label="Test case ref" value={r.test_case_ref ?? ""} onChange={(v) => update({ test_case_ref: v || null })} />
            <TextField label="Date" type="date" value={r.date ?? ""} onChange={(v) => update({ date: v || null })} />
            <SelectField
              label="Result"
              value={r.result}
              options={opts(RETEST_RESULTS, labels.retest)}
              onChange={(v) => update({ result: v || "pending" })}
            />
            <TextArea label="Notes" value={r.notes} onChange={(notes) => update({ notes })} className="sm:col-span-2" rows={2} />
          </>
        )}
      />

      <ListSection
        title="Requirements"
        items={d.requirements}
        onChange={(requirements) => setData({ requirements })}
        create={() => ({ ref: "", text: "" })}
        addLabel="Requirement"
        itemTitle={(r, i) => (
          <span className="flex items-center gap-3">
            <span className="max-w-[9rem] shrink-0 truncate font-mono text-xs text-ink-muted">{r.ref || `#${i + 1}`}</span>
            <span className="truncate text-ink">{r.text || "Empty requirement"}</span>
          </span>
        )}
        renderItem={(r, update) => (
          <>
            <TextField label="Reference" value={r.ref} onChange={(ref) => update({ ref })} />
            <TextArea label="Requirement" value={r.text} onChange={(text) => update({ text })} className="sm:col-span-2" />
          </>
        )}
      />

      <ListSection
        title="Evidence"
        description="Screenshots or attachments in the report (the original document is kept)"
        items={d.evidence}
        onChange={(evidence) => setData({ evidence })}
        create={() => ({ description: "", location: "" })}
        addLabel="Evidence"
        itemTitle={(e, i) => <span className="truncate text-ink">{e.description || `Evidence #${i + 1}`}</span>}
        renderItem={(e, update) => (
          <>
            <TextField label="Location in report" value={e.location} onChange={(location) => update({ location })} />
            <TextArea label="Description" value={e.description} onChange={(description) => update({ description })} className="sm:col-span-2" />
          </>
        )}
      />

      <ListSection
        title="Additional fields"
        description="Short labelled values (e.g. Tester, Release)"
        items={customFields}
        onChange={setCustomFields}
        create={() => ({ key: "", value: "" })}
        addLabel="Field"
        defaultOpen
        itemTitle={(f) => <span className="truncate text-ink">{f.key || "New field"}</span>}
        renderItem={(f, update) => (
          <>
            <TextField label="Name" value={f.key} onChange={(key) => update({ key })} />
            <TextField label="Value" value={f.value} onChange={(value) => update({ value })} />
          </>
        )}
      />

      <ListSection
        title="Additional sections"
        description="Any other report content, e.g. Notes, Business Impact, Limitations"
        items={d.custom_sections}
        onChange={(custom_sections) => setData({ custom_sections })}
        create={() => ({ heading: "", content: "" })}
        addLabel="Section"
        itemTitle={(s) => <span className="truncate text-ink">{s.heading || "New section"}</span>}
        renderItem={(s, update) => (
          <>
            <TextField label="Heading" value={s.heading} onChange={(heading) => update({ heading })} className="sm:col-span-2" />
            <TextArea label="Content" value={s.content} onChange={(content) => update({ content })} className="sm:col-span-2" rows={5} />
          </>
        )}
      />

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-line bg-page/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Link
          href={cancelHref}
          aria-disabled={pending || undefined}
          tabIndex={pending ? -1 : undefined}
          className={buttonClass("ghost", undefined, cn(pending && "pointer-events-none opacity-50"))}
        >
          Cancel
        </Link>
        <LoadingButton type="submit" pending={pending} pendingLabel={pendingLabel} className={buttonClass("primary")}>
          {submitLabel}
        </LoadingButton>
      </div>
    </form>
  );
}
