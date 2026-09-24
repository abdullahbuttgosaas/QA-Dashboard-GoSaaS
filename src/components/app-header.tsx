import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { NavLinks } from "@/components/nav-links";

type Props = {
  homeHref: string;
  subtitle: string;
  links: Array<{ href: string; label: string; exact?: boolean }>;
  preserveParams?: string[];
  actions?: ReactNode;
};

// Shared shell for the manager (read-only) and QA (working) experiences; only links and actions differ.
export function AppHeader({ homeHref, subtitle, links, preserveParams, actions }: Props) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href={homeHref} className="flex items-center gap-2.5">
          <span aria-hidden className="grid size-7 place-items-center rounded-md bg-accent text-xs font-bold text-white">
            QA
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold text-ink">Glaukos QA Dashboard</span>
            <span className="block text-xs text-ink-muted">{subtitle}</span>
          </span>
        </Link>
        <Suspense fallback={<nav className="h-8" />}>
          <NavLinks links={links} preserveParams={preserveParams} />
        </Suspense>
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
