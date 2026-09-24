import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@google/genai";

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
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.stubEnv("GEMINI_MODEL", "primary");
    vi.stubEnv("GEMINI_FALLBACK_MODEL", "fallback");
    generateContent.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
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

  it("retries transient 503s on the primary model", async () => {
    generateContent.mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce(ok("primary"));
    const r = await run();
    expect(r.ok && r.v.model).toBe("primary");
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("falls back to the second model after repeated overload", async () => {
    generateContent
      .mockRejectedValueOnce(apiError(503))
      .mockRejectedValueOnce(apiError(503))
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValueOnce(ok("fallback"));
    const r = await run();
    expect(r.ok && r.v.model).toBe("fallback");
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual(["primary", "primary", "primary", "fallback"]);
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

  it("does not retry fatal errors and reports them readably", async () => {
    generateContent.mockRejectedValueOnce(apiError(403));
    const r = await run();
    expect(r.ok).toBe(false);
    expect(!r.ok && r.e.message).toMatch(/API key/);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("reports overload readably when every model fails", async () => {
    generateContent.mockRejectedValue(apiError(503));
    const r = await run();
    expect(!r.ok && r.e.message).toMatch(/temporarily unavailable/);
    expect(generateContent).toHaveBeenCalledTimes(6);
  });
});
