import { describe, expect, it } from "vitest";
import { isAllowedEmail } from "./domain";

describe("isAllowedEmail", () => {
  it.each([
    ["abdullah@gosaas.ai", true],
    ["  Abdullah.Butt@GoSaaS.AI ", true],
    ["someone@gmail.com", false],
    ["someone@gosaas.ai.evil.com", false],
    ["someone@sub.gosaas.ai", false],
    ["gosaas.ai", false],
    ["@gosaas.ai", false],
  ])("%s -> %s", (email, expected) => {
    expect(isAllowedEmail(email, "gosaas.ai")).toBe(expected);
  });
});
