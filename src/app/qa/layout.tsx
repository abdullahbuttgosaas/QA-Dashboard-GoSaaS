import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { buttonClass } from "@/components/ui/button";
import { requireQa } from "@/services/profiles";
import { SignOutButton } from "@/components/sign-out-button";

// QA working experience: requires a signed-in @gosaas.ai user. Write permissions are still enforced by
// server actions and RLS; this layout only decides who sees the working interface.
export default async function QaLayout({ children }: LayoutProps<"/qa">) {
  const { profile } = await requireQa();
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        homeHref="/qa"
        subtitle={`${profile.display_name} · QA workspace`}
        links={[
          { href: "/qa", label: "Dashboard", exact: true },
          { href: "/qa/tickets", label: "Tickets" },
          { href: "/qa/upload", label: "Reports" },
        ]}
        actions={
          <>
            <Link href="/qa/upload" className={buttonClass("primary", "sm")}>
              Upload QA report
            </Link>
            <Link href="/qa/settings" className={buttonClass("ghost", "sm")}>
              Settings
            </Link>
            <SignOutButton />
          </>
        }
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
