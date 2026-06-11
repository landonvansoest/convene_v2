"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MediaTroubleshootCollapsible } from "@/components/dashboard/MediaTroubleshootCollapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function stopTracks(stream: MediaStream | null) {
  if (!stream) return;
  for (const t of stream.getTracks()) {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  }
}

function AudioMeters({ stream }: { stream: MediaStream | null }) {
  const [level, setLevel] = useState(0);
  const [bars, setBars] = useState<number[]>(() => Array(8).fill(0));

  useEffect(() => {
    if (!stream?.getAudioTracks().length) {
      setLevel(0);
      setBars(Array(8).fill(0));
      return;
    }

    let ctx: AudioContext | null = null;
    let raf = 0;
    let lastUi = 0;

    try {
      ctx = new AudioContext();
      void ctx.resume().catch(() => {});
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser);

      const td = new Uint8Array(analyser.fftSize);
      const fd = new Uint8Array(analyser.frequencyBinCount);

      function tick(now: number) {
        raf = requestAnimationFrame(tick);
        analyser.getByteTimeDomainData(td);
        let sum = 0;
        for (let i = 0; i < td.length; i++) {
          const v = (td[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / td.length);

        analyser.getByteFrequencyData(fd);
        const n = 8;
        const step = Math.max(1, Math.floor(fd.length / n));
        const nextBars = Array.from({ length: n }, (_, i) => {
          let m = 0;
          const base = i * step;
          for (let j = 0; j < step && base + j < fd.length; j++) {
            m = Math.max(m, fd[base + j]! / 255);
          }
          return m;
        });

        if (now - lastUi >= 48) {
          lastUi = now;
          setLevel(Math.min(1, rms * 5));
          setBars(nextBars);
        }
      }
      raf = requestAnimationFrame(tick);
    } catch {
      setLevel(0);
      setBars(Array(8).fill(0));
    }

    return () => {
      cancelAnimationFrame(raf);
      void ctx?.close();
    };
  }, [stream]);

  const hasMic = stream?.getAudioTracks().some((t) => t.readyState === "live");

  return (
    <div className="space-y-3 rounded-lg border border-[#003049]/10 bg-[#003049]/[0.03] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#003049]/70">Audio input</p>
      {!hasMic ? (
        <p className="text-xs text-muted-foreground">No microphone track active.</p>
      ) : (
        <>
          <div>
            <div className="mb-1 flex justify-between text-[10px] text-[#003049]/60">
              <span>Level</span>
              <span>{level > 0.02 ? "Sound detected" : "Speak to test — idle"}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#003049]/10">
              <div
                className="h-full rounded-full bg-[#F77F00] transition-[width] duration-75"
                style={{ width: `${Math.round(level * 100)}%` }}
              />
            </div>
          </div>
          <div className="flex h-14 items-end gap-1">
            {bars.map((b, i) => (
              <div
                key={i}
                className="flex h-full min-h-0 min-w-0 flex-1 flex-col justify-end rounded-sm bg-[#003049]/15"
              >
                <div
                  className="w-full rounded-sm bg-[#4c8077] transition-[height] duration-75"
                  style={{ height: `${Math.max(10, Math.round(b * 100))}%` }}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type Phase = "loading" | "live" | "error";

export function MediaDeviceTestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [troubleshootOpen, setTroubleshootOpen] = useState(false);
  const runIdRef = useRef(0);

  const cleanup = useCallback(() => {
    stopTracks(streamRef.current);
    streamRef.current = null;
    setLiveStream(null);
    const v = videoRef.current;
    if (v) v.srcObject = null;
  }, []);

  useEffect(() => {
    if (!open) {
      cleanup();
      setErrMsg(null);
      setPhase("loading");
      setTroubleshootOpen(false);
    }
  }, [open, cleanup]);

  useEffect(() => {
    if (!open) return;
    const runId = ++runIdRef.current;
    setErrMsg(null);
    setPhase("loading");
    setLiveStream(null);

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPhase("error");
      setErrMsg("Camera and microphone are not available in this browser or context.");
      return;
    }

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: true,
        });
        if (runId !== runIdRef.current) {
          stopTracks(stream);
          return;
        }
        streamRef.current = stream;
        setLiveStream(stream);
        setPhase("live");
      } catch (e) {
        if (runId !== runIdRef.current) return;
        stopTracks(streamRef.current);
        streamRef.current = null;
        setPhase("error");
        const name = e instanceof DOMException ? e.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setErrMsg("Access was blocked. Use Troubleshoot below, then try again.");
        } else {
          setErrMsg(e instanceof Error ? e.message : "Could not access devices.");
        }
      }
    })();
  }, [open]);

  useLayoutEffect(() => {
    if (phase !== "live" || !streamRef.current) return;
    const v = videoRef.current;
    const s = streamRef.current;
    if (!v || !s) return;
    v.srcObject = s;
    void v.play().catch(() => {});
  }, [phase]);

  function handleOpenChange(next: boolean) {
    if (!next) cleanup();
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md border-[#003049]/15 bg-white">
        <DialogHeader>
          <DialogTitle className="text-[#003049]">Test camera and microphone</DialogTitle>
        </DialogHeader>

        {phase === "loading" ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-[#003049]" aria-hidden />
            Requesting camera and microphone…
          </div>
        ) : null}

        {phase === "error" && errMsg ? (
          <p className="text-sm text-red-600" role="alert">
            {errMsg}
          </p>
        ) : null}

        {phase === "live" && liveStream ? (
          <div className="space-y-4">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
                autoPlay
                aria-label="Camera preview"
              />
            </div>
            <p className="text-center text-xs text-[#003049]/70">
              Preview is muted to prevent echo; meters reflect your microphone only.
            </p>
            <AudioMeters stream={liveStream} />
          </div>
        ) : null}

        <MediaTroubleshootCollapsible open={troubleshootOpen} onOpenChange={setTroubleshootOpen} />

        {(phase === "live" || phase === "error") && (
          <div className="flex justify-center pt-1">
            <Button
              type="button"
              className="border-0 bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
              onClick={() => handleOpenChange(false)}
            >
              {phase === "error" ? "Close" : "Done"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
