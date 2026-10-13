import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@google/genai";
import { GEMINI_BACKUP_MODEL } from "@/lib/env";

const generateContent = vi.fn();

vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  return {
    ...actual,
    GoogleGenAI: class {
      models = { generateContent };
      files = { upload: vi.fn(), delete: vi.fn() };
    },
  };
});

const ok = (model: string) => ({ text: '{"ticket":{}}', modelVersion: model });
const apiError = (status: number) => new ApiError({ status, message: `HTTP ${status}` });
const doc = { kind: "text" as const, text: "report" };

async function provider() {
  const { GeminiExtractionProvider } = await import("./gemini");
  return new GeminiExtractionProvider();
}

describe("GeminiExtractionProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("GEMINI_API_KEY", "test-key-value");
    vi.stubEnv("GEMINI_MODEL", "primary");
    vi.stubEnv("GEMINI_FALLBACK_MODEL", "fallback");
    generateContent.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const run = async () => {
    const p = (await provider()).extract(doc);
    const settled = p.then(
      (v) => ({ ok: true as const, v }),
      (e: Error) => ({ ok: false as const, e }),
    );
    await vi.runAllTimersAsync();
    return settled;
  };

  const models = () => generateContent.mock.calls.map((c) => c[0].model);

  it("primary success: one call, no fallback", async () => {
    generateContent.mockResolvedValueOnce(ok("primary"));
    const r = await run();
    expect(r.ok && r.v.model).toBe("primary");
    expect(models()).toEqual(["primary"]);
  });

  it("retries a transient 503 on the primary model once", async () => {
    generateContent.mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce(ok("primary"));
    const r = await run();
    expect(r.ok && r.v.model).toBe("primary");
    expect(models()).toEqual(["primary", "primary"]);
  });

  it("primary transient failure -> configured fallback succeeds", async () => {
    generateContent.mockRejectedValueOnce(apiError(503)).mockRejectedValueOnce(apiError(504)).mockResolvedValueOnce(ok("fallback"));
    const r = await run();
    expect(r.ok && r.v.model).toBe("fallback");
    expect(models()).toEqual(["primary", "primary", "fallback"]);
  });

  it("primary and configured fallback overloaded -> built-in backup model succeeds (single attempt per fallback)", async () => {
    generateContent
      .mockRejectedValueOnce(apiError(503))
      .mockRejectedValueOnce(apiError(503))
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValueOnce(ok(GEMINI_BACKUP_MODEL));
    const r = await run();
    expect(r.ok && r.v.model).toBe(GEMINI_BACKUP_MODEL);
    expect(models()).toEqual(["primary", "primary", "fallback", GEMINI_BACKUP_MODEL]);
  });

  it("a 429 (per-model quota) moves on without retrying that model", async () => {
    generateContent.mockRejectedValueOnce(apiError(429)).mockResolvedValueOnce(ok("fallback"));
    const r = await run();
    expect(r.ok && r.v.model).toBe("fallback");
    expect(models()).toEqual(["primary", "fallback"]);
  });

  it("moves straight to the fallback when the model is retired (404) or times out", async () => {
    generateContent.mockRejectedValueOnce(apiError(404)).mockResolvedValueOnce(ok("fallback"));
    expect((await run()).ok).toBe(true);

    generateContent.mockReset();
    const abort = Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
    generateContent.mockRejectedValueOnce(abort).mockResolvedValueOnce(ok("fallback"));
    const r = await run();
    expect(r.ok && r.v.model).toBe("fallback");
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("every model failing: generic overload message, bounded attempts, no provider details", async () => {
    generateContent.mockRejectedValue(apiError(503));
    const r = await run();
    expect(!r.ok && r.e.message).toBe("The AI service is temporarily unavailable (high demand). Please retry shortly.");
    expect(!r.ok && r.e.message).not.toMatch(/primary|fallback|gemini|503/i);
    expect(models()).toEqual(["primary", "primary", "fallback", GEMINI_BACKUP_MODEL]);
  });

  it("permanent errors are not retried and do not fall back", async () => {
    for (const [err, message] of [
      [apiError(403), /API key/],
      [new ApiError({ status: 400, message: "API key not valid. Please pass a valid API key." }), /API key/],
      [apiError(400), /rejected the document/],
    ] as const) {
      generateContent.mockReset();
      generateContent.mockRejectedValueOnce(err);
      const r = await run();
      expect(!r.ok && r.e.message).toMatch(message);
      expect(generateContent).toHaveBeenCalledTimes(1);
    }
  });

  it("without GEMINI_FALLBACK_MODEL: primary, then the built-in backup only once", async () => {
    vi.stubEnv("GEMINI_FALLBACK_MODEL", "");
    generateContent.mockRejectedValue(apiError(503));
    await run();
    expect(models()).toEqual(["primary", "primary", GEMINI_BACKUP_MODEL]);
  });

  it('GEMINI_FALLBACK_MODEL="none" disables every fallback', async () => {
    vi.stubEnv("GEMINI_FALLBACK_MODEL", "none");
    generateContent.mockRejectedValue(apiError(503));
    await run();
    expect(models()).toEqual(["primary", "primary"]);
  });

  it("server logs name the model and status but never the API key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    generateContent.mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce(ok("primary"));
    await run();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("primary attempt 1 failed: HTTP 503"));
    expect(warn.mock.calls.flat().join(" ")).not.toContain("test-key-value");
    warn.mockRestore();
  });
});
