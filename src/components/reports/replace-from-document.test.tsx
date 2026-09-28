// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { QaRecordInputSchema } from "@/types/qa";
import { button, click, deferred, render, visibleLabel, type Rendered } from "@/test/dom";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const registerDocument = vi.fn();
vi.mock("@/app/actions/documents", () => ({ registerDocument: (...a: unknown[]) => registerDocument(...a), discardDocument: vi.fn() }));
const upload = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload: (...a: unknown[]) => upload(...a), remove: vi.fn() }) } }),
}));

let r: Rendered | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn() as typeof window.scrollTo;
});
afterEach(() => {
  r?.unmount();
  r = undefined;
  vi.unstubAllGlobals();
});

async function settle(fn: () => void) {
  await act(async () => {
    fn();
    await new Promise((res) => setTimeout(res, 0));
  });
}

describe("Upload & Extract into an existing ticket", () => {
  it("registers the upload against the ticket, then goes to the review", async () => {
    const { UploadForm } = await import("./upload-form");
    upload.mockResolvedValue({ error: null });
    registerDocument.mockResolvedValue({ ok: true });
    const extract = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => extract.promise));
    r = await render(
      <UploadForm ownerId="u1" accept={{ "text/plain": "TXT" }} maxBytes={1_000_000} replacesRecordId="rec-1" submitLabel="Upload & Extract" />,
    );
    const fileInput = r.container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, "files", { value: [new File(["x"], "report.txt", { type: "text/plain" })] });
    await act(async () => void fileInput.dispatchEvent(new Event("change", { bubbles: true })));

    const b = button(r.container, /Upload & Extract/);
    await click(b);
    await click(b);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(registerDocument).toHaveBeenCalledWith(expect.objectContaining({ replacesRecordId: "rec-1", fileName: "report.txt" }));
    expect(visibleLabel(b)).toBe("Extracting…");
    await settle(() => extract.resolve(new Response("{}")));
    expect(visibleLabel(b)).toBe("Preparing review…");
    expect(router.push).toHaveBeenCalledWith(expect.stringMatching(/^\/qa\/review\//));
  });

  it("standalone upload does not target a ticket", async () => {
    const { UploadForm } = await import("./upload-form");
    upload.mockResolvedValue({ error: null });
    registerDocument.mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
    r = await render(<UploadForm ownerId="u1" accept={{ "text/plain": "TXT" }} maxBytes={1_000_000} />);
    const fileInput = r.container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, "files", { value: [new File(["x"], "report.txt", { type: "text/plain" })] });
    await act(async () => void fileInput.dispatchEvent(new Event("change", { bubbles: true })));
    await settle(() => void button(r!.container, /Upload and extract/).click());
    expect(registerDocument.mock.calls[0][0].replacesRecordId).toBeUndefined();
  });

  it("replacement review: ticket number and Assigned date are read-only; Replace shows Replacing… and submits once", async () => {
    const { RecordEditor } = await import("@/components/tickets/editor/record-editor");
    const initial = QaRecordInputSchema.parse({ ticket_number: "CHG1", assigned_on: "2026-09-11", qa_status: "assigned", data: {} });
    const pending = deferred<{ ok: false; error: string }>();
    const onSubmit = vi.fn(() => pending.promise);
    r = await render(
      <RecordEditor
        initial={initial}
        locked={{ ticket_number: true, assigned_on: true }}
        submitLabel="Replace ticket data"
        pendingLabel="Replacing…"
        onSubmit={onSubmit}
        cancelHref="/qa/tickets/x/edit"
      />,
    );
    const ticket = r.container.querySelector('input[name="ticket_number"]') as HTMLInputElement;
    const assigned = r.container.querySelector('input[name="assigned_on"]') as HTMLInputElement;
    expect([ticket.disabled, assigned.disabled, assigned.value]).toEqual([true, true, "2026-09-11"]);
    expect(r.container.textContent).toContain("Preserved from the existing ticket");

    const form = r.container.querySelector("form")!;
    const b = button(r.container, /Replace ticket data/);
    await act(async () => void form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await act(async () => void form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(b.disabled).toBe(true);
    expect(visibleLabel(b)).toBe("Replacing…");
    await settle(() => pending.resolve({ ok: false, error: "Could not replace the ticket data: boom. The ticket was not changed." }));
    expect(r.container.textContent).toContain("The ticket was not changed.");
    expect(b.disabled).toBe(false);
  });

  it("a normal edit keeps both fields editable", async () => {
    const { RecordEditor } = await import("@/components/tickets/editor/record-editor");
    const initial = QaRecordInputSchema.parse({ ticket_number: "CHG1", assigned_on: "2026-09-11", qa_status: "assigned", data: {} });
    r = await render(<RecordEditor initial={initial} submitLabel="Save changes" onSubmit={async () => ({ ok: true })} cancelHref="/qa" />);
    expect((r.container.querySelector('input[name="assigned_on"]') as HTMLInputElement).disabled).toBe(false);
    expect((r.container.querySelector('input[name="ticket_number"]') as HTMLInputElement).disabled).toBe(false);
  });
});
