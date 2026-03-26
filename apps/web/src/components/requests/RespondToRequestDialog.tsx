"use client";

import { FormEvent, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  requestTitle: string;
  onSubmitted: () => void | Promise<void>;
};

export function RespondToRequestDialog({
  open,
  onOpenChange,
  requestId,
  requestTitle,
  onSubmitted,
}: Props) {
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!msg.trim()) return;
    setSending(true);
    setErr(null);
    const res = await fetch(`/api/requests/${encodeURIComponent(requestId)}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg.trim() }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Failed");
      return;
    }
    setMsg("");
    onOpenChange(false);
    await onSubmitted();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setErr(null);
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#003049]">
            <MessageSquare className="h-5 w-5 text-[#F77F00]" />
            Respond to request
          </DialogTitle>
          <DialogDescription className="text-left">
            v1-style dialog. Same API as the inline form on this page. Requires an active expert profile.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm font-medium text-[#003049] line-clamp-2">{requestTitle}</p>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="resp-msg">Your pitch</Label>
            <Textarea
              id="resp-msg"
              rows={5}
              required
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder="How you can help, your approach, and next steps…"
            />
          </div>
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-[#003049] text-white" disabled={sending}>
              {sending ? "Sending…" : "Send response"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
