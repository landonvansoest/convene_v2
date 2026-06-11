import Link from "next/link";

/** v1 had `/dev` for internal tools; v2 does not ship dev tools yet. */
export default function DevPlaceholderPage() {
  return (
    <div className="min-h-screen bg-background px-6 py-16 text-foreground">
      <div className="mx-auto max-w-lg rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-xl font-semibold">Developer tools</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          v1&apos;s <code className="rounded bg-muted px-1 py-0.5 text-xs">/dev</code> route is not
          ported yet. Use the admin surface or local API routes while building v2.
        </p>
        <Link
          href="/dev/success-dialog-icons"
          className="mt-4 inline-block text-sm font-medium text-primary underline"
        >
          Success dialogue icon preview
        </Link>
        <Link href="/" className="mt-6 inline-block text-sm font-medium text-primary underline">
          Back to home
        </Link>
      </div>
    </div>
  );
}
