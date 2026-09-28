"use client";

import { useId, useState } from "react";

export type TrendSeries = { key: string; label: string; color: string; values: Array<number | null> };
export type TrendPeriod = { label: string; range: string };

type Props = {
  title: string;
  description?: string;
  periods: TrendPeriod[];
  series: TrendSeries[];
  kind: "columns" | "line";
  format?: "count" | "percent";
};

const W = 520;
const H = 200;
const PAD = { top: 12, right: 12, bottom: 26, left: 36 };
const BAR_MAX = 24;

// Axis max split into 4 whole-number steps from a nice-number sequence (counts never get fractional ticks).
function niceMax(max: number): number {
  const raw = Math.max(max, 1) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 3, 4, 5, 10].map((m) => m * pow).find((c) => c >= raw && Number.isInteger(c)) ?? Math.ceil(raw);
  return Math.max(step, 1) * 4;
}

function fmt(v: number | null, format: Props["format"]) {
  if (v === null) return "—";
  return format === "percent" ? `${Math.round(v * 100)}%` : v.toLocaleString("en-US");
}

// Small, dependency-free trend chart. Single y-axis; stacked columns or a single line.
// Hover/focus shows every series for the period; the table view exposes all values.
export function TrendChart({ title, description, periods, series, kind, format = "count" }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const id = useId();
  const n = periods.length;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(n, 1);

  const totals = periods.map((_, i) => series.reduce((s, ser) => s + (ser.values[i] ?? 0), 0));
  const rawMax = kind === "columns" ? Math.max(0, ...totals) : Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const yMax = format === "percent" ? 1 : niceMax(rawMax);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;
  const cx = (i: number) => PAD.left + slot * i + slot / 2;
  const barW = Math.min(BAR_MAX, slot * 0.6);
  const labelEvery = Math.max(1, Math.ceil(n / 8));
  const latest = n - 1;

  return (
    <figure className="flex flex-col">
      <figcaption className="mb-2">
        <div className="text-sm font-semibold text-ink">{title}</div>
        {description && <div className="text-xs text-ink-muted">{description}</div>}
      </figcaption>

      {series.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-secondary">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-labelledby={`${id}-desc`}>
          <desc id={`${id}-desc`}>{`${title}. Values are listed in the data table below the chart.`}</desc>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="tabular fill-ink-muted text-[10px]">
                {format === "percent" ? `${Math.round(t * 100)}%` : t.toLocaleString("en-US")}
              </text>
            </g>
          ))}
          <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--chart-axis)" strokeWidth={1} />

          {active !== null && kind === "line" && (
            <line x1={cx(active)} x2={cx(active)} y1={PAD.top} y2={y(0)} stroke="var(--chart-axis)" strokeWidth={1} />
          )}

          {kind === "columns" &&
            periods.map((_, i) => {
              let acc = 0;
              const segments = series
                .map((s) => ({ s, v: s.values[i] ?? 0 }))
                .filter((seg) => seg.v > 0);
              return (
                <g key={i} opacity={active === null || active === i ? 1 : 0.55}>
                  {segments.map(({ s, v }, j) => {
                    const top = y(acc + v);
                    const bottom = y(acc);
                    acc += v;
                    const isTop = j === segments.length - 1;
                    // 2px surface gap between stacked segments; rounded data-end on the top segment only.
                    const h = Math.max(bottom - top - (j > 0 ? 2 : 0), 1);
                    const x = cx(i) - barW / 2;
                    const r = isTop ? Math.min(4, h) : 0;
                    return (
                      <path
                        key={s.key}
                        fill={s.color}
                        d={`M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`}
                      />
                    );
                  })}
                </g>
              );
            })}

          {kind === "line" &&
            series.map((s) => {
              const pts = s.values.map((v, i) => (v === null ? null : ([cx(i), y(v)] as const)));
              // Break the line at missing values rather than drawing through them.
              const d = pts.reduce((path, p, i) => {
                if (!p) return path;
                return `${path}${pts[i - 1] ? "L" : "M"}${p[0]},${p[1]} `;
              }, "");
              return (
                <g key={s.key}>
                  <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {pts.map((p, i) =>
                    p && (i === latest || i === active || !pts[i - 1] || !pts[i + 1]) ? (
                      <circle key={i} cx={p[0]} cy={p[1]} r={4} fill={s.color} stroke="var(--chart-surface)" strokeWidth={2} />
                    ) : null,
                  )}
                </g>
              );
            })}

          {periods.map((p, i) =>
            i % labelEvery === (latest % labelEvery) ? (
              <text key={i} x={cx(i)} y={H - 8} textAnchor="middle" className="fill-ink-muted text-[10px]">
                {p.label}
              </text>
            ) : null,
          )}

          {periods.map((p, i) => (
            <rect
              key={i}
              x={PAD.left + slot * i}
              y={PAD.top}
              width={slot}
              height={innerH}
              fill="transparent"
              tabIndex={0}
              aria-label={`${p.range}: ${series.map((s) => `${s.label} ${fmt(s.values[i], format)}`).join(", ")}`}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="outline-none"
            />
          ))}
        </svg>

        {active !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${(cx(active) / W) * 100}%`,
              transform: active > n / 2 ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
            }}
          >
            <div className="mb-1 font-medium text-ink">{periods[active].range}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-4 text-ink-secondary">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-sm" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="tabular font-medium text-ink">{fmt(s.values[active], format)}</span>
              </div>
            ))}
            {kind === "columns" && series.length > 1 && (
              <div className="mt-1 flex justify-between gap-4 border-t border-line pt-1 text-ink-secondary">
                <span>Total</span>
                <span className="tabular font-medium text-ink">{fmt(totals[active], format)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <details className="mt-1 text-xs">
        <summary className="cursor-pointer text-ink-muted hover:text-ink">View data</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="tabular w-full text-left">
            <thead className="text-ink-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">Period</th>
                {series.map((s) => (
                  <th key={s.key} className="py-1 pr-3 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-ink-secondary">
              {periods.map((p, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1 pr-3">{p.range}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1 pr-3 text-right">
                      {fmt(s.values[i], format)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
