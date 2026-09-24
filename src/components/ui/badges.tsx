import { cn } from "@/lib/cn";
import type { BugSeverity, BugStatus, QaStatus, RetestResult, TestCaseStatus } from "@/types/qa";

const base = "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

const QA_STATUS: Record<QaStatus, { label: string; className: string }> = {
  assigned: { label: "Assigned", className: "bg-surface-muted text-ink-secondary" },
  in_progress: { label: "In progress", className: "bg-accent-soft text-accent" },
  qa_completed: { label: "QA completed", className: "bg-good-soft text-good" },
};

export function QaStatusBadge({ status }: { status: QaStatus }) {
  const s = QA_STATUS[status];
  return <span className={cn(base, s.className)}>{s.label}</span>;
}

const OUTCOME: Record<TestCaseStatus | RetestResult, { label: string; icon: string; className: string }> = {
  pass: { label: "Pass", icon: "✓", className: "bg-good-soft text-good" },
  fail: { label: "Fail", icon: "✕", className: "bg-bad-soft text-bad" },
  blocked: { label: "Blocked", icon: "■", className: "bg-warn-soft text-warn-ink" },
  not_run: { label: "Not run", icon: "–", className: "bg-surface-muted text-ink-muted" },
  pending: { label: "Pending", icon: "…", className: "bg-surface-muted text-ink-muted" },
};

// Outcome always shows icon + label, never color alone.
export function OutcomeBadge({ value }: { value: TestCaseStatus | RetestResult }) {
  const s = OUTCOME[value];
  return (
    <span className={cn(base, s.className)}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}

export const SEVERITY_META: Record<BugSeverity, { label: string; dot: string }> = {
  critical: { label: "Critical", dot: "bg-sev-critical" },
  high: { label: "High", dot: "bg-sev-high" },
  medium: { label: "Medium", dot: "bg-sev-medium" },
  low: { label: "Low", dot: "bg-sev-low" },
};

export function SeverityBadge({ severity }: { severity: BugSeverity | null }) {
  if (!severity) return <span className={cn(base, "bg-surface-muted text-ink-muted")}>Unrated</span>;
  const s = SEVERITY_META[severity];
  return (
    <span className={cn(base, "border border-line bg-surface text-ink")}>
      <span aria-hidden className={cn("size-2 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

const BUG_STATUS_LABEL: Record<BugStatus, string> = {
  open: "Open",
  fixed: "Fixed",
  closed: "Closed",
  wont_fix: "Won't fix",
};

export function BugStatusBadge({ status }: { status: BugStatus }) {
  return (
    <span className={cn(base, status === "open" ? "bg-warn-soft text-warn-ink" : "bg-surface-muted text-ink-secondary")}>
      {BUG_STATUS_LABEL[status]}
    </span>
  );
}
