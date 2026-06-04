// Connection status indicator. Pulsing red = waiting, solid green = connected.
import { cn } from "@/lib/utils";

export function StatusDot({ connected, label }: { connected: boolean; label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "inline-block w-3.5 h-3.5 rounded-full",
          connected
            ? "bg-[color:var(--success)] animate-pulse-green"
            : "bg-destructive animate-pulse-red",
        )}
        aria-hidden
      />
      {label && (
        <span className={cn("text-sm uppercase tracking-widest", connected ? "text-[color:var(--success)]" : "text-destructive")}>
          {connected ? `${label} · Connected` : `${label} · Waiting`}
        </span>
      )}
    </div>
  );
}
