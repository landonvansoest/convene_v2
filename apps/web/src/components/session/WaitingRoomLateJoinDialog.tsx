"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  variant: "five_min_info" | "ten_min_action";
  partnerName: string;
  viewerRole: "learner" | "expert";
  reportBusy?: boolean;
  onContinueWaiting: () => void;
  onReportNoShow: () => void;
};

export function WaitingRoomLateJoinDialog({
  open,
  variant,
  partnerName,
  viewerRole,
  reportBusy = false,
  onContinueWaiting,
  onReportNoShow,
}: Props) {
  const isLearner = viewerRole === "learner";

  return (
    <Dialog open={open} onOpenChange={() => onContinueWaiting()}>
      <DialogContent className="max-w-md border-[#003049]/12 sm:max-w-lg">
        {variant === "five_min_info" ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-[#003049]">Session Status</DialogTitle>
              <DialogDescription className="text-left text-sm leading-relaxed text-[#003049]/85">
                It looks like {partnerName} is running late. Please stay on this screen for a few more
                minutes. If {partnerName} hasn&apos;t joined the session 10 minutes after the scheduled
                start time, you will have the option to continue waiting or report a no-show.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                className="bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
                onClick={onContinueWaiting}
              >
                OK
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-[#003049]">Still waiting</DialogTitle>
              <DialogDescription className="text-left text-sm leading-relaxed text-[#003049]/85">
                {isLearner ? (
                  <>
                    It looks like {partnerName} is still behind. You have the option to continue waiting,
                    or report a no-show for a full refund.
                  </>
                ) : (
                  <>
                    It looks like {partnerName} is still behind. You have the option to continue waiting,
                    or report a no-show and receive 50% of the booking fee.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
              <Button
                type="button"
                variant="outline"
                className="w-full border-[#003049]/20"
                disabled={reportBusy}
                onClick={onContinueWaiting}
              >
                Continue waiting
              </Button>
              <Button
                type="button"
                className="w-full bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
                disabled={reportBusy}
                onClick={onReportNoShow}
              >
                {reportBusy ? "Reporting…" : "Report no-show"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
