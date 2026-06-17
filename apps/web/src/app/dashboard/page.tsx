import { redirect } from "next/navigation";
import { loadDashboardBootstrap } from "@/lib/dashboard/load-dashboard-bootstrap";
import {
  isLearnerRegistrationComplete,
  LEARNER_REGISTRATION_WIZARD_PATH,
} from "@/lib/auth/learner-registration";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const viewRaw = sp.view;
  const initialView = typeof viewRaw === "string" && viewRaw ? viewRaw : "overview";
  const showRegistrationSuccess = sp.registrationComplete === "1";
  const showExpertRegistrationSuccess = sp.expertRegistrationComplete === "1";

  const bootstrap = await loadDashboardBootstrap();

  if (
    bootstrap.kind === "authed" &&
    !isLearnerRegistrationComplete(bootstrap.profile)
  ) {
    redirect(LEARNER_REGISTRATION_WIZARD_PATH);
  }

  return (
    <DashboardClient
      bootstrap={bootstrap}
      initialView={initialView}
      showRegistrationSuccess={showRegistrationSuccess}
      showExpertRegistrationSuccess={showExpertRegistrationSuccess}
    />
  );
}
