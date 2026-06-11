"use client";

import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SessionIssueFeedbackDialog } from "@/components/dashboard/SessionIssueFeedbackDialog";
import { PARTY_POPPER_RASTER_MASK_STYLE } from "@/lib/convenePartyPopperRaster";
import { cn } from "@/lib/utils";

type Party = {
  user_id: string;
  display_name: string;
  profile_photo: string | null;
  profession: string | null;
};

function firstName(displayName: string): string {
  const t = displayName.trim();
  if (!t) return "them";
  return t.split(/\s+/)[0] ?? t;
}

function StarRow(props: {
  value: number | null;
  onChange: (n: number) => void;
  labelledBy?: string;
}) {
  const { value, onChange, labelledBy } = props;
  return (
    <div className="flex gap-2" role="radiogroup" aria-labelledby={labelledBy}>
      {[1, 2, 3, 4, 5].map((n) => {
        const active = value != null && n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            className={cn(
              "rounded-md p-1 transition focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#F77F00]",
              active ? "text-[#F77F00]" : "text-[#003049]/25",
            )}
            onClick={() => onChange(n)}
          >
            <Star className={cn("h-9 w-9", active && "fill-current")} strokeWidth={1.5} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

export type SessionReviewWizardProps = {
  bookingId: string;
  role: "learner" | "expert";
  /** Close dialog or navigate away after thank-you (or “not now”). */
  onDone: () => void;
  /** Optional: e.g. refresh sessions list right after review is saved. */
  onSubmitted?: () => void;
  /** Learner thank-you dismiss (e.g. “Back to sessions” on standalone `/sessions/.../review`). */
  thankYouDismissLabel?: string;
  showIssueLink?: boolean;
  className?: string;
};

/**
 * Bible multi-slide review: learner ↔ expert prompts, then thank-you (+ learner CTAs).
 */
export function SessionReviewWizard({
  bookingId,
  role,
  onDone,
  onSubmitted,
  thankYouDismissLabel,
  showIssueLink = true,
  className,
}: SessionReviewWizardProps) {
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [expert, setExpert] = useState<Party | null>(null);
  const [learner, setLearner] = useState<Party | null>(null);

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [overallRating, setOverallRating] = useState<number | null>(null);
  const [questionsRating, setQuestionsRating] = useState<number | null>(null);
  const [knowledgeableRating, setKnowledgeableRating] = useState<number | null>(null);
  const [personableRatingExpert, setPersonableRatingExpert] = useState<number | null>(null);
  const [preparedRating, setPreparedRating] = useState<number | null>(null);
  const [respectfulRating, setRespectfulRating] = useState<number | null>(null);
  const [personableRatingLearner, setPersonableRatingLearner] = useState<number | null>(null);
  const [publicReview, setPublicReview] = useState("");
  const [privateMessage, setPrivateMessage] = useState("");

  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadErr(null);
      const res = await fetch(`/api/sessions/${encodeURIComponent(bookingId)}`);
      const data = (await res.json()) as {
        error?: string;
        booking?: { user_role?: string };
        expert?: Party | null;
        learner?: Party | null;
      };
      if (cancelled) return;
      if (!res.ok) {
        setLoadErr(typeof data.error === "string" ? data.error : "Could not load session");
        return;
      }
      if (data.booking?.user_role && data.booking.user_role !== role) {
        setLoadErr(`This flow is only for ${role}s on this booking.`);
        return;
      }
      if (data.expert != null) setExpert(data.expert);
      if (data.learner != null) setLearner(data.learner);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId, role]);

  useEffect(() => {
    setStep(1);
    setOverallRating(null);
    setQuestionsRating(null);
    setKnowledgeableRating(null);
    setPersonableRatingExpert(null);
    setPreparedRating(null);
    setRespectfulRating(null);
    setPersonableRatingLearner(null);
    setPublicReview("");
    setPrivateMessage("");
    setSubmitErr(null);
    setBusy(false);
    setIssueOpen(false);
  }, [bookingId, role]);

  const reviewParty: Party | null =
    role === "learner" ? expert ?? null : learner ?? null;

  async function submitAll(finalPrivate: string | null, finalPublicTrim: string) {
    if (overallRating == null) {
      setSubmitErr("Please choose an overall rating on step 1, or go back.");
      return;
    }
    setBusy(true);
    setSubmitErr(null);

    const path =
      role === "learner"
        ? `/api/sessions/${encodeURIComponent(bookingId)}/reviews/expert`
        : `/api/sessions/${encodeURIComponent(bookingId)}/reviews/learner`;

    const body =
      role === "learner"
        ? {
            overall_rating: overallRating,
            questions_rating: questionsRating,
            knowledgeable_rating: knowledgeableRating,
            personable_rating: personableRatingExpert,
            public_review: finalPublicTrim || null,
            private_message: finalPrivate?.trim() || null,
          }
        : {
            overall_rating: overallRating,
            prepared_rating: preparedRating,
            respectful_rating: respectfulRating,
            personable_rating: personableRatingLearner,
            public_review: finalPublicTrim || null,
            private_message: finalPrivate?.trim() || null,
          };

    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setSubmitErr(typeof data.error === "string" ? data.error : "Failed to submit");
      return;
    }
    onSubmitted?.();
    setStep(5);
  }

  function onContinueSlide1() {
    if (overallRating == null) {
      setSubmitErr("Tap the stars to rate this session.");
      return;
    }
    setSubmitErr(null);
    setStep(2);
  }

  function onContinueSlide2() {
    setSubmitErr(null);
    setStep(3);
  }

  function skipSlide2() {
    if (role === "learner") {
      setQuestionsRating(null);
      setKnowledgeableRating(null);
      setPersonableRatingExpert(null);
    } else {
      setPreparedRating(null);
      setRespectfulRating(null);
      setPersonableRatingLearner(null);
    }
    setSubmitErr(null);
    setStep(3);
  }

  function onContinueSlide3() {
    setSubmitErr(null);
    setStep(4);
  }

  function skipSlide3() {
    setPublicReview("");
    setSubmitErr(null);
    setStep(4);
  }

  const expertBookingLink = expert?.user_id ? `/experts/${expert.user_id}` : "/experts";

  if (loadErr) {
    return <p className="text-sm text-red-600">{loadErr}</p>;
  }

  if (!reviewParty) {
    return <p className="text-sm text-muted-foreground">Loading review…</p>;
  }

  const fn = firstName(reviewParty.display_name);
  const full = reviewParty.display_name.trim() || fn;

  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex items-start gap-3 border-b border-[#003049]/10 pb-4">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-[#003049]/15 bg-[#003049]/5">
          {reviewParty.profile_photo ? (
            <Image
              src={reviewParty.profile_photo}
              alt=""
              fill
              className="object-cover"
              sizes="56px"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-[#003049]/35">
              {full.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-[#003049]">Leave a Review</h2>
          <p className="mt-1 text-sm font-medium text-[#003049]">{full}</p>
          {reviewParty.profession ? (
            <p className="text-xs text-muted-foreground">{reviewParty.profession}</p>
          ) : null}
        </div>
      </div>

      {step === 1 ? (
        <section className="space-y-3" aria-labelledby="sr-step1">
          <p id="sr-step1" className="text-sm font-medium leading-snug text-[#003049]">
            How was your session with {full}?
          </p>
          <StarRow value={overallRating} onChange={setOverallRating} labelledBy="sr-step1" />
          {submitErr ? <p className="text-sm text-red-600">{submitErr}</p> : null}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              className="bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
              disabled={busy}
              onClick={onContinueSlide1}
            >
              Continue
            </Button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-5">
          {role === "learner" ? (
            <>
              <div className="space-y-2">
                <p className="text-sm font-medium text-[#003049]" id="sr-q1">
                  Was {full} able to address your questions?
                </p>
                <StarRow value={questionsRating} onChange={setQuestionsRating} labelledBy="sr-q1" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-[#003049]" id="sr-q2">
                  How knowledgeable was {full} on the subject matter of your session?
                </p>
                <StarRow
                  value={knowledgeableRating}
                  onChange={setKnowledgeableRating}
                  labelledBy="sr-q2"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-[#003049]" id="sr-q3">
                  How personable was {full}?
                </p>
                <StarRow
                  value={personableRatingExpert}
                  onChange={setPersonableRatingExpert}
                  labelledBy="sr-q3"
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-sm font-medium text-[#003049]" id="sr-l1">
                  How prepared and engaged was {full}?
                </p>
                <StarRow value={preparedRating} onChange={setPreparedRating} labelledBy="sr-l1" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-[#003049]" id="sr-l2">
                  Was {full} respectful of your time and advice?
                </p>
                <StarRow value={respectfulRating} onChange={setRespectfulRating} labelledBy="sr-l2" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-[#003049]" id="sr-l3">
                  How personable was {full}?
                </p>
                <StarRow
                  value={personableRatingLearner}
                  onChange={setPersonableRatingLearner}
                  labelledBy="sr-l3"
                />
              </div>
            </>
          )}
          {submitErr ? <p className="text-sm text-red-600">{submitErr}</p> : null}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              className="bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
              disabled={busy}
              onClick={onContinueSlide2}
            >
              Continue
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={skipSlide2}>
              Skip
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-[#003049]">
              Please write a public review of {full}.
            </span>
            <textarea
              rows={5}
              className="mt-2 w-full rounded-md border border-[#003049]/20 bg-white px-3 py-2 text-sm text-[#003049] outline-none focus:border-[#F77F00]"
              value={publicReview}
              onChange={(e) => setPublicReview(e.target.value)}
            />
          </label>
          {submitErr ? <p className="text-sm text-red-600">{submitErr}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
              disabled={busy}
              onClick={onContinueSlide3}
            >
              Continue
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={skipSlide3}>
              Skip
            </Button>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-[#003049]">
              Send {full} a private message. Share any feedback or suggestions.
            </span>
            <textarea
              rows={4}
              className="mt-2 w-full rounded-md border border-[#003049]/20 bg-white px-3 py-2 text-sm text-[#003049] outline-none focus:border-[#F77F00]"
              value={privateMessage}
              onChange={(e) => setPrivateMessage(e.target.value)}
            />
          </label>
          {submitErr ? <p className="text-sm text-red-600">{submitErr}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
              disabled={busy}
              onClick={() =>
                void submitAll(privateMessage.trim() || null, publicReview.trim())
              }
            >
              {busy ? "Submitting…" : "Submit"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void submitAll(null, publicReview.trim())}
            >
              Skip
            </Button>
          </div>
        </section>
      ) : null}

      {step === 5 ? (
        <section className="space-y-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-14 w-14 shrink-0 bg-[#003049]"
              style={PARTY_POPPER_RASTER_MASK_STYLE}
              aria-hidden
            />
            <p className="text-lg font-semibold text-[#003049]">Thank you for submitting your review!</p>
          </div>

          {role === "learner" && expert ? (
            <div className="border-t border-[#003049]/15 pt-6">
              <p className="text-sm font-medium text-[#003049]">
                Would you like to schedule another session with {full}?
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button asChild className="bg-[#003049] text-white hover:bg-[#003049]/90">
                  <Link href={expertBookingLink}>Book</Link>
                </Button>
                <Button asChild variant="outline" className="border-[#003049]/25">
                  <Link href="/">Browse other experts</Link>
                </Button>
              </div>
              <Button variant="ghost" className="mt-4 w-full text-muted-foreground" onClick={onDone}>
                {thankYouDismissLabel ?? "Not now — return to dashboard"}
              </Button>
            </div>
          ) : (
            <Button className="w-full bg-[#003049] text-white hover:bg-[#003049]/90" onClick={onDone}>
              Done
            </Button>
          )}
        </section>
      ) : null}

      {showIssueLink && step < 5 ? (
        <p className="border-t border-[#003049]/10 pt-4 text-sm text-[#003049]/85">
          If you experienced a problem with your session{" "}
          <button
            type="button"
            className="font-semibold text-[#F77F00] underline underline-offset-2 hover:text-[#003049]"
            onClick={() => setIssueOpen(true)}
          >
            click here
          </button>
          .
        </p>
      ) : null}

      <SessionIssueFeedbackDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        bookingId={bookingId}
        viewerRole={role}
      />
    </div>
  );
}
