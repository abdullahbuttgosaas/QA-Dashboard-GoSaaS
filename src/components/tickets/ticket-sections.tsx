import type { ReactNode } from "react";
import { BugStatusBadge, OutcomeBadge, SeverityBadge } from "@/components/ui/badges";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import type { QaData } from "@/types/qa";

// Plain text with **bold** support only. Rendered as React nodes (never raw HTML), so report content cannot inject markup.
function Prose({ children }: { children: string }) {
  const parts = children.split(/(\*\*[^*\n]+\*\*)/g);
  return (
    <div className="min-w-0 text-sm leading-relaxed whitespace-pre-wrap text-ink-secondary wrap-anywhere">
      {parts.map((part, i) =>
        /^\*\*[^*\n]+\*\*$/.test(part) ? (
          <strong key={i} className="font-semibold text-ink">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        ),
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-ink-muted wrap-anywhere">{label}</div>
      <div className="mt-0.5 text-sm text-ink wrap-anywhere">{children}</div>
    </div>
  );
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="min-w-0 list-decimal space-y-0.5 pl-5 text-sm text-ink-secondary wrap-anywhere">
      {steps.map((s, i) => (
        <li key={i} className="whitespace-pre-wrap">
          {s}
        </li>
      ))}
    </ol>
  );
}

export function OverviewSection({ data }: { data: QaData }) {
  if (!data.summary && !data.environment) return null;
  return (
    <Card>
      <CardHeader title="Overview" />
      <div className="space-y-4 p-5">
        {data.summary && <Prose>{data.summary}</Prose>}
        {data.environment && <Field label="Environment">{data.environment}</Field>}
      </div>
    </Card>
  );
}

export function RequirementsSection({ data }: { data: QaData }) {
  if (!data.requirements.length) return null;
  return (
    <Card>
      <CardHeader title="Requirements" description={`${data.requirements.length} requirement(s)`} />
      <ul className="divide-y divide-line">
        {data.requirements.map((r, i) => (
          <li key={i} className="flex gap-4 px-5 py-3 text-sm">
            <span className="max-w-[10rem] shrink-0 truncate font-mono text-xs text-ink-muted">{r.ref || `#${i + 1}`}</span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap text-ink-secondary wrap-anywhere">{r.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function TestCasesSection({ data }: { data: QaData }) {
  const tcs = data.test_cases;
  return (
    <Card>
      <CardHeader title="Test cases" description={`${tcs.length} test case(s)`} />
      {tcs.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-muted">No test cases recorded.</p>
      ) : (
        <ul className="divide-y divide-line">
          {tcs.map((tc, i) => (
            <li key={i}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 hover:bg-surface-muted">
                  <span aria-hidden className="text-xs text-ink-muted transition-transform group-open:rotate-90">
                    ▶
                  </span>
                  <span className="max-w-[9rem] shrink-0 truncate font-mono text-xs text-ink-muted">{tc.ref || `#${i + 1}`}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{tc.title || "Untitled test case"}</span>
                  <OutcomeBadge value={tc.status} />
                </summary>
                <div className="grid gap-4 bg-surface-muted/50 px-5 pt-1 pb-4 pl-12 md:grid-cols-2">
                  {tc.steps.length > 0 && (
                    <div className="md:col-span-2">
                      <div className="mb-1 text-xs font-medium text-ink-muted">Steps</div>
                      <Steps steps={tc.steps} />
                    </div>
                  )}
                  <Field label="Expected result">
                    <span className="whitespace-pre-wrap">{tc.expected_result || "—"}</span>
                  </Field>
                  <Field label="Actual result">
                    <span className="whitespace-pre-wrap">{tc.actual_result || "—"}</span>
                  </Field>
                  {tc.requirement_refs.length > 0 && <Field label="Requirements">{tc.requirement_refs.join(", ")}</Field>}
                  {tc.executed_on && <Field label="Executed on">{formatDate(tc.executed_on)}</Field>}
                  {tc.notes && (
                    <div className="md:col-span-2">
                      <Field label="Notes">
                        <span className="whitespace-pre-wrap">{tc.notes}</span>
                      </Field>
                    </div>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function BugsSection({ data }: { data: QaData }) {
  const bugs = data.bugs;
  return (
    <Card>
      <CardHeader title="Bugs / defects" description={`${bugs.length} bug(s)`} />
      {bugs.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-muted">No bugs recorded.</p>
      ) : (
        <ul className="divide-y divide-line">
          {bugs.map((b, i) => (
            <li key={i} className="space-y-2 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-ink-muted">{b.ref || `#${i + 1}`}</span>
                <span className="text-sm font-medium text-ink">{b.title || "Untitled bug"}</span>
                <span className="ml-auto flex gap-2">
                  <SeverityBadge severity={b.severity} />
                  <BugStatusBadge status={b.status} />
                </span>
              </div>
              {b.description && <Prose>{b.description}</Prose>}
              {b.steps_to_reproduce.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-medium text-ink-muted">Steps to reproduce</div>
                  <Steps steps={b.steps_to_reproduce} />
                </div>
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-muted">
                {b.test_case_refs.length > 0 && <span>Test cases: {b.test_case_refs.join(", ")}</span>}
                {b.found_on && <span>Found {formatDate(b.found_on)}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function RetestsSection({ data }: { data: QaData }) {
  if (!data.retests.length) return null;
  return (
    <Card>
      <CardHeader title="Retests" description={`${data.retests.length} retest(s)`} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs text-ink-muted">
            <tr className="border-b border-line">
              <th className="px-5 py-2 font-medium">Bug</th>
              <th className="px-3 py-2 font-medium">Test case</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Result</th>
              <th className="px-5 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {data.retests.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="px-5 py-2.5 font-mono text-xs">{r.bug_ref || "—"}</td>
                <td className="px-3 py-2.5 font-mono text-xs">{r.test_case_ref || "—"}</td>
                <td className="px-3 py-2.5 text-ink-secondary">{formatDate(r.date)}</td>
                <td className="px-3 py-2.5">
                  <OutcomeBadge value={r.result} />
                </td>
                <td className="px-5 py-2.5 whitespace-pre-wrap text-ink-secondary">{r.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function EvidenceSection({ data }: { data: QaData }) {
  if (!data.evidence.length) return null;
  return (
    <Card>
      <CardHeader title="Evidence" description="Screenshots and attachments referenced in the QA report" />
      <ul className="divide-y divide-line">
        {data.evidence.map((e, i) => (
          <li key={i} className="flex min-w-0 flex-col gap-1 px-5 py-3 text-sm sm:flex-row sm:gap-4" data-evidence-item>
            <span className="shrink-0 text-xs text-ink-muted wrap-anywhere sm:w-24">{e.location || `#${i + 1}`}</span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap text-ink-secondary wrap-anywhere">{e.description}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function CustomSections({ data }: { data: QaData }) {
  const fields = Object.entries(data.custom_fields);
  return (
    <>
      {fields.length > 0 && (
        <Card>
          <CardHeader title="Additional fields" />
          <dl className="grid gap-4 p-5 sm:grid-cols-2">
            {fields.map(([k, v]) => (
              <Field key={k} label={k}>
                <span className="whitespace-pre-wrap">{v || "—"}</span>
              </Field>
            ))}
          </dl>
        </Card>
      )}
      {data.custom_sections.map((s, i) => (
        <Card key={i}>
          <CardHeader title={s.heading} />
          <div className="p-5">
            <Prose>{s.content}</Prose>
          </div>
        </Card>
      ))}
    </>
  );
}
