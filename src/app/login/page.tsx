import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { serverEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/site";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null) ?? undefined;
  if ((await getViewer())?.isQaUser) redirect(next ?? "/");
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span aria-hidden className="grid size-8 place-items-center rounded-md bg-accent text-xs font-bold text-white">
            QA
          </span>
          <span className="text-base font-semibold text-ink">Glaukos QA Dashboard</span>
        </div>
        <div className="rounded-lg border border-line bg-surface p-6">
          <h1 className="text-lg font-semibold text-ink">QA sign in</h1>
          <p className="mt-1 mb-5 text-sm text-ink-muted">
            For QA team members with a @{serverEnv.allowedEmailDomain()} account. Managers can view dashboards through their shared link
            without signing in.
          </p>
          {error && (
            <p role="alert" className="mb-4 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">
              {error}
            </p>
          )}
          <LoginForm next={next} domain={serverEnv.allowedEmailDomain()} />
        </div>
      </div>
    </main>
  );
}
