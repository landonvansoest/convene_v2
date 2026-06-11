const DAILY_API_BASE = "https://api.daily.co/v1";

async function dailyFetch(path: string, init: RequestInit, apiKey: string) {
  return fetch(`${DAILY_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export type EnsureDailyRoomResult = { roomUrl: string; roomName: string };

/**
 * Create Daily room if missing; return join URL for the org domain.
 */
export async function ensureDailyRoom(opts: {
  apiKey: string;
  dailyDomain: string;
  roomName: string;
  expSeconds?: number;
}): Promise<EnsureDailyRoomResult> {
  const { apiKey, dailyDomain, roomName, expSeconds } = opts;

  /** Daily Prebuilt lobby (“Are you ready to join?”) — disable so join goes straight in. */
  const prebuiltProps = {
    enable_prejoin_ui: false,
    /** In-call chat panel (Prebuilt tray). */
    enable_chat: true,
    /** Screen share button in Prebuilt + getDisplayMedia in the call. */
    enable_screenshare: true,
  };

  let room: unknown = null;
  const getResp = await dailyFetch(`/rooms/${encodeURIComponent(roomName)}`, { method: "GET" }, apiKey);
  if (getResp.ok) {
    room = await getResp.json();
  } else if (getResp.status !== 404) {
    const details = await getResp.text();
    throw new Error(`Failed to query Daily rooms: ${details}`);
  }

  if (!room) {
    const exp =
      Math.floor(Date.now() / 1000) +
      (expSeconds && expSeconds > 0 ? expSeconds : 24 * 60 * 60);

    const createResp = await dailyFetch(
      "/rooms",
      {
        method: "POST",
        body: JSON.stringify({
          name: roomName,
          privacy: "public",
          properties: { exp, ...prebuiltProps },
        }),
      },
      apiKey
    );

    if (!createResp.ok) {
      const details = await createResp.text();
      throw new Error(`Failed to create Daily room: ${details}`);
    }
  } else {
    const updateResp = await dailyFetch(
      `/rooms/${encodeURIComponent(roomName)}`,
      {
        method: "POST",
        body: JSON.stringify({
          properties: { ...prebuiltProps },
        }),
      },
      apiKey
    );
    if (!updateResp.ok) {
      const details = await updateResp.text();
      console.warn(`[daily] could not update room ${roomName} (prejoin UI may still show): ${details}`);
    }
  }

  return {
    roomName,
    roomUrl: `https://${dailyDomain}/${roomName}`,
  };
}
