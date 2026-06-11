"use client";

import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ExpertPayoutInformationFields,
  type ExpertPayoutDetailsInput,
} from "@/components/expert/ExpertPayoutInformationFields";
import { PAYMENT_CHECKOUT_DIALOG_CONTENT_CLASS } from "@/components/stripe/checkoutDialogStyles";
import { validateExpertPayoutBankingDetails } from "@/lib/stripe/expertPayoutBankingValidation";
import { cn } from "@/lib/utils";
import { manualInputClass } from "@/lib/profile/registration-profile";

const wizardBodyLead =
  "convene pays out via electronic transfer on a monthly schedule. Enter your information below to receive payments for your coaching sessions.";
const wizardBodySecure = "Your information is stored securely and used only for electronic payments.";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wizard step 7 copy + fields (aligned with onboarding). */
  email: string;
  phoneNumber: string;
  defaultLegalNameFallback: string;
  initialPayout: ExpertPayoutDetailsInput;
  onSave: (next: {
    phoneNumber: string;
    payout: ExpertPayoutDetailsInput;
  }) => void | Promise<void>;
  saving?: boolean;
};

export function ExpertPayoutInformationDialog({
  open,
  onOpenChange,
  email,
  phoneNumber: phoneInitial,
  defaultLegalNameFallback,
  initialPayout,
  onSave,
  saving = false,
}: Props) {
  const [phoneNumber, setPhoneNumber] = useState(phoneInitial);
  const [payout, setPayout] = useState<ExpertPayoutDetailsInput>(initialPayout);
  const [localInvalid, setLocalInvalid] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhoneNumber(phoneInitial);
    setPayout({ ...initialPayout });
    setLocalInvalid([]);
    setLocalError(null);
  }, [open, phoneInitial, initialPayout]);

  async function submit() {
    const v = validateExpertPayoutBankingDetails(phoneNumber, payout);
    if (!v.ok) {
      setLocalInvalid(v.fields);
      setLocalError(v.message);
      return;
    }
    setLocalInvalid([]);
    setLocalError(null);
    try {
      await onSave({ phoneNumber: phoneNumber.trim(), payout });
      onOpenChange(false);
    } catch {
      /* Error surfaced by parent */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(PAYMENT_CHECKOUT_DIALOG_CONTENT_CLASS, "max-h-[min(92vh,720px)]")}
        aria-describedby="expert-payout-dialog-desc"
      >
        <DialogHeader>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#F77F00] text-white shadow-sm [&_svg]:h-5 [&_svg]:w-5">
              <CreditCard className="h-5 w-5" strokeWidth={2.25} aria-hidden />
            </span>
            <div>
              <DialogTitle className="text-left text-2xl font-bold tracking-tight text-[#003049] sm:text-2xl">
                Payout Information
              </DialogTitle>
              <DialogDescription id="expert-payout-dialog-desc" className="mt-3 text-left text-sm font-medium leading-snug text-[#003049]/90">
                {wizardBodyLead}
              </DialogDescription>
              <p className="mt-2 text-left text-sm font-medium leading-snug text-[#003049]/90">{wizardBodySecure}</p>
            </div>
          </div>
        </DialogHeader>

        <ExpertPayoutInformationFields
          email={email}
          phoneNumber={phoneNumber}
          onPhoneNumberChange={(v) => {
            setPhoneNumber(v);
            setLocalInvalid([]);
            setLocalError(null);
          }}
          payout={payout}
          onPayoutChange={(patch) => {
            setPayout((p) => ({ ...p, ...patch }));
            setLocalInvalid([]);
            setLocalError(null);
          }}
          manualInputClass={manualInputClass}
          defaultLegal={defaultLegalNameFallback}
          invalidFieldKeys={localInvalid}
        />

        {localError ? <p className="text-sm text-destructive">{localError}</p> : null}

        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#F77F00] font-semibold text-white hover:bg-[#F77F00]/90"
            disabled={saving}
            onClick={() => void submit()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
