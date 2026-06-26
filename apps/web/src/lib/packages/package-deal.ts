export type PackageDealDisplayInput = {
  package_deal_enabled?: boolean | null;
  package_require_purchase?: boolean | null;
  package_require_purchase_after_first_session?: boolean | null;
  package_session_count?: number | null;
  package_session_duration_minutes?: number | null;
  package_discount_type?: string | null;
  package_discount_value?: number | string | null;
};

/** Expert advertises multi-session packages on public surfaces. */
export function isSessionPackagesAdvertised(
  input: PackageDealDisplayInput | null | undefined,
): boolean {
  return Boolean(input?.package_deal_enabled);
}

export function expertRequiresPackagePurchase(
  input: PackageDealDisplayInput | null | undefined,
): boolean {
  return Boolean(input?.package_deal_enabled && input?.package_require_purchase);
}

export function expertRequiresPackageAfterFirstSession(
  input: PackageDealDisplayInput | null | undefined,
): boolean {
  return Boolean(
    input?.package_deal_enabled && input?.package_require_purchase_after_first_session,
  );
}

/** Either immediate or after-first package requirement is configured. */
export function expertHasPackagePurchasePolicy(
  input: PackageDealDisplayInput | null | undefined,
): boolean {
  return expertRequiresPackagePurchase(input) || expertRequiresPackageAfterFirstSession(input);
}

/**
 * Whether this learner must have package credits (or buy a package) to book now.
 * Immediate require: always. After-first: only once they have a paid session with the expert.
 */
export function expertRequiresPackagePurchaseForLearner(
  input: PackageDealDisplayInput | null | undefined,
  learnerHasPaidSession: boolean,
): boolean {
  if (expertRequiresPackagePurchase(input)) return true;
  if (expertRequiresPackageAfterFirstSession(input) && learnerHasPaidSession) return true;
  return false;
}

export function packageSessionCount(
  input: PackageDealDisplayInput | null | undefined,
): number | null {
  if (!isSessionPackagesAdvertised(input)) return null;
  const n = Number(input?.package_session_count);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

export function packageSessionDurationMinutes(
  input: PackageDealDisplayInput | null | undefined,
): number | null {
  if (!isSessionPackagesAdvertised(input)) return null;
  const n = Number(input?.package_session_duration_minutes);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

export function requiredPackageSessionCount(
  input: PackageDealDisplayInput | null | undefined,
): number | null {
  if (!expertHasPackagePurchasePolicy(input)) return null;
  return packageSessionCount(input);
}

export function requiredPackageSessionDurationMinutes(
  input: PackageDealDisplayInput | null | undefined,
): number | null {
  if (!expertHasPackagePurchasePolicy(input)) return null;
  return packageSessionDurationMinutes(input);
}

/** e.g. "1-hour", "30 min", "1-hour 30 min" — for booking section copy. */
export function formatPackageDurationForNotice(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}-hour`;
  return `${h}-hour ${m} min`;
}

export function packageBookingNotice(
  sessionCount: number,
  sessionDurationMinutes: number,
  opts: {
    required: boolean;
    requiredAfterFirst?: boolean;
    firstSessionConsultationLength?: string | null;
    firstSessionConsultationPrice?: string | null;
  },
): string {
  const n = Math.max(1, Math.trunc(sessionCount));
  const dur = formatPackageDurationForNotice(sessionDurationMinutes);
  if (opts.required) {
    return `This expert requires purchasing a package of ${n}x ${dur} sessions to book.`;
  }
  if (opts.requiredAfterFirst) {
    const consultLen = opts.firstSessionConsultationLength?.trim();
    const consultPrice = opts.firstSessionConsultationPrice?.trim();
    if (consultLen && consultPrice) {
      return `This expert allows an initial ${consultLen} consultation for ${consultPrice}, then requires purchasing a package of ${n}x ${dur} sessions for additional bookings.`;
    }
    return `After an initial consultation, this expert requires purchasing a package of ${n}x ${dur} sessions for additional bookings.`;
  }
  return `This expert offers a package of ${n}x ${dur} sessions.`;
}

export function formatPackageDurationLabel(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr${h === 1 ? "" : "s"}`;
  return `${h} hr${h === 1 ? "" : "s"} ${m} min`;
}

export function formatPackagePurchaseSummary(
  sessionCount: number,
  sessionDurationMinutes: number,
  expertName: string,
): string {
  const n = Math.max(1, Math.trunc(sessionCount));
  const dur = formatPackageDurationForNotice(sessionDurationMinutes);
  const who = expertName.trim() || "this expert";
  return `${n}x ${dur} sessions with ${who}`;
}

export function packagePurchaseDialogIntro(
  sessionCount: number,
  sessionDurationMinutes: number,
): string {
  const n = Math.max(1, Math.trunc(sessionCount));
  const dur = formatPackageDurationLabel(sessionDurationMinutes);
  return `This Expert Requires purchasing a package of ${n}x ${dur} sessions to book. After your purchase, you will book each session from the expert's available timeslots.`;
}

export type PurchasablePackageLike = {
  package_id: string;
  session_count: number;
  session_duration_minutes: number;
  price_cents: number | null;
  stripe_price_id: string | null;
};

export function isPackagePurchasable(p: PurchasablePackageLike): boolean {
  const hasStripePrice = Boolean(p.stripe_price_id?.trim());
  const hasAmount = p.price_cents != null && Number(p.price_cents) > 0;
  return hasStripePrice || hasAmount;
}

export function selectPackageForPurchase(
  packages: PurchasablePackageLike[],
  sessionCount: number | null,
  sessionDurationMinutes: number | null,
): PurchasablePackageLike | null {
  const purchasable = packages.filter(isPackagePurchasable);
  if (!purchasable.length) return null;
  if (sessionCount != null && sessionDurationMinutes != null) {
    const exact = purchasable.find(
      (p) => p.session_count === sessionCount && p.session_duration_minutes === sessionDurationMinutes,
    );
    if (exact) return exact;
  }
  return purchasable[0] ?? null;
}

export function computePackageListBookingUsd(input: {
  sessionCount: number;
  sessionDurationMinutes: number;
  ratePer15Min: number;
  packageDiscountType?: string | null;
  packageDiscountValue?: number | string | null;
  packagePriceCents?: number | null;
}): { listUsd: number; discountUsd: number; packageUsd: number } {
  const sessions = Math.max(1, Math.trunc(input.sessionCount));
  const dur = Math.max(1, Math.trunc(input.sessionDurationMinutes));
  const rate = Number(input.ratePer15Min);
  const blocksPerSession = dur / 15;
  const listUsdRaw = sessions * blocksPerSession * (Number.isFinite(rate) && rate > 0 ? rate : 0);

  if (input.packagePriceCents != null && Number(input.packagePriceCents) > 0) {
    const packageUsd = Math.round(Number(input.packagePriceCents)) / 100;
    const listUsd = Math.round(listUsdRaw * 100) / 100;
    return {
      listUsd,
      discountUsd: Math.round(Math.max(0, listUsd - packageUsd) * 100) / 100,
      packageUsd: Math.round(packageUsd * 100) / 100,
    };
  }

  let packageUsd = listUsdRaw;
  const v = Number(input.packageDiscountValue);
  if (input.packageDiscountType === "percent" && Number.isFinite(v)) {
    packageUsd = listUsdRaw * (1 - Math.min(100, Math.max(0, v)) / 100);
  } else if (input.packageDiscountType === "fixed_amount" && Number.isFinite(v)) {
    packageUsd = v;
  }

  const listUsd = Math.round(listUsdRaw * 100) / 100;
  const finalPackageUsd = Math.round(Math.max(0, packageUsd) * 100) / 100;
  return {
    listUsd,
    discountUsd: Math.round(Math.max(0, listUsd - finalPackageUsd) * 100) / 100,
    packageUsd: finalPackageUsd,
  };
}
