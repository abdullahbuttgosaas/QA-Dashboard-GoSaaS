import "server-only";
import mammoth from "mammoth";
import type { PreparedDocument } from "./provider";

const MAX_IMAGES = 40;
const MAX_IMAGE_BYTES_TOTAL = 15 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Convert an uploaded report into a form an AI provider can read.
// PDFs are passed through (images included); Word documents become HTML plus their embedded
// images (screenshots) as separate labelled attachments so the model can still see them.
export async function prepareDocument(bytes: Buffer, mimeType: string): Promise<PreparedDocument> {
  if (mimeType === "application/pdf") {
    return { kind: "pdf", mimeType: "application/pdf", bytes };
  }

  if (mimeType === DOCX) {
    const images: Array<{ label: string; mimeType: string; bytes: Buffer }> = [];
    let totalImageBytes = 0;
    let imageCount = 0;

    const result = await mammoth.convertToHtml(
      { buffer: bytes },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          imageCount += 1;
          const label = `Image ${imageCount}`;
          if (images.length < MAX_IMAGES && SUPPORTED_IMAGE_TYPES.has(image.contentType)) {
            const data = await image.readAsBuffer();
            if (totalImageBytes + data.length <= MAX_IMAGE_BYTES_TOTAL) {
              totalImageBytes += data.length;
              images.push({ label, mimeType: image.contentType, bytes: data });
            }
          }
          return { src: `#${label.replace(" ", "-").toLowerCase()}`, alt: label };
        }),
      },
    );

    // Make image positions visible in the text stream.
    const html = result.value.replace(/<img [^>]*alt="(Image \d+)"[^>]*\/?>/g, "[$1]");
    return { kind: "html", html, images };
  }

  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    return { kind: "text", text: bytes.toString("utf8") };
  }

  throw new Error(`Unsupported document type: ${mimeType}`);
}
