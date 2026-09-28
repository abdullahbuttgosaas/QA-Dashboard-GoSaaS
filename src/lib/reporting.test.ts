import { describe, expect, it } from "vitest";
import {
  parsePeriod,
  periodValue,
  clampBack,
  clampWeeks,
  periodAnchorDate,
  periodTitle,
  summarizePeriod,
  weekBucketLabel,
  type WeekBucket,
} from "./reporting";

// Buckets exactly as qa_metrics_by_week returns them for 2026-09-25 (Friday) with p_count = 4.
function week(week_index: number, week_start: string, week_end: string, executed: number, passed: number, failed: number): WeekBucket {
  return {
    week_index,
    week_start,
    week_end,
    tickets_assigned: 0,
    tickets_completed: 1,
    test_cases_executed: executed,
    test_cases_passed: passed,
    test_cases_failed: failed,
    test_cases_blocked: 0,
    bugs_total: 0,
    bugs_critical: 0,
    bugs_high: 0,
    bugs_medium: 0,
    bugs_low: 0,
    retests_total: 0,
    retests_passed: 0,
    retests_failed: 0,
    retests_pending: 0,
  };
}

const fourWeeks = [
  week(0, "2026-08-31", "2026-09-04", 1, 1, 0),
  week(1, "2026-09-07", "2026-09-11", 2, 1, 1),
  week(2, "2026-09-14", "2026-09-18", 3, 3, 0),
  week(3, "2026-09-21", "2026-09-25", 4, 2, 2),
];

describe("summarizePeriod (2 weeks, today = Fri 2026-09-25)", () => {
  const p = summarizePeriod(fourWeeks, 2);

  it("current period is Mon Sep 14 - Fri Sep 25 (previous + current calendar week)", () => {
    expect(p.start).toBe("2026-09-14");
    expect(p.end).toBe("2026-09-25");
    expect(p.currentWeeks.map((w) => [w.week_start, w.week_end])).toEqual([
      ["2026-09-14", "2026-09-18"],
      ["2026-09-21", "2026-09-25"],
    ]);
  });

  it("sums the current weeks and compares with Aug 31 - Sep 11", () => {
    expect(p.current.test_cases_executed).toBe(7);
    expect(p.current.test_cases_passed).toBe(5);
    expect(p.current.tickets_completed).toBe(2);
    expect(p.previous?.test_cases_executed).toBe(3);
    expect(p.previous?.test_cases_failed).toBe(1);
  });

  it("works regardless of input order", () => {
    expect(summarizePeriod([...fourWeeks].reverse(), 2).start).toBe("2026-09-14");
  });
});

describe("summarizePeriod with other configurations", () => {
  it("1 week: current = Sep 21-25, previous = Sep 14-18", () => {
    const p = summarizePeriod(fourWeeks.slice(2), 1);
    expect([p.start, p.end]).toEqual(["2026-09-21", "2026-09-25"]);
    expect(p.currentWeeks).toHaveLength(1);
    expect(p.previous?.test_cases_executed).toBe(3);
  });

  it("4 weeks: 4 Monday-Friday buckets, no comparison data when only 4 weeks are given", () => {
    const p = summarizePeriod(fourWeeks, 4);
    expect(p.currentWeeks).toHaveLength(4);
    expect([p.start, p.end]).toEqual(["2026-08-31", "2026-09-25"]);
    expect(p.previous).toBeNull();
    expect(p.current.test_cases_executed).toBe(10);
  });
});

describe("labels", () => {
  it("names trend buckets by configuration", () => {
    expect(weekBucketLabel(0, 1)).toBe("Current week");
    expect([0, 1].map((i) => weekBucketLabel(i, 2))).toEqual(["Previous week", "Current week"]);
    expect([0, 1, 2, 3].map((i) => weekBucketLabel(i, 4))).toEqual(["Week 1", "Week 2", "Week 3", "Week 4"]);
  });

  it("titles the period in weeks, never days", () => {
    expect(periodTitle(2, 0)).toBe("Last 2 weeks");
    expect(periodTitle(1, 0)).toBe("This week");
    expect(periodTitle(4, 1)).toBe("Earlier 4-week period");
    expect(periodTitle(2, 0)).not.toMatch(/day/i);
  });
});

describe("navigation and input guards", () => {
  it("shifts the anchor date back by whole periods", () => {
    expect(periodAnchorDate("2026-09-25", 2, 0)).toBe("2026-09-25");
    expect(periodAnchorDate("2026-09-25", 2, 1)).toBe("2026-09-11"); // previous 2-week period ends Fri Sep 11
    expect(periodAnchorDate("2026-09-25", 4, 1)).toBe("2026-08-28");
  });

  it("clamps weeks and back", () => {
    expect(clampWeeks("4")).toBe(4);
    expect(clampWeeks(0)).toBe(2);
    expect(clampWeeks(99)).toBe(12);
    expect(clampWeeks("abc")).toBe(2);
    expect(clampBack("-3")).toBe(0);
    expect(clampBack("2")).toBe(2);
    expect(clampBack(999)).toBe(52);
  });
});

describe("parsePeriod (dashboard ?period= filter)", () => {
  it("defaults to the saved/default weeks when absent or invalid", () => {
    expect(parsePeriod(undefined, 2)).toEqual({ kind: "weeks", weeks: 2 });
    expect(parsePeriod("", 4)).toEqual({ kind: "weeks", weeks: 4 });
    expect(parsePeriod("13", 2)).toEqual({ kind: "weeks", weeks: 2 });
    expect(parsePeriod("0", 3)).toEqual({ kind: "weeks", weeks: 3 });
    expect(parsePeriod("2.5", 2)).toEqual({ kind: "weeks", weeks: 2 });
  });
  it("accepts 1..12 weeks and lifetime", () => {
    expect(parsePeriod("1", 2)).toEqual({ kind: "weeks", weeks: 1 });
    expect(parsePeriod("12", 2)).toEqual({ kind: "weeks", weeks: 12 });
    expect(parsePeriod("lifetime", 2)).toEqual({ kind: "lifetime" });
    expect(parsePeriod("LIFETIME", 2)).toEqual({ kind: "lifetime" });
  });
  it("round-trips to the URL value", () => {
    expect(periodValue({ kind: "lifetime" })).toBe("lifetime");
    expect(periodValue({ kind: "weeks", weeks: 3 })).toBe("3");
  });
});
