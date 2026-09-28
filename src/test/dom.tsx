// Minimal React DOM harness for interaction tests (files opt in with `// @vitest-environment jsdom`).
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export type Rendered = { container: HTMLElement; root: Root; rerender: (ui: ReactNode) => Promise<void>; unmount: () => void };

export async function render(ui: ReactNode): Promise<Rendered> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(ui));
  return {
    container,
    root,
    rerender: async (next) => act(async () => root.render(next)),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

export async function click(el: Element | null) {
  if (!el) throw new Error("element not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
}

// A promise the test resolves by hand, to hold an async action "in flight".
export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

export function button(container: HTMLElement, name: RegExp): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((b) => name.test(b.textContent ?? ""));
  if (!found) throw new Error(`button ${name} not found`);
  return found;
}

// Text of the label a LoadingButton currently shows (the other one is visually hidden and aria-hidden).
export function visibleLabel(b: HTMLButtonElement): string {
  const shown = [...b.querySelectorAll(":scope > span > span")].find((s) => !s.classList.contains("invisible"));
  return shown?.textContent?.trim() ?? "";
}
