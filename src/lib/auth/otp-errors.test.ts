import { describe, expect, it } from "vitest";
import { describeSendError, describeVerifyError, normalizeOtp } from "./otp-errors";

describe("describeSendError", () => {
  it("recognises the per-email cooldown and extracts the wait", () => {
    const info = describeSendError({ status: 429, code: "over_email_send_rate_limit", message: "For security purposes, you can only request this after 42 seconds." });
    expect(info.retryAfterSeconds).toBe(42);
    expect(info.message).toMatch(/42 seconds/);
    expect(info.canEnterExistingCode).toBe(true);
  });

  it("recognises the project-wide hourly email cap", () => {
    const info = describeSendError({ status: 429, code: "over_email_send_rate_limit", message: "Email rate limit exceeded" });
    expect(info.retryAfterSeconds).toBeUndefined();
    expect(info.message).toMatch(/limit for this hour/);
    expect(info.canEnterExistingCode).toBe(true);
  });

  it("recognises per-IP request limits", () => {
    expect(describeSendError({ status: 429, code: "over_request_rate_limit", message: "Request rate limit reached" }).message).toMatch(/this network/);
  });

  it("passes through the domain restriction message", () => {
    const info = describeSendError({ status: 403, message: "Only @gosaas.ai accounts can sign in." });
    expect(info.message).toBe("Only @gosaas.ai accounts can sign in.");
    expect(info.canEnterExistingCode).toBe(false);
  });
});

describe("describeVerifyError", () => {
  it("explains expired or wrong codes", () => {
    expect(describeVerifyError({ status: 403, code: "otp_expired", message: "Token has expired or is invalid" })).toMatch(/invalid or has expired/);
  });
});

describe("normalizeOtp", () => {
  it.each([
    ["12345678", "12345678"],
    [" 123 456 ", "123456"],
    ["12345", null],
    ["12345678901", null],
    ["12ab5678", null],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeOtp(input)).toBe(expected);
  });
});
