"use client";

import { useParams } from "next/navigation";
import { SessionRoomClient } from "./SessionRoomClient";

export default function SessionRoomPage() {
  const params = useParams();
  const bookingId = typeof params.bookingId === "string" ? params.bookingId : "";

  if (!bookingId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center text-sm text-destructive">Invalid session link.</div>
    );
  }

  return <SessionRoomClient bookingId={bookingId} />;
}
