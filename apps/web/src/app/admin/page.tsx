import { createServerSupabase } from "@/lib/supabase/server";
import { AdminDashboardClient } from "./AdminDashboardClient";
import { AdminSignInForm } from "./AdminSignInForm";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const configuredAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? null;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const signedInEmail = user?.email?.toLowerCase() ?? null;
  const isAdmin =
    !!signedInEmail && !!configuredAdminEmail && signedInEmail === configuredAdminEmail;

  if (!user) {
    return <AdminSignInForm adminEmailHint={configuredAdminEmail} />;
  }

  if (!isAdmin) {
    return (
      <AdminSignInForm
        adminEmailHint={configuredAdminEmail}
        notAuthorizedEmail={user.email ?? "unknown account"}
      />
    );
  }

  return <AdminDashboardClient adminEmail={user.email ?? configuredAdminEmail ?? ""} />;
}
