import { describe, expect, it } from "vitest";
import { safeNextPath } from "./site";

describe("safeNextPath", () => {
  it("allows same-site relative paths", () => {
    expect(safeNextPath("/abdullah/upload")).toBe("/abdullah/upload");
  });
  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "abdullah", "", null])("rejects %s", (value) => {
    expect(safeNextPath(value)).toBeNull();
  });
});
