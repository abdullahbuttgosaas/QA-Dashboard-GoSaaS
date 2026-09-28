import { AppHeader } from "@/components/app-header";

// Manager experience: always read-only, independent of any QA sign-in in the same browser.
export default function ManagerLayout({ children }: LayoutProps<"/manager">) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        homeHref="/manager"
        subtitle="Manager view · read-only"
        links={[
          { href: "/manager", label: "Dashboard", exact: true },
          { href: "/manager/tickets", label: "Tickets" },
        ]}
        preserveParams={["qa", "period"]}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
