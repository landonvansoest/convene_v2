"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";

type Role = "learner" | "expert";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  role: Role;
};

const STEP_TITLES = ["Session recap", "Rate and reflect", "Submit"] as const;
const STEP_BODIES = [
  "Confirm you are reviewing the right booking. Ratings should reflect that session only.",
  "v1 used sliders and prompts here. The full form lives on the dedicated review page until we embed the same fields.",
  "Submit saves to v2 APIs on the review route. Use the button below to open the real form.",
] as const;

export function ReviewFlowDialog({ open, onOpenChange, bookingId, role }: Props) {
  const [step, setStep] = useState(0);

  const href =
    role === "learner"
      ? `/sessions/${encodeURIComponent(bookingId)}/review`
      : `/sessions/${encodeURIComponent(bookingId)}/review-learner`;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setStep(0);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#003049]">
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
            {role === "learner" ? "Review expert" : "Review learner"}
          </DialogTitle>
          <DialogDescription>
            v1-style stepped flow (UI shell). Step {step + 1} of {STEP_TITLES.length}.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-[#003049]/10 bg-gray-50/80 p-4">
          <p className="font-medium text-[#003049]">{STEP_TITLES[step]}</p>
          <p className="mt-2 text-sm text-muted-foreground">{STEP_BODIES[step]}</p>
          <p className="mt-3 font-mono text-xs text-muted-foreground">Booking · {bookingId}</p>
        </div>

        <div className="flex justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </Button>
          {step < STEP_TITLES.length - 1 ? (
            <Button type="button" className="bg-[#003049] text-white" onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          ) : (
            <Button asChild className="bg-[#F77F00] text-white hover:bg-[#F77F00]/90">
              <Link href={href} onClick={() => onOpenChange(false)}>
                Open review form
              </Link>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
