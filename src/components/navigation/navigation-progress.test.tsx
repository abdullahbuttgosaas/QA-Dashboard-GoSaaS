// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { render, type Rendered } from "@/test/dom";

const nav = { pathname: "/manager", search: "" };
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const { NavigationProgress, NAVIGATION_START_EVENT, SHOW_DELAY_MS } = await import("./navigation-progress");

let r: Rendered;
const stopNavigation = (e: Event) => e.preventDefault(); // jsdom cannot navigate; runs after the app's listener
const phase = () => r.container.querySelector("[data-navigation-progress]")!.getAttribute("data-navigation-progress");

function link(href: string, attrs: Record<string, string> = {}) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = "go";
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  document.body.appendChild(a);
  return a;
}
async function clickLink(a: HTMLAnchorElement, init: MouseEventInit = {}) {
  await act(async () => void a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init })));
}
async function advance(ms: number) {
  await act(async () => void vi.advanceTimersByTime(ms));
}
async function urlChanges(pathname: string, search = "") {
  nav.pathname = pathname;
  nav.search = search;
  await r.rerender(<NavigationProgress />);
}

beforeEach(async () => {
  vi.useFakeTimers();
  nav.pathname = "/manager";
  nav.search = "";
  window.history.replaceState(null, "", "/manager");
  window.addEventListener("click", stopNavigation);
  r = await render(<NavigationProgress />);
});
afterEach(() => {
  r.unmount();
  window.removeEventListener("click", stopNavigation);
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("navigation progress indicator", () => {
  it("is hidden at rest and never blocks the page", () => {
    expect(phase()).toBe("idle");
    const bar = r.container.querySelector("[data-navigation-progress]")!;
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    expect(bar.className).toContain("pointer-events-none");
  });

  it("appears only after a short delay on an in-app link click, then finishes when the URL changes", async () => {
    await clickLink(link("/manager/tickets"));
    expect(phase()).toBe("waiting");
    await advance(SHOW_DELAY_MS - 10);
    expect(phase()).toBe("waiting"); // no flash for fast navigations
    await advance(20);
    expect(phase()).toBe("visible");
    await urlChanges("/manager/tickets");
    expect(phase()).toBe("finishing");
    await advance(300);
    expect(phase()).toBe("idle");
  });

  it("never shows for a navigation faster than the delay", async () => {
    await clickLink(link("/manager/tickets"));
    await urlChanges("/manager/tickets");
    await advance(1000);
    expect(phase()).toBe("idle");
  });

  it("starts even though next/link prevents the default action to navigate client-side", async () => {
    const a = link("/manager/tickets");
    a.addEventListener("click", (e) => e.preventDefault()); // what <Link> does
    await clickLink(a);
    expect(phase()).toBe("waiting");
  });

  it("starts for query-only changes and the filter start event", async () => {
    await clickLink(link("/manager?qa=abdullah"));
    expect(phase()).toBe("waiting");
    await urlChanges("/manager", "qa=abdullah");
    await act(async () => void window.dispatchEvent(new Event(NAVIGATION_START_EVENT)));
    expect(phase()).toBe("waiting");
  });

  it("ignores new tabs, downloads, modifier clicks, external links, file routes and the current URL", async () => {
    await clickLink(link("/manager/tickets", { target: "_blank" }));
    await clickLink(link("/manager/tickets", { download: "" }));
    await clickLink(link("/manager/tickets"), { metaKey: true });
    await clickLink(link("/manager/tickets"), { ctrlKey: true });
    await clickLink(link("https://example.com/"));
    await clickLink(link("/api/documents/1/download"));
    await clickLink(link("/manager"));
    expect(phase()).toBe("idle");
  });

  it("gives up after a safety timeout if the navigation never completes", async () => {
    await clickLink(link("/manager/tickets"));
    await advance(16_000);
    expect(phase()).toBe("idle");
  });
});
