import { describe, expect, it } from "vitest";
import { withDownloadName } from "./documents";

// Shape of a storage-js signed URL (base already passed through encodeURI; token is base64url).
const SIGNED = "https://tskkomwvqrosyvdcrzzr.supabase.co/storage/v1/object/sign/qa-reports/owner/doc/CHG0045893%20-%20Break%20Fix%20QA%20(1).docx?token=eyJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ4In0.sig-_x";

describe("withDownloadName (download filename encoded exactly once)", () => {
  it.each(["CHG0045893 - Break Fix QA (1).docx", "CHG0046926 - QA Report.docx", "Résumé & notes #2 [final].pdf"])(
    "round-trips %s exactly",
    (name) => {
      const url = withDownloadName(SIGNED, name);
      expect(new URL(url).searchParams.get("download")).toBe(name); // what storage decodes and puts in Content-Disposition
      expect(url).not.toMatch(/%25/); // no double encoding (e.g. %2528 / %2529)
    },
  );

  it("keeps the signed token and path untouched", () => {
    const url = new URL(withDownloadName(SIGNED, "CHG0045893 - Break Fix QA (1).docx"));
    const original = new URL(SIGNED);
    expect(url.pathname).toBe(original.pathname);
    expect(url.searchParams.get("token")).toBe(original.searchParams.get("token"));
  });
});
