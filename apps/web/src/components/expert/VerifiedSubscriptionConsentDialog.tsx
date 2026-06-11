"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const cnDialogV1 =
  "max-h-[90vh] w-full max-w-lg overflow-y-auto border-[#003049]/10 bg-white p-6 shadow-xl sm:max-w-md z-[202] [&>button]:rounded-full [&>button]:border-2 [&>button]:border-[#F77F00] [&>button]:bg-white [&>button]:p-2 [&>button]:opacity-100 [&>button]:shadow-sm [&>button]:ring-0 [&>button]:hover:bg-white [&>button]:hover:opacity-100 [&>button]:focus:ring-2 [&>button]:focus:ring-[#F77F00] [&>button]:focus:ring-offset-2 [&>button]:text-[#003049]";

const CONSENT_CHECKBOX_ID = "verified-expert-consent-agree";

export type VerifiedSubscriptionConsentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** User agreed and chose to continue; open the payment dialog next. */
  onContinue: () => void;
};

export function VerifiedSubscriptionConsentDialog({
  open,
  onOpenChange,
  onContinue,
}: VerifiedSubscriptionConsentDialogProps) {
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (open) setAgreed(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cnDialogV1}>
        <DialogHeader className="space-y-0 text-left">
          <DialogTitle className="text-2xl font-bold tracking-tight text-[#003049]">Verified expert</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-left text-sm leading-relaxed text-[#003049]/90">
          <p>
            By enrolling as verified expert, you are consenting to a background check to verify the information on your
            profile.
          </p>
          <p>
            This process will earn you a &ldquo;verified&rdquo; badge everywhere your profile appears on the site,
            giving you enhanced visibility and credibility in our community.
          </p>
        </div>

        <div className="flex items-start gap-3 pt-1">
          <Checkbox
            id={CONSENT_CHECKBOX_ID}
            checked={agreed}
            onCheckedChange={(v) => setAgreed(v === true)}
            className="mt-0.5 border-[#003049]/35 data-[state=checked]:border-[#F77F00] data-[state=checked]:bg-[#F77F00]"
          />
          <Label htmlFor={CONSENT_CHECKBOX_ID} className="text-sm font-medium leading-snug text-[#003049]">
            I agree
          </Label>
        </div>

        <DialogFooter className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-stretch sm:gap-3">
          <Button
            type="button"
            className="h-11 w-full bg-[#F77F00] font-bold text-white hover:bg-[#e07400] disabled:opacity-50"
            disabled={!agreed}
            onClick={() => {
              if (!agreed) return;
              onOpenChange(false);
              onContinue();
            }}
          >
            Continue to checkout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
