import { cn } from "@/lib/utils";

type Level = "LOW" | "MEDIUM" | "HIGH" | string | null | undefined;

const MAP: Record<string, string> = {
  HIGH: "bg-[#3d1a1a] text-[#f97583] border border-[#f97583]/30",
  MEDIUM: "bg-[#2d2200] text-[#e3b341] border border-[#e3b341]/30",
  LOW: "bg-[#122d1a] text-[#3fb950] border border-[#3fb950]/30",
};

export function RiskBadge({ level }: { level: Level }) {
  if (!level) return null;
  const cls = MAP[level] ?? "bg-[#161b22] text-[#8b949e]";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", cls)}>
      {level}
    </span>
  );
}
