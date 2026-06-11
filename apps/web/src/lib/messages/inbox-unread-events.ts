/**
 * Fired when unread message state may have changed (e.g. thread opened, messages marked read).
 * Site header and dashboard summary listen to stay in sync with the inbox.
 */
export const INBOX_UNREAD_MAY_HAVE_CHANGED = "convene:inbox-unread-may-have-changed";

export function dispatchInboxUnreadMayHaveChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(INBOX_UNREAD_MAY_HAVE_CHANGED));
}

/** Session countdown + expert booking action badges (SiteHeader); use after local booking/payment changes. */
export const HEADER_BADGES_MAY_HAVE_CHANGED = "convene:header-badges-may-have-changed";

export function dispatchHeaderBadgesMayHaveChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(HEADER_BADGES_MAY_HAVE_CHANGED));
}
