/**
 * Bible: users.online = true while last user action or heartbeat is within the
 * last 5 minutes. The heartbeat path keeps the boolean rolling and the sweep
 * cron flips stale rows back to false, but read sites should still gate on
 * last_seen_at freshness so badges never lie when the cron lags.
 */
export const ONLINE_FRESH_WINDOW_MS = 5 * 60 * 1000;

export function isUserOnlineFresh(
  online: unknown,
  lastSeenAt: unknown,
  nowMs: number = Date.now(),
): boolean {
  if (!online) return false;
  if (lastSeenAt == null) return false;
  const ts =
    typeof lastSeenAt === "string"
      ? Date.parse(lastSeenAt)
      : lastSeenAt instanceof Date
        ? lastSeenAt.getTime()
        : Number(lastSeenAt);
  if (!Number.isFinite(ts)) return false;
  return nowMs - ts < ONLINE_FRESH_WINDOW_MS;
}
