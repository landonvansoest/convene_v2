/**
 * Avoid leaking Postgres/Stripe internals to clients in production.
 * In development, return the real message for faster debugging.
 */
function devErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) {
      return m;
    }
  }
  return null;
}

export function publicApiError(error: unknown, fallback = "Something went wrong"): string {
  if (process.env.NODE_ENV === "development") {
    return devErrorMessage(error) ?? fallback;
  }
  return fallback;
}
