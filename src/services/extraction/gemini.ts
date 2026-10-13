import "server-only";
import { ApiError, GoogleGenAI, createPartFromUri, type Part } from "@google/genai";
import { serverEnv } from "@/lib/env";
import { aiExtractionJsonSchema } from "./schema";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from "./prompt";
import type { ExtractionOutput, ExtractionProvider, PreparedDocument } from "./provider";

// Inline request payloads are capped (~20 MB); larger PDFs go through the Files API.
const INLINE_LIMIT_BYTES = 18 * 1024 * 1024;
// A single call normally takes 5-30s; cap each attempt so a stalled model cannot use the whole budget.
const ATTEMPT_TIMEOUT_MS = 100_000;
// Stay under the route's maxDuration (300s) including download/preparation time.
const TOTAL_BUDGET_MS = 250_000;
// Gemini returns 5xx under load ("model experiencing high demand"); usually transient, so the primary model gets one
// short retry. Other models get a single attempt each: under a demand spike, moving on beats waiting on the same model.
const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);
const PRIMARY_RETRY_DELAYS_MS = [2_000];

type Failure = "retry" | "next-model" | "fatal";

const invalidKey = (err: ApiError) => err.status === 400 && /API[ _]?key/i.test(err.message);

function classify(err: unknown): Failure {
  if (err instanceof ApiError) {
    if (RETRYABLE_STATUS.has(err.status)) return "retry";
    // 429 = this model's quota/rate limit (quotas are per model): retrying it right away does not help.
    // 404 = model retired or unavailable to this key.
    if (err.status === 429 || err.status === 404) return "next-model";
    return "fatal";
  }
  // Client-side timeout (AbortError) or network failure: the next model may respond.
  if (err instanceof Error && (err.name === "AbortError" || /aborted|timed? ?out|fetch failed/i.test(err.message))) {
    return "next-model";
  }
  return "fatal";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return "The AI service rate limit was reached. Please try again in a minute.";
    if (err.status >= 500) return "The AI service is temporarily unavailable (high demand). Please retry shortly.";
    if (err.status === 404) return "The configured AI model is not available. Check GEMINI_MODEL.";
    if (invalidKey(err)) return "The AI service rejected the API key. Check GEMINI_API_KEY.";
    if (err.status === 400) return "The AI service rejected the document. It may be too large or in an unsupported format.";
    if (err.status === 401 || err.status === 403) return "The AI service rejected the API key. Check GEMINI_API_KEY.";
    return `The AI service returned an error (HTTP ${err.status}).`;
  }
  if (classify(err) === "next-model") return "The AI service did not respond in time. Please retry.";
  return err instanceof Error ? err.message : "Extraction failed.";
}

export class GeminiExtractionProvider implements ExtractionProvider {
  readonly name = "gemini";
  private readonly ai = new GoogleGenAI({ apiKey: serverEnv.geminiApiKey() });
  // Primary model, then the configured fallback, then the built-in backup (duplicates removed).
  private readonly models = [serverEnv.geminiModel(), serverEnv.geminiFallbackModel(), serverEnv.geminiBackupModel()].filter(
    (m, i, all): m is string => !!m && all.indexOf(m) === i,
  );

  async extract(document: PreparedDocument): Promise<ExtractionOutput> {
    const deadline = Date.now() + TOTAL_BUDGET_MS;
    const { parts, cleanup } = await this.toParts(document);
    try {
      let lastError: unknown = new Error("No AI model is configured.");
      for (const [index, model] of this.models.entries()) {
        const retryDelays = index === 0 ? PRIMARY_RETRY_DELAYS_MS : [];
        for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
          const remaining = deadline - Date.now();
          if (remaining < 10_000) throw new Error(describeError(lastError));
          try {
            return await this.generate(model, parts, Math.min(ATTEMPT_TIMEOUT_MS, remaining));
          } catch (err) {
            lastError = err;
            const kind = classify(err);
            // Server-side diagnostics only (model + status, never the key or document); users see describeError().
            console.warn(`[extraction] ${model} attempt ${attempt + 1} failed: ${err instanceof ApiError ? `HTTP ${err.status}` : (err as Error)?.name ?? "error"} (${kind})`);
            if (kind === "fatal") throw new Error(describeError(err));
            if (kind === "next-model" || attempt === retryDelays.length) break;
            await sleep(retryDelays[attempt]);
          }
        }
      }
      throw new Error(describeError(lastError));
    } finally {
      await cleanup();
    }
  }

  private async generate(model: string, parts: Part[], timeoutMs: number): Promise<ExtractionOutput> {
    const response = await this.ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [...parts, { text: EXTRACTION_USER_PROMPT }] }],
      config: {
        systemInstruction: EXTRACTION_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: aiExtractionJsonSchema(),
        temperature: 0.1,
        httpOptions: { timeout: timeoutMs },
      },
    });

    const text = response.text;
    if (!text) {
      const reason = response.candidates?.[0]?.finishReason ?? "no content";
      throw new Error(`Gemini returned an empty response (${reason}).`);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error("Gemini returned invalid JSON.");
    }
    return { raw, model: response.modelVersion ?? model };
  }

  private async toParts(document: PreparedDocument): Promise<{ parts: Part[]; cleanup: () => Promise<void> }> {
    const noop = async () => {};
    switch (document.kind) {
      case "text":
        return { parts: [{ text: `QA REPORT:\n\n${document.text}` }], cleanup: noop };
      case "html":
        return {
          parts: [
            { text: `QA REPORT (converted from Word to HTML; embedded images are marked [Image N]):\n\n${document.html}` },
            ...document.images.flatMap((img): Part[] => [
              { text: `[${img.label}]` },
              { inlineData: { mimeType: img.mimeType, data: img.bytes.toString("base64") } },
            ]),
          ],
          cleanup: noop,
        };
      case "pdf": {
        if (document.bytes.length <= INLINE_LIMIT_BYTES) {
          return {
            parts: [{ inlineData: { mimeType: document.mimeType, data: document.bytes.toString("base64") } }],
            cleanup: noop,
          };
        }
        const file = await this.ai.files.upload({
          file: new Blob([new Uint8Array(document.bytes)], { type: document.mimeType }),
          config: { mimeType: document.mimeType },
        });
        if (!file.uri || !file.name) throw new Error("Gemini file upload failed.");
        const name = file.name;
        return {
          parts: [createPartFromUri(file.uri, document.mimeType)],
          cleanup: async () => {
            await this.ai.files.delete({ name }).catch(() => {});
          },
        };
      }
    }
  }
}
