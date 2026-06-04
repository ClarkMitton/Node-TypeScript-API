// Student Touch Screen 1 — /screen/1
// Code entry → session content. Fullscreen on join.
// Goes fullscreen immediately on code entry. Shows "Host away" overlay if host hides the app.
// Step 13: Blocks joining if session is already in one_screen_mode.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sessionChannel } from "@/lib/realtime";
import { sounds } from "@/lib/audio";
import { CodeEntry } from "@/components/CodeEntry";
import { SlotRenderer, type SlotContent } from "@/components/SlotRenderer";
import { SessionEndScreen } from "@/components/SessionEndScreen";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const Route = createFileRoute("/screen/1")({
  head: () => ({ meta: [{ title: "Student Touch Screen 1 · Immersive Learning" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : undefined,
  }),
  component: Screen1RouteComponent,
});

function Screen1RouteComponent() {
  const { code } = Route.useSearch();
  return <ScreenJoin role="screen1" autoCode={code} />;
}

type SessionRow = {
  id: string;
  lesson_id: string | null;
  status: "waiting" | "active" | "ended";
  one_screen_mode: boolean;
  current_slot_index: number;
  created_at: string;
  ended_at: string | null;
  state: {
    slot?: { host?: SlotContent; screen1?: SlotContent; screen2?: SlotContent };
    indices?: { host?: number; screen1?: number; screen2?: number };
    screen_delay_secs?: number;
  };
  screen1_connected: boolean;
  screen2_connected: boolean;
};

type LessonMeta = {
  title: string;
  ms_form_url: string | null;
  slot_count: number;
};

export function ScreenJoin({ role, autoCode }: { role: "screen1" | "screen2"; autoCode?: string }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoJoinedRef = useRef(false);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [lessonMeta, setLessonMeta] = useState<LessonMeta | null>(null);
  const [hostPaused, setHostPaused] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const codeColumn = role === "screen1" ? "screen1_code" : "screen2_code";
  const connectedColumn = role === "screen1" ? "screen1_connected" : "screen2_connected";
  const label = role === "screen1" ? "Touch Screen 1" : "Touch Screen 2";

  const markConnected = useCallback(
    async (id: string) => {
      await supabase
        .from("sessions")
        .update({ [connectedColumn]: true } as never)
        .eq("id", id);
    },
    [connectedColumn],
  );

  const join = async (code: string) => {
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("sessions")
      .select("id, status, one_screen_mode")
      .eq(codeColumn, code)
      .neq("status", "ended")
      .maybeSingle();
    if (err || !data) {
      setBusy(false);
      setError("Code not recognised");
      return;
    }
    // Step 13: block TS2 joining an active one_screen_mode session
    if (role === "screen2" && data.one_screen_mode && data.status === "active") {
      setBusy(false);
      setError("one_screen_mode");
      return;
    }
    const { error: upErr } = await supabase
      .from("sessions")
      .update({ [connectedColumn]: true } as never)
      .eq("id", data.id);
    if (upErr) {
      setBusy(false);
      setError("Could not connect — try again");
      return;
    }
    sounds.connect();
    setSessionId(data.id);
    setBusy(false);
    // Go fullscreen immediately — must be called within a user gesture chain
    document.documentElement.requestFullscreen().catch(() => {});
  };

  // Auto-join via ?code= URL param (used by admin Test Mode)
  useEffect(() => {
    if (autoCode && !sessionId && !autoJoinedRef.current) {
      autoJoinedRef.current = true;
      join(autoCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCode]);

  // Subscribe once joined
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("sessions").select("*").eq("id", sessionId).single();
      if (!cancelled && data) setSession(data as SessionRow);
    })();
    const ch = sessionChannel(sessionId);
    channelRef.current = ch;
    ch.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
      (payload) => {
        setSession((prev) => {
          const next = payload.new as SessionRow;
          if (prev?.status === "waiting" && next.status === "active") sounds.launch();
          else if (prev && JSON.stringify(prev.state) !== JSON.stringify(next.state))
            sounds.slotAdvance();
          return next;
        });
      },
    );
    ch.on("broadcast", { event: "host_visibility" }, ({ payload }: { payload: { visible: boolean } }) => {
      setHostPaused(!payload.visible);
    });
    ch.subscribe();

    markConnected(sessionId);
    const keepAlive = window.setInterval(() => markConnected(sessionId), 4000);

    return () => {
      cancelled = true;
      window.clearInterval(keepAlive);
      supabase.removeChannel(ch);
    };
  }, [sessionId, connectedColumn, markConnected]);

  // Load lesson metadata when session has a lesson_id
  useEffect(() => {
    if (!session?.lesson_id) return;
    let cancelled = false;
    (async () => {
      const [{ data: lesson }, { count }] = await Promise.all([
        supabase.from("lessons").select("title, ms_form_url").eq("id", session.lesson_id!).single(),
        supabase
          .from("slots")
          .select("id", { count: "exact", head: true })
          .eq("lesson_id", session.lesson_id!)
          .is("session_id", null),
      ]);
      if (cancelled) return;
      if (lesson) {
        setLessonMeta({
          title: (lesson as { title: string; ms_form_url: string | null }).title,
          ms_form_url: (lesson as { title: string; ms_form_url: string | null }).ms_form_url,
          slot_count: count ?? 0,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.lesson_id]);

  // ── Code not recognised — one_screen_mode special case ──
  if (error === "one_screen_mode") {
    return (
      <div className="min-h-screen bg-immersive bg-grid flex flex-col items-center justify-center p-12 text-center">
        <div className="text-xs uppercase tracking-[0.5em] text-[color:var(--orange)] mb-6">
          Session in progress
        </div>
        <div className="text-4xl font-extrabold text-glow mb-6">
          Session already running in one-screen mode
        </div>
        <p className="text-muted-foreground text-lg max-w-lg">
          Ask your teacher to start a new session.
        </p>
      </div>
    );
  }

  if (!sessionId) {
    return <CodeEntry screenLabel={label} onSubmit={join} error={error} busy={busy} />;
  }

  if (!session || session.status === "waiting") {
    return (
      <div className="min-h-screen bg-immersive bg-grid flex flex-col items-center justify-center p-10">
        <div className="text-xs uppercase tracking-[0.5em] text-[color:var(--success)] mb-6">
          {label} · Connected
        </div>
        <div className="text-5xl font-extrabold text-glow text-center">
          Waiting for Host to launch…
        </div>
      </div>
    );
  }

  if (session.status === "ended") {
    return (
      <SessionEndScreen
        screen={role as "screen1" | "screen2"}
        lessonTitle={lessonMeta?.title ?? null}
        slotsCompleted={session.current_slot_index}
        slotsTotal={lessonMeta?.slot_count ?? 0}
        createdAt={session.created_at}
        endedAt={session.ended_at}
        msFeedbackUrl={lessonMeta?.ms_form_url ?? null}
        channel={channelRef.current ?? undefined}
        onDismiss={() => window.location.assign("/")}
      />
    );
  }

  return (
    <DelayedScreen
      session={session}
      role={role}
      sessionId={sessionId ?? undefined}
      channel={channelRef.current ?? undefined}
      hostPaused={hostPaused}
    />
  );
}

// ── Delayed screen renderer ───────────────────
// Intercepts slot changes and shows a countdown before revealing new content.

function DelayedScreen({
  session,
  role,
  sessionId,
  channel,
  hostPaused,
}: {
  session: SessionRow;
  role: "screen1" | "screen2";
  sessionId?: string;
  channel?: RealtimeChannel;
  hostPaused: boolean;
}) {
  const [displayedContent, setDisplayedContent] = useState<SlotContent>(() =>
    (role === "screen1" ? session.state?.slot?.screen1 : session.state?.slot?.screen2) ?? { type: "waiting" }
  );
  const [displayedKey, setDisplayedKey] = useState(session.current_slot_index);
  const [countdown, setCountdown] = useState<number | null>(null);

  const prevIndexRef = useRef<number>(-1);
  const pendingContentRef = useRef<SlotContent | null>(null);
  const pendingKeyRef = useRef<number>(0);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
  }, []);

  useEffect(() => {
    if (!session || session.status !== "active") return;

    const roleKey = role === "screen1" ? "screen1" : "screen2";
    const newIndex = session.state?.indices?.[roleKey] ?? session.current_slot_index ?? 0;
    const rawContent =
      (role === "screen1" ? session.state?.slot?.screen1 : session.state?.slot?.screen2) ??
      { type: "waiting" as const };
    const delay = session.state?.screen_delay_secs ?? 0;

    if (prevIndexRef.current === -1) {
      // First render — show content immediately, no countdown
      prevIndexRef.current = newIndex;
      setDisplayedContent(rawContent);
      setDisplayedKey(newIndex);
      return;
    }

    if (newIndex === prevIndexRef.current || delay === 0) {
      // Same slot or no delay — immediate update
      prevIndexRef.current = newIndex;
      setDisplayedContent(rawContent);
      setDisplayedKey(newIndex);
      return;
    }

    // New slot + delay > 0: start countdown
    prevIndexRef.current = newIndex;
    pendingContentRef.current = rawContent;
    pendingKeyRef.current = newIndex;

    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    let remaining = delay;
    setCountdown(remaining);

    countdownTimerRef.current = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(countdownTimerRef.current!);
        countdownTimerRef.current = null;
        setCountdown(null);
        if (pendingContentRef.current !== null) {
          setDisplayedContent(pendingContentRef.current);
          setDisplayedKey(pendingKeyRef.current);
          pendingContentRef.current = null;
        }
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.state, session.status, session.current_slot_index]);

  return (
    <div className="relative">
      <SlotRenderer
        key={displayedKey}
        content={displayedContent}
        screen={role}
        sessionId={sessionId}
        channel={channel}
      />

      {/* Side-screen countdown overlay */}
      {countdown !== null && (
        <div className="fixed inset-0 z-50 bg-immersive bg-grid flex flex-col items-center justify-center animate-slot-in">
          <div
            className={`font-extrabold font-mono leading-none tabular-nums text-glow transition-all duration-300
              ${countdown <= 3 ? "text-[50vw]" : "text-[30vw] opacity-60"}`}
          >
            {countdown}
          </div>
        </div>
      )}

      {/* Host-paused overlay */}
      {hostPaused && countdown === null && (
        <div className="fixed inset-0 z-50 bg-immersive bg-grid flex flex-col items-center justify-center p-10 animate-slot-in">
          <div className="text-xs uppercase tracking-[0.5em] text-[color:var(--orange)] mb-6 animate-pulse">
            Session paused
          </div>
          <div className="text-5xl font-extrabold text-glow text-center">
            Your teacher will be right back…
          </div>
          <div className="mt-8 flex gap-2">
            <span className="w-2 h-2 rounded-full bg-[color:var(--orange)] animate-pulse" />
            <span className="w-2 h-2 rounded-full bg-[color:var(--orange)] animate-pulse [animation-delay:200ms]" />
            <span className="w-2 h-2 rounded-full bg-[color:var(--orange)] animate-pulse [animation-delay:400ms]" />
          </div>
        </div>
      )}
    </div>
  );
}
