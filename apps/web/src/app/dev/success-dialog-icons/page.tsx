import Image from "next/image";
import Link from "next/link";
import { CheckCircle, Sparkles, X } from "lucide-react";
import { PARTY_POPPER_RASTER_MASK_STYLE } from "@/lib/convenePartyPopperRaster";

/**
 * Preview of visuals used on “success” / celebration UI (Lucide SVGs + one PNG asset).
 * Run `npm run dev` → open `/dev/success-dialog-icons`.
 */
export default function SuccessDialogIconsPreviewPage() {
  return (
    <div className="min-h-screen bg-muted/40 px-4 py-10 text-foreground md:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Success dialogue imagery</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Production components use these Lucide icons (bundled SVG) and one raster under{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">public/images/</code>. Emoji render with the OS /
              browser font glyph. Party-popper celebration uses the raster + CSS mask everywhere (not Lucide{" "}
              <code className="text-xs text-foreground">PartyPopper</code>).
            </p>
          </div>
          <Link href="/dev" className="text-sm font-medium text-primary underline underline-offset-2">
            ← /dev
          </Link>
        </div>

        <ul className="grid gap-6 sm:grid-cols-2">
          <li className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lucide · Sparkles</p>
            <div className="mt-4 flex items-center justify-center rounded-lg bg-white py-8">
              <Sparkles className="h-14 w-14 text-[#003049]" strokeWidth={1.35} aria-hidden />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              <code className="text-xs text-foreground">RegistrationSuccessOverlay</code> (learner),{" "}
              <code className="text-xs text-foreground">ExpertRegistrationForm</code> step 1,{" "}
              <code className="text-xs text-foreground">SignUpPageClient</code> wizard step 1
            </p>
          </li>

          <li className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Raster + CSS mask (canonical party popper)
            </p>
            <div className="mt-4 flex flex-col items-center justify-center gap-6 rounded-lg bg-white py-6">
              <div>
                <p className="mb-2 text-center text-[10px] font-medium uppercase text-muted-foreground">Masked div</p>
                <div
                  className="mx-auto h-12 w-12 bg-[#003049] sm:h-14 sm:w-14"
                  style={PARTY_POPPER_RASTER_MASK_STYLE}
                  aria-hidden
                />
              </div>
              <div>
                <p className="mb-2 text-center text-[10px] font-medium uppercase text-muted-foreground">
                  Source file (actual pixels)
                </p>
                <Image
                  src="/images/expert-congratulations-party-popper.png"
                  alt="Party popper congratulations asset"
                  width={120}
                  height={120}
                  className="mx-auto h-auto w-28 object-contain"
                  unoptimized
                />
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              File:{" "}
              <code className="break-all text-xs text-foreground">public/images/expert-congratulations-party-popper.png</code>
              <br />
              Style:{" "}
              <code className="break-all text-xs text-foreground">PARTY_POPPER_RASTER_MASK_STYLE</code> from{" "}
              <code className="text-xs text-foreground">lib/convenePartyPopperRaster.ts</code>. Used in{" "}
              <code className="text-xs text-foreground">RegistrationSuccessOverlay</code> {" "}
              (<code className="text-xs text-foreground">variant=&quot;expert&quot;</code>) and{" "}
              <code className="text-xs text-foreground">session-review-wizard.tsx</code> thank-you step. Do not use Lucide{" "}
              <code className="text-xs text-foreground">PartyPopper</code> for celebration.
            </p>
          </li>

          <li className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lucide · CheckCircle</p>
            <div className="mt-4 flex items-center justify-center rounded-lg bg-white py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle className="h-10 w-10 text-emerald-600" />
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              <code className="text-xs text-foreground">PostRequestDialog</code> (“Posted”),{" "}
              <code className="text-xs text-foreground">ForgotPasswordDialog</code> (“Check your email”),{" "}
              <code className="text-xs text-foreground">ResetPasswordPageClient</code> (“Password updated”). Use{" "}
              <code className="text-xs text-foreground">CheckCircle</code> — not <code className="text-xs text-foreground">CheckCircle2</code> — for
              these success states.
            </p>
          </li>

          <li className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Emoji glyph (no image file)
            </p>
            <div className="mt-4 flex items-center justify-center rounded-lg bg-white py-8">
              <span className="text-5xl leading-none" aria-hidden>
                🎉
              </span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              <code className="text-xs text-foreground">SignUpDialog</code> “Account created”;{" "}
              <code className="text-xs text-foreground">SessionBookingDialog</code> booking paid line
            </p>
          </li>

          <li className="rounded-xl border border-border bg-card p-5 shadow-sm sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Lucide · X (close control on overlays)
            </p>
            <div className="mt-4 flex items-center justify-center rounded-lg bg-white py-8">
              <button
                type="button"
                aria-label="Sample close button styling"
                className="pointer-events-none flex h-10 w-10 items-center justify-center rounded-full border border-[#F77F00] bg-white text-[#003049] shadow-sm"
              >
                <X className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Shown on <code className="text-xs text-foreground">RegistrationSuccessOverlay</code> (and similar wizard
              close buttons)
            </p>
          </li>

          <li className="rounded-xl border border-dashed border-border bg-card/50 p-5 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">No hero icon</p>
            <p className="mt-2 text-sm text-muted-foreground">
              <code className="text-xs text-foreground">SessionPaymentDialog</code> uses only the headline “Payment
              received” after success — no celebratory illustration.
            </p>
          </li>
        </ul>
      </div>
    </div>
  );
}
