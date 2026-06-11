/** Values match enum `public.expert_visibility_state` (see supabase/v2/022_expert_visibility_state_merge.sql). */
export const EXPERT_VISIBILITY_STATE = {
  VISIBLE_ACTIVE: "visible_active",
  VISIBLE_TEMP: "visible_temp",
  PENDING_ADMIN_REVIEW: "pending_admin_review",
  HIDDEN_INCOMPLETE_FIELDS: "hidden_incomplete_fields",
  HIDDEN_PAYMENT_INCOMPLETE: "hidden_payment_incomplete",
  HIDDEN_UNKNOWN_OR_ERROR: "hidden_unknown_or_error",
  HIDDEN_BY_USER: "hidden_by_user",
} as const;

export type ExpertVisibilityStateValue =
  (typeof EXPERT_VISIBILITY_STATE)[keyof typeof EXPERT_VISIBILITY_STATE];

/** Full public expert profile page (browseable / similar experts). */
export function isExpertProfilePubliclyViewable(state: string | null | undefined): boolean {
  return (
    state === EXPERT_VISIBILITY_STATE.VISIBLE_ACTIVE || state === EXPERT_VISIBILITY_STATE.VISIBLE_TEMP
  );
}

/** Bookings, packages, freelance: only fully approved experts. */
export function isExpertEligibleForCommerce(state: string | null | undefined): boolean {
  return state === EXPERT_VISIBILITY_STATE.VISIBLE_ACTIVE;
}

/** Experts included in homepage grid / GET /api/experts (before rating/session filters). */
export function expertVisibilityStatesForBrowseGrid(s: {
  include_temp: boolean;
  include_pending: boolean;
}): string[] {
  const states: string[] = [EXPERT_VISIBILITY_STATE.VISIBLE_ACTIVE];
  if (s.include_temp) states.push(EXPERT_VISIBILITY_STATE.VISIBLE_TEMP);
  if (s.include_pending) states.push(EXPERT_VISIBILITY_STATE.PENDING_ADMIN_REVIEW);
  return states;
}
