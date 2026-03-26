import { redirect } from "next/navigation";

type Props = { params: Promise<{ bookingId: string }> };

/** Reminder emails link to `/session/:id`; forward to the video join flow. */
export default async function LegacySessionLink({ params }: Props) {
  const { bookingId } = await params;
  redirect(`/sessions/${bookingId}/join`);
}
