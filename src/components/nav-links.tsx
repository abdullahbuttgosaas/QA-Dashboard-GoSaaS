"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

type NavLink = { href: string; label: string; exact?: boolean };

// preserveParams keeps selected query parameters (e.g. the manager's ?qa= filter) when switching pages.
export function NavLinks({ links, preserveParams = [] }: { links: NavLink[]; preserveParams?: string[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const kept = new URLSearchParams();
  for (const key of preserveParams) {
    const value = searchParams.get(key);
    if (value) kept.set(key, value);
  }
  const suffix = kept.size ? `?${kept}` : "";

  return (
    <nav className="flex items-center gap-1">
      {links.map((l) => {
        const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={`${l.href}${suffix}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              active ? "bg-surface-muted text-ink" : "text-ink-secondary hover:text-ink",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
