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

const deleteTicket = vi.fn();
vi.mock("@/app/actions/records", () => ({ deleteTicket: (...a: unknown[]) => deleteTicket(...a) }));
const discardDocument = vi.fn();
vi.mock("@/app/actions/documents", () => ({
  discardDocument: (...a: unknown[]) => discardDocument(...a),
  registerDocument: (...a: unknown[]) => registerDocument(...a),
}));
const registerDocument = vi.fn();
const upload = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload: (...a: unknown[]) => upload(...a), remove: vi.fn() }) } }),
}));

let r: Rendered | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("confirm", () => true);
  window.scrollTo = vi.fn() as typeof window.scrollTo; // not implemented in jsdom
});
afterEach(() => {
  r?.unmount();
  r = undefined;
  vi.unstubAllGlobals();
});

// Resolve an in-flight promise and let React finish the transition.
async function settle(fn: () => void) {
  await act(async () => {
    fn();
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function submitForm(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("ticket editor submit", () => {
  const initial = QaRecordInputSchema.parse({ ticket_number: "CHG1", qa_status: "assigned", data: {} });

  it("shows the pending label, disables the button and submits only once", async () => {
    const { RecordEditor } = await import("@/components/tickets/editor/record-editor");
    const pending = deferred<{ ok: false; error: string }>();
    const onSubmit = vi.fn(() => pending.promise);
    r = await render(<RecordEditor initial={initial} submitLabel="Create ticket" pendingLabel="Creating…" onSubmit={onSubmit} cancelHref="/qa" />);
    const form = r.container.querySelector("form")!;
    const b = button(r.container, /Create ticket/);

    await submitForm(form);
    await submitForm(form); // double submit (Enter twice / double click)
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(b.disabled).toBe(true);
    expect(visibleLabel(b)).toBe("Creating…");
    expect(form.getAttribute("aria-busy")).toBe("true");

    // On a validation error the form is kept (nothing cleared) and the button comes back.
    await settle(() => pending.resolve({ ok: false, error: "Ticket number already exists" }));
    expect(b.disabled).toBe(false);
    expect(visibleLabel(b)).toBe("Create ticket");
    expect(r.container.textContent).toContain("Ticket number already exists");
    expect((r.container.querySelector('input[name="ticket_number"]') as HTMLInputElement | null)?.value ?? "CHG1").toBe("CHG1");

    await submitForm(form);
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("defaults to Saving… for edits", async () => {
    const { RecordEditor } = await import("@/components/tickets/editor/record-editor");
    const pending = deferred<{ ok: false; error: string }>();
    r = await render(<RecordEditor initial={initial} submitLabel="Save changes" onSubmit={() => pending.promise} cancelHref="/qa" />);
    await submitForm(r.container.querySelector("form")!);
    expect(visibleLabel(button(r.container, /Save changes/))).toBe("Saving…");
    await settle(() => pending.resolve({ ok: false, error: "x" }));
  });
});

describe("delete ticket", () => {
  it("Deleting… while in flight, one request for a double click", async () => {
    const { DeleteTicketButton } = await import("@/components/tickets/delete-ticket-button");
    const pending = deferred<{ ok: false; error: string }>();
    deleteTicket.mockReturnValue(pending.promise);
    r = await render(<DeleteTicketButton recordId="r1" ticketNumber="CHG1" />);
    const b = button(r.container, /Delete/);
    await click(b);
    await click(b);
    expect(deleteTicket).toHaveBeenCalledTimes(1);
    expect(b.disabled).toBe(true);
    expect(visibleLabel(b)).toBe("Deleting…");
    await settle(() => pending.resolve({ ok: false, error: "nope" }));
    expect(visibleLabel(b)).toBe("Delete");
    expect(b.disabled).toBe(false);
  });

  it("does nothing when the confirmation is cancelled", async () => {
    vi.stubGlobal("confirm", () => false);
    const { DeleteTicketButton } = await import("@/components/tickets/delete-ticket-button");
    r = await render(<DeleteTicketButton recordId="r1" ticketNumber="CHG1" />);
    await click(button(r.container, /Delete/));
    expect(deleteTicket).not.toHaveBeenCalled();
  });
});

describe("document actions", () => {
  it("retry extraction shows Extracting… and runs once", async () => {
    const { RetryExtractionButton } = await import("@/components/reports/document-actions");
    const pending = deferred<Response>();
    const fetchMock = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    r = await render(<RetryExtractionButton documentId="d1" />);
    const b = button(r.container, /Retry extraction/);
    await click(b);
    await click(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(visibleLabel(b)).toBe("Extracting…");
    await settle(() => pending.resolve(new Response("{}", { status: 200 })));
    expect(visibleLabel(b)).toBe("Retry extraction");
  });

  it("discard shows Discarding…", async () => {
    const { DiscardDocumentButton } = await import("@/components/reports/document-actions");
    const pending = deferred<{ ok: true }>();
    discardDocument.mockReturnValue(pending.promise);
    r = await render(<DiscardDocumentButton documentId="d1" />);
    const b = button(r.container, /Discard/);
    await click(b);
    await click(b);
    expect(discardDocument).toHaveBeenCalledTimes(1);
    expect(visibleLabel(b)).toBe("Discarding…");
    await settle(() => pending.resolve({ ok: true }));
    expect(router.refresh).toHaveBeenCalled();
  });
});

describe("sign out", () => {
  it("shows Signing out… and blocks a second submit; still a plain POST to /auth/signout", async () => {
    const { SignOutButton } = await import("@/components/sign-out-button");
    r = await render(<SignOutButton />);
    const form = r.container.querySelector("form")!;
    expect(form.getAttribute("action")).toBe("/auth/signout");
    expect(form.getAttribute("method")).toBe("post");
    const first = new Event("submit", { bubbles: true, cancelable: true });
    await act(async () => void form.dispatchEvent(first));
    expect(first.defaultPrevented).toBe(false);
    const b = button(r.container, /Sign out/);
    expect(visibleLabel(b)).toBe("Signing out…");
    expect(b.disabled).toBe(true);
    const second = new Event("submit", { bubbles: true, cancelable: true });
    await act(async () => void form.dispatchEvent(second));
    expect(second.defaultPrevented).toBe(true);
  });
});

describe("upload stages", () => {
  it("walks Upload → Extract → Prepare review with one upload for a double click", async () => {
    const { UploadForm } = await import("@/components/reports/upload-form");
    const up = deferred<{ error: null }>();
    const extract = deferred<Response>();
    upload.mockReturnValue(up.promise);
    registerDocument.mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", vi.fn(() => extract.promise));
    r = await render(<UploadForm ownerId="u1" accept={{ "text/plain": "TXT" }} maxBytes={1_000_000} />);

    const fileInput = r.container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["hello"], "report.txt", { type: "text/plain" });
    Object.defineProperty(fileInput, "files", { value: [file] });
    await act(async () => void fileInput.dispatchEvent(new Event("change", { bubbles: true })));

    const b = button(r.container, /Upload and extract/);
    expect(b.disabled).toBe(false);
    await click(b);
    await click(b);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(b.disabled).toBe(true);
    expect(visibleLabel(b)).toBe("Uploading…");
    const steps = () => [...r!.container.querySelectorAll("[data-upload-steps] li")].map((li) => li.getAttribute("data-step-state"));
    expect(steps()).toEqual(["current", "todo", "todo"]);
    expect(fileInput.disabled).toBe(true);

    await settle(() => up.resolve({ error: null }));
    expect(visibleLabel(b)).toBe("Extracting…");
    expect(steps()).toEqual(["done", "current", "todo"]);

    await settle(() => extract.resolve(new Response("{}")));
    expect(visibleLabel(b)).toBe("Preparing review…");
    expect(steps()).toEqual(["done", "done", "current"]);
    expect(router.push).toHaveBeenCalledWith(expect.stringMatching(/^\/qa\/review\//));
    expect(upload).toHaveBeenCalledTimes(1);
  });
});

describe("manager filters", () => {
  it("navigate client-side with the other params kept and mark the content busy", async () => {
    const { PendingNavigationProvider, PendingRegion } = await import("@/components/navigation/pending-navigation");
    const { PeriodSelector } = await import("@/components/dashboard/period-selector");
    const { QaSelector } = await import("@/components/manager/qa-selector");
    router.push.mockImplementation(() => {});
    r = await render(
      <PendingNavigationProvider>
        <QaSelector qas={[{ display_name: "Abdullah", public_slug: "abdullah" }]} selected={null} keep={{ period: "4" }} />
        <PeriodSelector value="2" defaultWeeks={2} keep={{ qa: "abdullah" }} />
        <PendingRegion>
          <p>metrics</p>
        </PendingRegion>
      </PendingNavigationProvider>,
    );
    const period = r.container.querySelector("#period-selector") as HTMLSelectElement;
    const requestSubmit = vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => {});
    await act(async () => {
      period.value = "lifetime";
      period.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(router.push).toHaveBeenLastCalledWith("/?qa=abdullah&period=lifetime", { scroll: false });

    const qa = r.container.querySelector("#qa-selector") as HTMLSelectElement;
    await act(async () => {
      qa.value = "";
      qa.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(router.push).toHaveBeenLastCalledWith("/?period=4", { scroll: false }); // "All QAs" drops ?qa=
    expect(requestSubmit).not.toHaveBeenCalled(); // no full-page reload
    expect(r.container.querySelector("[data-pending-region]")).not.toBeNull();
    requestSubmit.mockRestore();
  });
});
