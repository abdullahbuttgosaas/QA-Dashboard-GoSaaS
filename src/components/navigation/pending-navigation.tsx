"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useTransition, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NAVIGATION_START_EVENT } from "./navigation-progress";

type PendingNavigation = { pending: boolean; navigate: (href: string) => void };

const Context = createContext<PendingNavigation | null>(null);

// Client-side navigation whose pending state is shared with PendingRegion, so filter changes can mark the
// current (soon stale) content as busy instead of leaving it interactive while new data loads.
export function PendingNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = useCallback(
    (href: string) => {
      window.dispatchEvent(new Event(NAVIGATION_START_EVENT));
      startTransition(() => router.push(href, { scroll: false }));
    },
    [router],
  );
  return <Context.Provider value={{ pending, navigate }}>{children}</Context.Provider>;
}

export function usePendingNavigation(): PendingNavigation | null {
  return useContext(Context);
}

// Content that becomes stale while a filter navigation is pending: dimmed and non-interactive, aria-busy.
export function PendingRegion({ children }: { children: ReactNode }) {
  const ctx = useContext(Context);
  const pending = ctx?.pending ?? false;
  return (
    <div
      aria-busy={pending || undefined}
      data-pending-region={pending ? "true" : "false"}
      className={cn(
        "transition-opacity duration-150 motion-reduce:transition-none",
        pending && "pointer-events-none opacity-60",
      )}
    >
      {children}
    </div>
  );
}

// Builds the GET URL a filter form would submit (drops empty values, e.g. "All QAs").
export function formHref(form: HTMLFormElement): string {
  const params = new URLSearchParams();
  new FormData(form).forEach((value, key) => {
    if (typeof value === "string" && value !== "") params.set(key, value);
  });
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}`;
}
