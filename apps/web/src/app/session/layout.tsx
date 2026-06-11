/**
 * At least viewport minus sticky header (`h-16`); `flex-1` fills the main column so Daily gets a real height in WebKit + Chrome.
 * Regression guardrail: .cursor/rules/session-live-video-layout.mdc
 */
export default function SessionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100svh-4rem)] w-full min-w-0 flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}
