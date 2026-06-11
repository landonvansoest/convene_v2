"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ExpertPayoutDetailsInput = {
  legal_name: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  routing_number: string;
  account_number: string;
  tax_id_last4: string;
};

const payoutInvalidRingClass = "border-2 border-[#F77F00] ring-2 ring-[#F77F00]/25";

type Props = {
  email: string;
  phoneNumber: string;
  onPhoneNumberChange: (v: string) => void;
  payout: ExpertPayoutDetailsInput;
  onPayoutChange: (patch: Partial<ExpertPayoutDetailsInput>) => void;
  manualInputClass: string;
  /** Default shown when legal_name empty (wizard). */
  defaultLegal?: string;
  /** Field keys from `validateExpertPayoutBankingDetails` for ring highlight. */
  invalidFieldKeys?: readonly string[];
};

/**
 * Expert onboarding wizard step 7 / profile payout dialog — same fields and labels.
 */
export function ExpertPayoutInformationFields({
  email,
  phoneNumber,
  onPhoneNumberChange,
  payout,
  onPayoutChange,
  manualInputClass,
  defaultLegal = "",
  invalidFieldKeys,
}: Props) {
  const setPd = onPayoutChange;
  const pd = payout;
  const inv = invalidFieldKeys ?? [];
  const ring = (key: string) => (inv.includes(key) ? payoutInvalidRingClass : undefined);

  return (
    <>
      <div className="mt-4 grid gap-4 sm:mt-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Email</Label>
            <Input value={email} readOnly className={cn(manualInputClass, "bg-[#F8FAFC]")} />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Phone</Label>
            <Input
              value={phoneNumber}
              onChange={(e) => onPhoneNumberChange(e.target.value)}
              placeholder="Phone"
              className={cn(manualInputClass, ring("phone_number"))}
              aria-invalid={inv.includes("phone_number")}
            />
          </div>
        </div>
        <div>
          <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Legal name on account</Label>
          <Input
            value={pd.legal_name || defaultLegal}
            onChange={(e) => setPd({ legal_name: e.target.value })}
            placeholder="Full legal name"
            className={cn(manualInputClass, ring("legal_name"))}
            aria-invalid={inv.includes("legal_name")}
          />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Street address</Label>
          <Input
            value={pd.address_line1}
            onChange={(e) => setPd({ address_line1: e.target.value })}
            placeholder="Address line 1"
            className={cn(manualInputClass, ring("address_line1"))}
            aria-invalid={inv.includes("address_line1")}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-[#003049]">City</Label>
            <Input
              value={pd.city}
              onChange={(e) => setPd({ city: e.target.value })}
              className={cn(manualInputClass, ring("city"))}
              aria-invalid={inv.includes("city")}
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-[#003049]">State / Province</Label>
            <Input
              value={pd.state}
              onChange={(e) => setPd({ state: e.target.value })}
              className={cn(manualInputClass, ring("state"))}
              aria-invalid={inv.includes("state")}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Postal code</Label>
            <Input
              value={pd.postal_code}
              onChange={(e) => setPd({ postal_code: e.target.value })}
              className={cn(manualInputClass, ring("postal_code"))}
              aria-invalid={inv.includes("postal_code")}
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Country</Label>
            <Input
              value={pd.country}
              onChange={(e) => setPd({ country: e.target.value })}
              placeholder="US"
              className={cn(manualInputClass, ring("country"))}
              aria-invalid={inv.includes("country")}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Routing number</Label>
            <Input
              value={pd.routing_number}
              onChange={(e) => setPd({ routing_number: e.target.value })}
              autoComplete="off"
              className={cn(manualInputClass, ring("routing_number"))}
              aria-invalid={inv.includes("routing_number")}
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Account number</Label>
            <Input
              value={pd.account_number}
              onChange={(e) => setPd({ account_number: e.target.value })}
              autoComplete="off"
              className={cn(manualInputClass, ring("account_number"))}
              aria-invalid={inv.includes("account_number")}
            />
          </div>
        </div>
        <div>
          <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Tax ID (last 4 digits, optional)</Label>
          <Input
            value={pd.tax_id_last4}
            onChange={(e) => setPd({ tax_id_last4: e.target.value.replace(/\D/g, "").slice(0, 4) })}
            inputMode="numeric"
            maxLength={4}
            className={cn(manualInputClass, ring("tax_id_last4"))}
            aria-invalid={inv.includes("tax_id_last4")}
          />
        </div>
      </div>
    </>
  );
}
