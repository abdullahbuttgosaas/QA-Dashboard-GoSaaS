import { describe, expect, it } from "vitest";
import { passRate } from "./metrics";

describe("passRate", () => {
  it("is passed / (passed + failed), excluding blocked and not-run", () => {
    expect(passRate(3, 1)).toBe(0.75);
    expect(passRate(0, 2)).toBe(0);
  });
  it("is null when nothing passed or failed", () => {
    expect(passRate(0, 0)).toBeNull();
  });
});
