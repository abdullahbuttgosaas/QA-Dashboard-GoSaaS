import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prepareDocument } from "./prepare";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("prepareDocument", () => {
  it("converts Word reports to HTML and keeps embedded screenshots as labelled images", async () => {
    const bytes = readFileSync(new URL("../../test/sample-report.docx", import.meta.url));
    const prepared = await prepareDocument(bytes, DOCX);
    if (prepared.kind !== "html") throw new Error(`expected html, got ${prepared.kind}`);
    expect(prepared.html).toContain("CHG0045893");
    expect(prepared.html).toContain("Limitations");
    expect(prepared.html).toContain("[Image 1]");
    expect(prepared.images).toHaveLength(1);
    expect(prepared.images[0]).toMatchObject({ label: "Image 1", mimeType: "image/png" });
  });

  it("passes PDFs through unchanged", async () => {
    const bytes = Buffer.from("%PDF-1.4 test");
    const prepared = await prepareDocument(bytes, "application/pdf");
    expect(prepared).toMatchObject({ kind: "pdf", mimeType: "application/pdf" });
  });

  it("rejects unsupported types", async () => {
    await expect(prepareDocument(Buffer.from("x"), "application/zip")).rejects.toThrow(/Unsupported/);
  });
});
