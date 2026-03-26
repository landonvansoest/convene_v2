"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RespondToRequestDialog } from "@/components/requests/RespondToRequestDialog";

type Req = {
  request_id: string;
  title: string;
  description: string;
  user_id: string;
  response_count: number;
};

type Resp = {
  response_id: string;
  expert_user_id: string;
  message: string;
  responded_at: string;
};

export default function RequestDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [req, setReq] = useState<Req | null>(null);
  const [responses, setResponses] = useState<Resp[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [respondOpen, setRespondOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [rRes, sRes] = await Promise.all([
      fetch(`/api/requests/${encodeURIComponent(id)}`),
      fetch(`/api/requests/${encodeURIComponent(id)}/responses`),
    ]);
    const rJson = await rRes.json();
    const sJson = await sRes.json();
    if (!rRes.ok) {
      setErr(typeof rJson.error === "string" ? rJson.error : "Failed");
      setReq(null);
      return;
    }
    setErr(null);
    setReq(rJson.request as Req);
    if (sRes.ok) {
      setResponses((sJson.responses as Resp[]) ?? []);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-[var(--convene-primary)] px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl">
        <Link href="/requests" className="text-sm text-[var(--convene-hero)] underline">
          ← Requests
        </Link>
        {err ? (
          <p className="mt-4 text-sm text-red-300">{err}</p>
        ) : !req ? (
          <p className="mt-8 text-sm text-white/60">Loading…</p>
        ) : (
          <>
            <h1 className="mt-4 text-2xl font-semibold">{req.title}</h1>
            <p className="mt-4 whitespace-pre-wrap text-sm text-white/80">{req.description}</p>
            <p className="mt-4 text-xs text-white/45">{req.response_count} responses</p>

            <section className="mt-10">
              <h2 className="font-medium text-[var(--convene-hero)]">Responses</h2>
              <ul className="mt-4 space-y-3">
                {responses.map((r) => (
                  <li
                    key={r.response_id}
                    className="rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-sm"
                  >
                    <p className="font-mono text-xs text-white/45">{r.expert_user_id}</p>
                    <p className="mt-2 whitespace-pre-wrap text-white/80">{r.message}</p>
                    <p className="mt-2 text-xs text-white/45">{r.responded_at}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-10 rounded-xl border border-white/15 bg-white/5 p-5">
              <h2 className="font-medium text-[var(--convene-hero)]">Respond as expert</h2>
              <p className="mt-2 text-xs text-white/55">Requires active expert profile. v1-style dialog.</p>
              <RespondToRequestDialog
                open={respondOpen}
                onOpenChange={setRespondOpen}
                requestId={id}
                requestTitle={req.title}
                onSubmitted={() => load()}
              />
              <button
                type="button"
                className="mt-4 rounded-md bg-[var(--convene-hero)] px-4 py-2 text-sm font-medium text-[var(--convene-primary)] hover:opacity-95"
                onClick={() => setRespondOpen(true)}
              >
                Open response dialog
              </button>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
