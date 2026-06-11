"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SessionReviewWizard } from "@/components/dashboard/session-review-wizard";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string | null;
  role: "learner" | "expert";
  /** @deprecated Partner context is loaded inside the wizard via GET /api/sessions/:id */
  partnerName?: string | null;
  onSubmitted?: () => void;
};

export function SessionReviewDialog({ open, onOpenChange, bookingId, role, onSubmitted }: Props) {
  const router = useRouter();
  const id = bookingId?.trim() ?? "";

  function handleDone() {
    onOpenChange(false);
    router.push("/dashboard");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto border-[#003049]/15 bg-white p-6 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="sr-only">Session review</DialogTitle>
          <DialogDescription className="sr-only">
            Multi-step feedback for this completed session. One review per booking.
          </DialogDescription>
        </DialogHeader>
        {open && id ? (
          <SessionReviewWizard
            bookingId={id}
            role={role}
            showIssueLink
            onSubmitted={onSubmitted}
            onDone={handleDone}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
