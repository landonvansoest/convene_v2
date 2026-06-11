import { redirect } from "next/navigation";

type Props = { params: Promise<{ bookingId: string }> };

/** Legacy join URL — session room lives at `/session/:bookingId`. */
export default async function SessionJoinRedirect({ params }: Props) {
  const { bookingId } = await params;
  redirect(`/session/${bookingId}`);
}
