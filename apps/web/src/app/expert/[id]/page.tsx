import { redirect } from "next/navigation";

export default function ExpertAliasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Redirect to the v2 route that actually renders the profile.
  return params.then(({ id }) => redirect(`/experts/${id}`));
}

