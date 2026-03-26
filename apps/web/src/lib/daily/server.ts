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
          properties: { exp },
        }),
      },
      apiKey
    );

    if (!createResp.ok) {
      const details = await createResp.text();
      throw new Error(`Failed to create Daily room: ${details}`);
    }
  }

  return {
    roomName,
    roomUrl: `https://${dailyDomain}/${roomName}`,
  };
}
