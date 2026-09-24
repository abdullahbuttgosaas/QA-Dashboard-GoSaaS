import "server-only";
import { GoogleGenAI, createPartFromUri, type Part } from "@google/genai";
import { serverEnv } from "@/lib/env";
import { aiExtractionJsonSchema } from "./schema";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from "./prompt";
import type { ExtractionOutput, ExtractionProvider, PreparedDocument } from "./provider";

// Inline request payloads are capped (~20 MB); larger PDFs go through the Files API.
const INLINE_LIMIT_BYTES = 18 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 240_000;

export class GeminiExtractionProvider implements ExtractionProvider {
  readonly name = "gemini";
  private readonly ai = new GoogleGenAI({ apiKey: serverEnv.geminiApiKey() });
  private readonly model = serverEnv.geminiModel();

  async extract(document: PreparedDocument): Promise<ExtractionOutput> {
    const { parts, cleanup } = await this.toParts(document);
    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: [{ role: "user", parts: [...parts, { text: EXTRACTION_USER_PROMPT }] }],
        config: {
          systemInstruction: EXTRACTION_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseJsonSchema: aiExtractionJsonSchema(),
          temperature: 0.1,
          httpOptions: { timeout: REQUEST_TIMEOUT_MS },
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
      return { raw, model: response.modelVersion ?? this.model };
    } finally {
      await cleanup();
    }
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
