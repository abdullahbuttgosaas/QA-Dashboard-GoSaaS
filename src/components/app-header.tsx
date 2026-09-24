import Link from "next/link";
import type { DashboardContext } from "@/services/profiles";
import { buttonClass } from "@/components/ui/button";
import { NavLinks } from "@/components/nav-links";

export function AppHeader({ ctx }: { ctx: DashboardContext }) {
  const { profile, canEdit, viewer } = ctx;
  const base = `/${profile.public_slug}`;

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href={base} className="flex items-center gap-2.5">
          <span aria-hidden className="grid size-7 place-items-center rounded-md bg-accent text-xs font-bold text-white">
            QA
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold text-ink">Glaukos QA Dashboard</span>
            <span className="block text-xs text-ink-muted">{profile.display_name}</span>
          </span>
        </Link>

        <NavLinks
          links={[
            { href: base, label: "Dashboard", exact: true },
            { href: `${base}/tickets`, label: "Tickets" },
            ...(canEdit ? [{ href: `${base}/upload`, label: "Reports" }] : []),
          ]}
        />

        <div className="ml-auto flex items-center gap-2">
          {canEdit ? (
            <>
              <Link href={`${base}/upload`} className={buttonClass("primary", "sm")}>
                Upload QA report
              </Link>
              <Link href={`${base}/settings`} className={buttonClass("ghost", "sm")}>
                Settings
              </Link>
              <form action="/auth/signout" method="post">
                <button className={buttonClass("ghost", "sm")}>Sign out</button>
              </form>
            </>
          ) : viewer ? (
            <form action="/auth/signout" method="post">
              <button className={buttonClass("ghost", "sm")}>Sign out</button>
            </form>
          ) : (
            <Link href="/login" className="text-xs text-ink-muted hover:text-ink">
              QA sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
