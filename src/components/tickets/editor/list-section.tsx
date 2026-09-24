"use client";

import { useState, type ReactNode } from "react";
import { buttonClass } from "@/components/ui/button";

type Props<T> = {
  title: string;
  description?: string;
  items: T[];
  onChange: (items: T[]) => void;
  create: () => T;
  addLabel: string;
  itemTitle: (item: T, index: number) => ReactNode;
  renderItem: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
  defaultOpen?: boolean;
};

// Generic repeatable-row editor used for test cases, bugs, retests, etc.
export function ListSection<T>({
  title,
  description,
  items,
  onChange,
  create,
  addLabel,
  itemTitle,
  renderItem,
  defaultOpen = false,
}: Props<T>) {
  const [justAdded, setJustAdded] = useState<number | null>(null);
  const update = (i: number, patch: Partial<T>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <section className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">
            {title} <span className="font-normal text-ink-muted">({items.length})</span>
          </h3>
          {description && <p className="text-xs text-ink-muted">{description}</p>}
        </div>
        <button type="button" onClick={() => {
            setJustAdded(items.length);
            onChange([...items, create()]);
          }} className={buttonClass("secondary", "sm")}>
          + {addLabel}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-muted">None.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item, i) => (
            <li key={i}>
              <details open={defaultOpen || i === justAdded || undefined} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-2.5 hover:bg-surface-muted">
                  <span aria-hidden className="text-xs text-ink-muted transition-transform group-open:rotate-90">
                    ▶
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{itemTitle(item, i)}</span>
                  <span className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
                    <button type="button" onClick={() => move(i, -1)} className={buttonClass("ghost", "sm", "px-2")} aria-label="Move up">
                      ↑
                    </button>
                    <button type="button" onClick={() => move(i, 1)} className={buttonClass("ghost", "sm", "px-2")} aria-label="Move down">
                      ↓
                    </button>
                    <button type="button" onClick={() => remove(i)} className={buttonClass("ghost", "sm", "px-2 text-bad")} aria-label="Remove">
                      Remove
                    </button>
                  </span>
                </summary>
                <div className="grid gap-3 px-5 pt-1 pb-4 sm:grid-cols-2">{renderItem(item, (p) => update(i, p), i)}</div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
