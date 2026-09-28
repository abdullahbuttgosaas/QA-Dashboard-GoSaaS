// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LoadingButton } from "./loading-button";
import { render, visibleLabel, type Rendered } from "@/test/dom";

let r: Rendered | undefined;
afterEach(() => r?.unmount());

describe("LoadingButton", () => {
  it("idle: enabled, shows its label, no busy state", async () => {
    r = await render(<LoadingButton pending={false} pendingLabel="Saving…">Save</LoadingButton>);
    const b = r.container.querySelector("button")!;
    expect(b.disabled).toBe(false);
    expect(b.getAttribute("aria-busy")).toBeNull();
    expect(visibleLabel(b)).toBe("Save");
  });

  it("pending: disabled immediately, aria-busy, spinner + pending label; label goes away when done", async () => {
    r = await render(<LoadingButton pending pendingLabel="Saving…">Save</LoadingButton>);
    const b = r.container.querySelector("button")!;
    expect(b.disabled).toBe(true);
    expect(b.getAttribute("aria-busy")).toBe("true");
    expect(visibleLabel(b)).toBe("Saving…");
    expect(b.querySelector("[data-loading-label] svg")).not.toBeNull();

    await r.rerender(<LoadingButton pending={false} pendingLabel="Saving…">Save</LoadingButton>);
    expect(b.disabled).toBe(false);
    expect(visibleLabel(b)).toBe("Save");
  });

  it("keeps both labels in one grid cell so the width does not change", () => {
    const html = renderToStaticMarkup(
      <LoadingButton pending={false} pendingLabel="Uploading…" reserveLabels={["Preparing review…"]}>
        Go
      </LoadingButton>,
    );
    expect(html).toContain("Uploading…");
    expect(html).toContain("Preparing review…");
    expect(html.match(/col-start-1 row-start-1/g)).toHaveLength(3);
  });

  it("stays disabled when disabled even if not pending", async () => {
    r = await render(<LoadingButton pending={false} disabled pendingLabel="x">Go</LoadingButton>);
    expect(r.container.querySelector("button")!.disabled).toBe(true);
  });
});
