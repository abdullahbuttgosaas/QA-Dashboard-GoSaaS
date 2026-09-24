import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16 text-center">
      <div>
        <p className="text-sm font-medium text-ink-muted">404</p>
        <h1 className="mt-1 text-xl font-semibold text-ink">Page not found</h1>
        <p className="mt-2 text-sm text-ink-muted">The dashboard or ticket may not exist, or it may not be public.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-accent hover:underline">
          Go home
        </Link>
      </div>
    </main>
  );
}
