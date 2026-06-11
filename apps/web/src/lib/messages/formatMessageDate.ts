/** Short date for chat bubbles, e.g. "Apr 2". */
export function formatChatMessageDate(iso: string | undefined | null): string {
  if (iso == null || iso === "") return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}
