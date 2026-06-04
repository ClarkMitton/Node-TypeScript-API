// SessionEndScreen — shown on all screens when a session ends.
// Displays lesson title, slot completion stats, session duration, and a QR
// code for the feedback form (ms_form_url). After 60 seconds, all screens
// auto-navigate home. TS1 also shows a "Dismiss now" button that broadcasts
// session_dismiss to navigate all screens immediately.

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { broadcast } from "@/lib/realtime";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Props = {
  screen: "host" | "screen1" | "screen2";
  lessonTitle: string | null;
  slotsCompleted: number;
  slotsTotal: number;
  createdAt: string | null;
  endedAt: string | null;
  msFeedbackUrl: string | null;
  channel?: RealtimeChannel;
  onDismiss: () => void;
};

function formatDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return "—";
  const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (isNaN(diffMs) || diffMs < 0) return "—";
  const totalSecs = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

const DISMISS_AFTER_MS = 60_000;

export function SessionEndScreen({
  screen,
  lessonTitle,
  slotsCompleted,
  slotsTotal,
  createdAt,
  endedAt,
  msFeedbackUrl,
  channel,
  onDismiss,
}: Props) {
  const [countdown, setCountdown] = useState(60);

  // Count down and auto-dismiss after 60 s
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          onDismiss();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  // onDismiss is stable from the parent; not adding to deps to avoid restart loops
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TS1: subscribe to session_dismiss from host / other screens.
  // Supabase v2 has no per-handler off(); the parent owns channel lifecycle,
  // and component unmount on dismiss removes the listener with the channel.
  useEffect(() => {
    if (!channel || screen !== "screen1") return;
    channel.on("broadcast", { event: "session_dismiss" }, () => onDismiss());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, screen]);

  const handleDismissNow = () => {
    if (channel) {
      broadcast(channel, { type: "session_dismiss", payload: { ts: Date.now() } });
    }
    onDismiss();
  };

  const duration = formatDuration(createdAt, endedAt);

  return (
    <div className="min-h-screen bg-immersive bg-grid flex flex-col items-center justify-center p-10 animate-slot-in">
      {/* End badge */}
      <div className="text-xs uppercase tracking-[0.5em] text-[color:var(--orange)] mb-4">
        Session ended
      </div>

      {/* Lesson title */}
      <h1 className="text-5xl md:text-7xl font-extrabold text-glow text-center mb-10">
        {lessonTitle ?? "Immersive Learning"}
      </h1>

      {/* Stats row */}
      <div className="flex gap-10 mb-12">
        <StatBlock label="Slots completed" value={`${slotsCompleted} / ${slotsTotal}`} />
        <StatBlock label="Duration" value={duration} />
      </div>

      {/* QR feedback section */}
      <div className="flex flex-col items-center gap-4 mb-12">
        {msFeedbackUrl ? (
          <>
            <div className="text-xs uppercase tracking-[0.4em] text-[color:var(--cyan)] mb-2">
              Scan to give feedback
            </div>
            <div className="bg-white rounded-2xl p-4">
              <QRCodeSVG value={msFeedbackUrl} size={180} />
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">No feedback form configured</div>
        )}
      </div>

      {/* TS1-only dismiss button */}
      {screen === "screen1" && (
        <Button
          onClick={handleDismissNow}
          variant="outline"
          className="h-14 px-10 text-lg uppercase tracking-widest border-[color:var(--orange)] text-[color:var(--orange)] hover:bg-[color:var(--orange)]/10"
        >
          Dismiss now
        </Button>
      )}

      {/* Countdown */}
      <div className="mt-8 text-xs uppercase tracking-widest text-muted-foreground">
        Returning home in {countdown}s
      </div>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
      <div className="text-3xl font-extrabold text-[color:var(--cyan)]">{value}</div>
    </div>
  );
}
