import Link from "next/link";
import { redirect } from "next/navigation";
import { getOwnProfile } from "@/services/profiles";
import { buttonClass } from "@/components/ui/button";

// QA users land on their own dashboard. Managers use the shared /<name> link directly.
export default async function Home() {
  const profile = await getOwnProfile();
  if (profile) redirect(`/${profile.public_slug}`);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-ink">Glaukos QA Performance &amp; Solution Quality</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Managers: open the dashboard link shared with you (for example <span className="font-mono">/abdullah</span>). QA team members:
          sign in to upload and manage reports.
        </p>
        <Link href="/login" className={buttonClass("primary", "md", "mt-6")}>
          QA sign in
        </Link>
      </div>
    </main>
  );
}
