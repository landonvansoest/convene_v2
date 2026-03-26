import { redirect } from "next/navigation";

export default async function ExpertDashboardRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  // Keep the URL contract: /expert-dashboard uses the same sidebar views as /dashboard.
  const sp = await searchParams;
  const view = sp.view ?? "overview";
  redirect(`/dashboard?view=${encodeURIComponent(view)}`);
}

