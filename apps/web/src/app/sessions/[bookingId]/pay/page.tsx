"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SessionPaymentDialog } from "@/components/dashboard/SessionPaymentDialog";

/**
 * Deep link: opens the same payment dialog used on the dashboard / sessions list.
 */
export default function SessionPayPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = typeof params.bookingId === "string" ? params.bookingId : "";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (bookingId) setOpen(true);
  }, [bookingId]);

  return (
    <div className="min-h-screen bg-[var(--convene-primary)] px-4 py-10 text-white">
      <div className="mx-auto max-w-md">
        <Link href="/sessions" className="text-sm text-[var(--convene-hero)] underline">
          ← Sessions
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Pay for session</h1>
        <p className="mt-2 text-sm text-white/75">
          Use the payment dialog to complete checkout. If it does not appear, return to your dashboard.
        </p>
      </div>
      <SessionPaymentDialog
        open={open && Boolean(bookingId)}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) router.push("/sessions");
        }}
        bookingId={bookingId || null}
        onPaid={() => router.push("/dashboard")}
      />
    </div>
  );
}
