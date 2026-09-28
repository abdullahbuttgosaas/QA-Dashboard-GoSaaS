"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

// Window event other components dispatch when they start a programmatic navigation (e.g. dashboard filters).
export const NAVIGATION_START_EVENT = "app:navigation-start";

// Only appear if a navigation takes longer than this, so fast (prefetched) navigations never flash.
export const SHOW_DELAY_MS = 150;
const SAFETY_TIMEOUT_MS = 15_000;

type Phase = "idle" | "waiting" | "visible" | "finishing";

// Is this click an in-app page navigation (not a download, new tab, external link, file or same URL)?
// Checked in the capture phase, before next/link calls preventDefault() to navigate client-side.
export function isInternalNavigation(anchor: HTMLAnchorElement, event: MouseEvent): boolean {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return false;
  if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return false;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  if (url.pathname.startsWith("/api/") || /\/documents\//.test(url.pathname)) return false; // file routes
  return url.pathname !== window.location.pathname || url.search !== window.location.search;
}

// Thin top progress bar for route changes. Starts on in-app link clicks (or NAVIGATION_START_EVENT) and
// finishes when the URL changes. Purely visual; never blocks interaction.
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("idle");
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const start = useCallback(() => {
    clearTimers();
    setPhase("waiting");
    timers.current.push(window.setTimeout(() => setPhase((p) => (p === "waiting" ? "visible" : p)), SHOW_DELAY_MS));
    timers.current.push(window.setTimeout(() => setPhase("idle"), SAFETY_TIMEOUT_MS));
  }, []);

  // URL changed: the navigation is done.
  const url = `${pathname}?${searchParams.toString()}`;
  const lastUrl = useRef(url);
  useEffect(() => {
    if (lastUrl.current === url) return;
    lastUrl.current = url;
    clearTimers();
    setPhase((p) => {
      if (p !== "visible") return "idle";
      timers.current.push(window.setTimeout(() => setPhase("idle"), 250));
      return "finishing";
    });
  }, [url]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (anchor instanceof HTMLAnchorElement && isInternalNavigation(anchor, event)) start();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener(NAVIGATION_START_EVENT, start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(NAVIGATION_START_EVENT, start);
      clearTimers();
    };
  }, [start]);

  const shown = phase === "visible" || phase === "finishing";
  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      aria-hidden={!shown}
      aria-busy={phase === "visible" || undefined}
      data-navigation-progress={phase}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden"
    >
      <div
        className={cn(
          "h-full bg-accent",
          shown ? "opacity-100" : "opacity-0",
          phase === "visible" &&
            "w-4/5 transition-[width] duration-[8000ms] ease-out motion-reduce:w-full motion-reduce:transition-none",
          phase === "finishing" && "w-full transition-[width,opacity] duration-200",
          !shown && "w-0",
        )}
      />
    </div>
  );
}
