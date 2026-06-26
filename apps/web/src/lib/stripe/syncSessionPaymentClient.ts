/** After `confirmPayment` succeeds in the browser, mirror webhook finalization (local dev / missed webhooks). */
export async function syncSessionPaymentWithServer(
  paymentIntentId: string,
): Promise<{ ok: true; confirmationNumber: string | null } | { error: string }> {
  const res = await fetch("/api/stripe/sync-session-payment-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentIntentId }),
  });
  let data: unknown = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : "Could not confirm payment on server";
    return { error: msg };
  }
  const confirmationNumber =
    typeof data === "object" &&
    data !== null &&
    "confirmationNumber" in data &&
    (typeof (data as { confirmationNumber: unknown }).confirmationNumber === "string" ||
      (data as { confirmationNumber: unknown }).confirmationNumber === null)
      ? ((data as { confirmationNumber: string | null }).confirmationNumber ?? null)
      : null;
  return { ok: true, confirmationNumber };
}
