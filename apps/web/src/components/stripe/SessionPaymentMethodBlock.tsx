"use client";

import { PaymentElement, useElements } from "@stripe/react-stripe-js";
import type {
  StripePaymentElement,
  StripePaymentElementChangeEvent,
  StripePaymentElementOptions,
} from "@stripe/stripe-js";
import { CreditCard } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

export type PaymentMethodBrandId = "card" | "paypal" | "apple_pay" | "google_pay" | "cashapp";

function mapStripeElementType(type: string | undefined): PaymentMethodBrandId {
  const t = (type ?? "").toLowerCase();
  if (t === "paypal") return "paypal";
  if (t === "apple_pay" || t === "applepay") return "apple_pay";
  if (t === "google_pay" || t === "googlepay") return "google_pay";
  if (t === "cashapp" || t === "cash_app") return "cashapp";
  return "card";
}

function PaypalMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline text-[15px] font-bold italic leading-none tracking-tight text-[#003087]",
        className,
      )}
      aria-hidden
    >
      Pay
      <span className="text-[#009cde]">Pal</span>
    </span>
  );
}

function ApplePayMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M17.05 12.55c-.03-2.55 2.15-3.8 2.25-3.86-1.23-1.8-3.13-2.04-3.8-2.07-1.62-.16-3.17.96-3.99.96-.83 0-2.1-.94-3.45-.91-1.77.03-3.4 1.03-4.31 2.62-1.84 3.18-.47 7.9 1.32 10.49.88 1.27 1.92 2.7 3.29 2.65 1.32-.05 1.82-.86 3.42-.86 1.6 0 2.05.86 3.45.83 1.43-.02 2.34-1.3 3.22-2.58 1.02-1.48 1.44-2.92 1.45-3-.03-.02-2.78-1.06-2.81-4.23ZM14.53 3.5c.72-.87 1.2-2.08 1.07-3.29-1.03.04-2.28.69-3.02 1.56-.66.76-1.24 1.98-1.08 3.15 1.14.09 2.3-.58 3.03-1.42Z"
      />
    </svg>
  );
}

function GooglePayMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function CashAppMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "text-lg font-bold leading-none text-[#00D632]",
        className,
      )}
      aria-hidden
    >
      $
    </span>
  );
}

type BrandConfig = {
  id: PaymentMethodBrandId;
  label: string;
  shortLabel: string;
  accentClass: string;
  Icon: (props: { className?: string }) => ReactNode;
};

const BRANDS: BrandConfig[] = [
  {
    id: "card",
    label: "Credit or Debit",
    shortLabel: "Credit or Debit",
    accentClass: "text-[#003049]",
    Icon: ({ className }) => (
      <CreditCard className={cn("h-5 w-5 sm:h-6 sm:w-6", className)} strokeWidth={1.75} />
    ),
  },
  {
    id: "paypal",
    label: "PayPal",
    shortLabel: "PayPal",
    accentClass: "text-[#003087]",
    Icon: ({ className }) => (
      <PaypalMark className={cn("scale-90 sm:scale-100", className)} />
    ),
  },
  {
    id: "apple_pay",
    label: "Apple Pay",
    shortLabel: "ApplePay",
    accentClass: "text-[#000]",
    Icon: ({ className }) => <ApplePayMark className={cn("h-5 w-5 sm:h-6 sm:w-6", className)} />,
  },
  {
    id: "google_pay",
    label: "Google Pay",
    shortLabel: "GooglePay",
    accentClass: "text-[#5F6368]",
    Icon: ({ className }) => <GooglePayMark className={cn("h-5 w-5 sm:h-6 sm:w-6", className)} />,
  },
  {
    id: "cashapp",
    label: "Cash App",
    shortLabel: "Cash App",
    accentClass: "text-[#00D632]",
    Icon: ({ className }) => <CashAppMark className={className} />,
  },
];

type Props = {
  options: StripePaymentElementOptions;
  /** Shown when a wallet/method is not enabled on this PaymentIntent — still focuses Stripe UI. */
  unavailableHint?: string;
};

/**
 * Brand strip above the Stripe Payment Element: logo-style buttons focus the embedded form and mirror
 * the active method when Stripe reports changes. Methods must also be enabled server-side on the PI.
 */
export function SessionPaymentMethodBlock({ options, unavailableHint }: Props) {
  const elements = useElements();
  const [active, setActive] = useState<PaymentMethodBrandId>("card");

  const focusPaymentElement = useCallback(() => {
    const el = elements?.getElement(PaymentElement) as StripePaymentElement | null;
    el?.focus();
  }, [elements]);

  const onBrandActivate = useCallback(
    (id: PaymentMethodBrandId) => {
      setActive(id);
      focusPaymentElement();
    },
    [focusPaymentElement],
  );

  const onStripeChange = useCallback((event: StripePaymentElementChangeEvent) => {
    const next = mapStripeElementType(event.value?.type);
    setActive(next);
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">Payment method</p>

      <div
        className="-mx-1 flex flex-nowrap items-stretch justify-between gap-1 overflow-x-auto px-1 py-1 sm:gap-2 [scrollbar-width:thin]"
        role="radiogroup"
        aria-label="Payment method"
      >
        {BRANDS.map((b) => {
          const isActive = active === b.id;
          return (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={b.label}
              title={b.label}
              onClick={() => onBrandActivate(b.id)}
              className={cn(
                "relative flex min-w-0 flex-1 basis-0 flex-col items-center gap-0.5 border-0 border-b-2 border-transparent bg-transparent px-0.5 py-1 text-center transition-colors sm:px-1",
                "rounded-none outline-none focus-visible:ring-2 focus-visible:ring-[#F77F00]/50 focus-visible:ring-offset-2",
                isActive ? "border-b-[#F77F00] opacity-100" : "opacity-65 hover:opacity-100",
              )}
            >
              <span className={cn("flex h-7 shrink-0 items-center justify-center sm:h-8", b.accentClass)}>
                <b.Icon />
              </span>
              <span className="max-w-full whitespace-normal break-words text-[9px] font-medium leading-snug text-muted-foreground sm:text-[10px]">
                {b.shortLabel}
              </span>
            </button>
          );
        })}
      </div>

      {unavailableHint ? (
        <p className="text-xs text-muted-foreground">{unavailableHint}</p>
      ) : null}

      <div className="pt-1">
        <PaymentElement options={options} onChange={onStripeChange} />
      </div>
    </div>
  );
}
