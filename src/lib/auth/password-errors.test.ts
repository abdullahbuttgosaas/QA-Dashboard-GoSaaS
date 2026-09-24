import { describe, expect, it } from "vitest";
import { describeSignInError, describeSignUpError, validateNewPassword } from "./password-errors";

describe("describeSignInError", () => {
  it("uses a generic message for wrong credentials", () => {
    expect(describeSignInError({ status: 400, code: "invalid_credentials", message: "Invalid login credentials" })).toBe(
      "Incorrect email or password.",
    );
  });
  it("explains unconfirmed accounts", () => {
    expect(describeSignInError({ status: 400, code: "email_not_confirmed", message: "Email not confirmed" })).toMatch(/not been activated/);
  });
  it("explains rate limiting", () => {
    expect(describeSignInError({ status: 429, code: "over_request_rate_limit" })).toMatch(/Too many/);
  });
});

describe("describeSignUpError", () => {
  it("passes through the domain restriction", () => {
    expect(describeSignUpError({ status: 403, message: "Only @gosaas.ai accounts can sign in." })).toBe("Only @gosaas.ai accounts can sign in.");
  });
  it("handles existing accounts and disabled signup", () => {
    expect(describeSignUpError({ code: "user_already_exists" })).toMatch(/already exists/);
    expect(describeSignUpError({ code: "signup_disabled" })).toMatch(/administrator/);
  });
});

describe("validateNewPassword", () => {
  it.each([
    ["short", "short", /at least 8/],
    ["long-enough-1", "different-2", /do not match/],
    ["x".repeat(73), "x".repeat(73), /at most 72/],
  ])("rejects %s", (p, c, msg) => {
    expect(validateNewPassword(p, c)).toMatch(msg);
  });
  it("accepts a valid matching password", () => {
    expect(validateNewPassword("correct-horse-9", "correct-horse-9")).toBeNull();
  });
});
