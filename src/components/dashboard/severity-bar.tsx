import { SEVERITY_META } from "@/components/ui/badges";
import { BUG_SEVERITIES, type BugSeverity } from "@/types/qa";

// Stacked proportion bar + labelled counts (identity never relies on color alone).
export function SeverityBar({ counts }: { counts: Record<BugSeverity, number> }) {
  const total = BUG_SEVERITIES.reduce((s, k) => s + counts[k], 0);
  return (
    <div className="mt-2">
      {total > 0 && (
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {BUG_SEVERITIES.filter((k) => counts[k] > 0).map((k) => (
            <div key={k} className={SEVERITY_META[k].dot} style={{ flexGrow: counts[k] }} />
          ))}
        </div>
      )}
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
        {BUG_SEVERITIES.map((k) => (
          <div key={k} className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-1.5 text-ink-secondary">
              <span aria-hidden className={`size-2 rounded-full ${SEVERITY_META[k].dot}`} />
              {SEVERITY_META[k].label}
            </dt>
            <dd className="tabular font-medium text-ink">{counts[k]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
