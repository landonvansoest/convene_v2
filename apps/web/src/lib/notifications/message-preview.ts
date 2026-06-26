/** Max chars of DM body injected into email `{{message_preview}}`. SMS is capped separately in dispatch. */
export const MESSAGE_EMAIL_PREVIEW_MAX_LEN = 800;

export function messagePreviewForEmail(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  if (trimmed.length <= MESSAGE_EMAIL_PREVIEW_MAX_LEN) return trimmed;
  return `${trimmed.slice(0, MESSAGE_EMAIL_PREVIEW_MAX_LEN).trim()}…`;
}
