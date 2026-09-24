// Provider-agnostic contract so other AI providers can be added without touching the workflow.

export type PreparedDocument =
  | { kind: "pdf"; mimeType: "application/pdf"; bytes: Buffer }
  | { kind: "html"; html: string; images: Array<{ label: string; mimeType: string; bytes: Buffer }> }
  | { kind: "text"; text: string };

export type ExtractionOutput = {
  raw: unknown; // parsed JSON from the model, normalized later
  model: string;
};

export interface ExtractionProvider {
  readonly name: string;
  extract(document: PreparedDocument): Promise<ExtractionOutput>;
}
