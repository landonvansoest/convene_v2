type Props = {
  onSkip: () => void;
  className?: string;
};

/** Fixed bottom-right control to dismiss an active dashboard tour. */
export function TourSkipLink({ onSkip, className }: Props) {
  return (
    <button
      type="button"
      className={
        className ??
        "fixed bottom-4 right-4 z-[320] text-sm font-medium text-white/90 underline-offset-2 transition hover:text-white hover:underline sm:bottom-6 sm:right-6"
      }
      onClick={onSkip}
    >
      skip tour
    </button>
  );
}
