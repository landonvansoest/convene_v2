import { cn } from "@/lib/utils";

type Position = "top-right" | "bottom-right";

type Props = {
  online: boolean | null | undefined;
  position?: Position;
  className?: string;
};

/**
 * Avatar photos are circles inscribed in a square wrapper. To sit the dot on
 * the outside edge of the circle (1:30 position) rather than overlapping the
 * photo, the dot center must land on the circle's perimeter at 45°:
 *
 *   center = (50% + 50%·cos45°, 50% − 50%·sin45°) ≈ (85.4%, 14.6%)
 *
 * With width 26% (radius 13%), that means right/top offsets ≈ 1.5%.
 */
const POSITION_CLASS: Record<Position, string> = {
  "top-right": "right-[1.5%] top-[1.5%]",
  "bottom-right": "right-[1.5%] bottom-[1.5%]",
};

/**
 * Bible: small green circle to the upper right of a profile photo, shown
 * anywhere a user's avatar appears when users.online = true.
 *
 * Sizing is **proportional** to the closest positioned ancestor (the wrapper
 * around the avatar / photo). A 36×36 header avatar gets a ~9px dot; a 144×144
 * profile photo gets a ~36px dot. Drop this as a sibling of the avatar inside
 * a `relative` wrapper that matches the avatar's box:
 *
 *   <div className="relative h-24 w-24">
 *     <Avatar className="h-full w-full" />
 *     <OnlineDot online={user.online} />
 *   </div>
 */
export function OnlineDot({ online, position = "top-right", className }: Props) {
  if (!online) return null;
  return (
    <span
      aria-label="Online now"
      title="Online now"
      style={{
        width: "26%",
        height: "26%",
        minWidth: "10px",
        minHeight: "10px",
      }}
      className={cn(
        "pointer-events-none absolute rounded-full border-2 border-white bg-convene-online shadow-sm",
        POSITION_CLASS[position],
        className,
      )}
    />
  );
}

type PillProps = {
  online: boolean | null | undefined;
  className?: string;
};

/**
 * "Online now" pill rendered under a profile photo. Uses the Bible's
 * --convene-online (#4e9553) so the badge and the dot read as the same
 * indicator across the app. Returns null when the user is not online.
 */
export function OnlineNowPill({ online, className }: PillProps) {
  if (!online) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-convene-online px-2.5 py-1 text-xs font-semibold text-white shadow-sm",
        className,
      )}
    >
      <span className="h-2 w-2 rounded-full bg-white" />
      Online now
    </span>
  );
}
