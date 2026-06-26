/**
 * Verify the hosted email logo is reachable (same URL auth templates should use).
 *
 * Usage (from apps/web):
 *   node scripts/verify-email-logo-url.mjs
 *   node scripts/verify-email-logo-url.mjs https://convene-0626.vercel.app/email/convene_logo.png
 */
const url =
  process.argv[2]?.trim() || "https://convene-0626.vercel.app/email/convene_logo.png";

const res = await fetch(url, { method: "HEAD", redirect: "follow" });
console.log(`URL: ${url}`);
console.log(`Status: ${res.status} ${res.statusText}`);
console.log(`Content-Type: ${res.headers.get("content-type") ?? "(missing)"}`);
console.log(`Content-Length: ${res.headers.get("content-length") ?? "(missing)"}`);

if (!res.ok) {
  console.error("\nFAIL: Logo URL is not reachable. Deploy apps/web/public/email/convene_logo.png first.");
  process.exit(1);
}

const type = res.headers.get("content-type") ?? "";
if (!type.includes("image/png")) {
  console.warn("\nWARN: Expected image/png content-type.");
}

console.log("\nOK: Logo URL is live.");
console.log(
  "\nNote: Supabase Dashboard → Email Templates → Preview will still show a broken image",
);
console.log("for external URLs. That sandbox cannot load remote images. Send a real signup");
console.log("test email and open it in Gmail/Apple Mail to verify the logo.");
