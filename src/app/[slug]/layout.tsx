import { AppHeader } from "@/components/app-header";
import { getDashboardContext } from "@/services/profiles";

export default async function DashboardLayout({ children, params }: LayoutProps<"/[slug]">) {
  const { slug } = await params;
  const ctx = await getDashboardContext(slug);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader ctx={ctx} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
