/** User-facing copy when email verification could not establish a session. */
export function verifyFailedDescription(reason: string | null | undefined): string {
  switch (reason) {
    case "session_mismatch":
      return (
        "We couldn't finish signing you in from the email link. This usually happens when " +
        "the link is opened in a different browser or app than the one you signed up in " +
        "(for example, your phone's mail app instead of the same browser tab). Your email " +
        "may not be confirmed yet — open the confirmation link in the same browser where you " +
        "signed up, or use \"Resend confirmation email\" below, then try signing in again."
      );
    case "otp_invalid":
      return (
        "That verification link has expired or was already used. Use \"Resend confirmation email\" " +
        "below, then open the new link in the same browser where you signed up."
      );
    case "missing_code":
      return (
        "The verification link is missing required information. Please open it from the " +
        "original email rather than a link preview, or sign in below."
      );
    case "config":
      return "Email verification isn't currently configured on this environment. Please sign in below.";
    default:
      return "We couldn't complete email verification. Please sign in below to continue.";
  }
}

export function stripVerifyFailedSearchParams(url: URL): void {
  url.searchParams.delete("auth");
  url.searchParams.delete("reason");
}
