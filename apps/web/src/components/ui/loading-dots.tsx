import { cn } from "@/lib/utils";

interface LoadingDotsProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  text?: string;
}

export function LoadingDots({ className, size = "md", text }: LoadingDotsProps) {
  const sizeClasses = {
    sm: "h-1.5 w-1.5",
    md: "h-2 w-2",
    lg: "h-3 w-3"
  };

  const gapClasses = {
    sm: "gap-1",
    md: "gap-1.5",
    lg: "gap-2"
  };

  return (
    <div className={cn("flex items-center", gapClasses[size], className)}>
      <style>{`
        @keyframes dot-bounce {
          0%, 80%, 100% {
            transform: scale(0);
            opacity: 0.5;
          }
          40% {
            transform: scale(1);
            opacity: 1;
          }
        }
        .loading-dot {
          animation: dot-bounce 1.4s infinite ease-in-out;
        }
      `}</style>
      <div
        className={cn(
          "rounded-full bg-current loading-dot",
          sizeClasses[size]
        )}
        style={{
          animationDelay: "0ms"
        }}
      />
      <div
        className={cn(
          "rounded-full bg-current loading-dot",
          sizeClasses[size]
        )}
        style={{
          animationDelay: "200ms"
        }}
      />
      <div
        className={cn(
          "rounded-full bg-current loading-dot",
          sizeClasses[size]
        )}
        style={{
          animationDelay: "400ms"
        }}
      />
      {text && (
        <span className="ml-2 text-sm text-muted-foreground">{text}</span>
      )}
    </div>
  );
}

