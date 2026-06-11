"use client";

import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function MediaTroubleshootCollapsible({
  className,
  open,
  onOpenChange,
}: {
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className={cn("group", className)}
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 py-2 text-left text-sm font-medium text-[#003049] outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#003049]/25 focus-visible:ring-offset-2">
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180"
          aria-hidden
        />
        Troubleshoot
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 pb-1 text-xs leading-relaxed text-[#003049]/85">
        <ul className="list-disc space-y-2 pl-4 marker:text-[#003049]/50">
          <li>
            When your browser asks, choose <strong className="text-[#003049]">Allow</strong> for camera and microphone.
          </li>
          <li>
            If you don’t see a prompt or access stays blocked: use the <strong className="text-[#003049]">lock</strong>{" "}
            or <strong className="text-[#003049]">tune / site settings</strong> icon next to the site address → open{" "}
            <strong className="text-[#003049]">permissions</strong> for this site → set{" "}
            <strong className="text-[#003049]">Camera</strong> and <strong className="text-[#003049]">Microphone</strong>{" "}
            to <strong className="text-[#003049]">Allow</strong> → reload this page and try again.
          </li>
          <li>
            <strong className="text-[#003049]">macOS:</strong> System Settings → Privacy & Security → Camera and
            Microphone → enable your browser. Other apps (Zoom, etc.) can hold the camera until closed.
          </li>
          <li>
            <strong className="text-[#003049]">Windows:</strong> Settings → Privacy → Camera / Microphone → allow
            desktop apps and your browser.
          </li>
          <li>
            Try a normal (non-incognito) window and pause extensions that block media for strict trackers.
          </li>
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
