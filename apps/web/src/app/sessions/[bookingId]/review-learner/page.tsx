"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { SessionReviewWizard } from "@/components/dashboard/session-review-wizard";

/** Expert reviews learner (multi-step, Bible flow). */
export default function SessionReviewLearnerPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = typeof params.bookingId === "string" ? params.bookingId : "";

  return (
    <div className="min-h-screen bg-[var(--convene-primary)] px-4 py-10">
      <div className="mx-auto max-w-lg">
        <Link href="/sessions" className="text-sm text-[var(--convene-hero)] underline">
          ← Sessions
        </Link>
        <div className="mt-6 rounded-lg border border-[#003049]/10 bg-white p-6 shadow-sm">
          {bookingId ? (
            <SessionReviewWizard
              bookingId={bookingId}
              role="expert"
              showIssueLink
              onDone={() => router.push("/sessions")}
            />
          ) : (
            <p className="text-sm text-red-600">Invalid booking.</p>
          )}
        </div>
      </div>
    </div>
  );
}
