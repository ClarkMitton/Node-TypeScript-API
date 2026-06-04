import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sounds } from "@/lib/audio";
import { broadcast } from "@/lib/realtime";
import { Button } from "@/components/ui/button";
import { useWebcamViewer } from "@/hooks/use-webcam-broadcast";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export type SlotContent =
  | { type: "waiting" }
  | { type: "text_slide"; text: string; subtitle?: string; size?: "sm" | "md" | "lg" | "xl" | "2xl"; color?: string }
  | { type: "teacher_note"; text: string; has_reveal_button?: boolean; question_id?: string }
  | { type: "youtube"; url: string }
  | { type: "video_upload"; url: string; file_name?: string; loop?: boolean }
  | { type: "image"; url: string; file_name?: string }
  | { type: "embed"; url: string }
  | { type: "webpage"; url: string }
  | { type: "host_webcam"; with_audio?: boolean }
  | { type: "html_upload"; url: string; file_name?: string }
  | { type: "confidence_checker"; prompt: string; optional_qualitative?: boolean }
  | { type: "wheel_spinner"; items: string[] }
  | { type: "countdown_timer"; label?: string; duration_secs: number }
  | { type: "host_timer"; label?: string; duration_secs: number }
  | { type: "multiple_choice"; id?: string; text: string; options: string[]; correct?: number }
  | { type: "true_or_false"; id?: string; text: string; correct_tf?: boolean }
  | { type: "poll"; id?: string; text: string; options: string[] }
  | { type: "likert"; id?: string; text: string; optional_qualitative?: boolean }
  | { type: string; [k: string]: unknown };

type QuestionContent = Extract<SlotContent,
  | { type: "multiple_choice" }
  | { type: "true_or_false" }
  | { type: "poll" }
  | { type: "likert" }
>;

// ─────────────────────────────────────────────
// MAIN RENDERER
// ─────────────────────────────────────────────

export function SlotRenderer({
  content,
  screen,
  muted = true,
  sessionId,
  slotId,
  channel,
}: {
  content: SlotContent | null | undefined;
  screen: "host" | "screen1" | "screen2";
  muted?: boolean;
  sessionId?: string;
  slotId?: string;
  channel?: RealtimeChannel;
}) {
  if (!content || !content.type) return <Waiting screen={screen} />;

  switch (content.type) {
    case "waiting":
      return <Waiting screen={screen} />;

    case "text_slide": {
      const c = content as Extract<SlotContent, { type: "text_slide" }>;
      const sizeClass =
        c.size === "2xl" ? "text-[13vw]" :
        c.size === "xl"  ? "text-[10vw]" :
        c.size === "lg"  ? "text-[7vw]"  :
        c.size === "md"  ? "text-[5vw]"  :
        c.size === "sm"  ? "text-[3.5vw]": "text-[10vw]";
      return (
        <div
          key={String(c.text) + String(c.subtitle ?? "")}
          className="min-h-screen w-full bg-immersive bg-grid flex items-center justify-center p-12 animate-slot-in"
        >
          <div className="text-center max-w-[90vw]">
            <div className={`${sizeClass} leading-[0.95] font-extrabold text-glow`}
              style={{ color: c.color ?? undefined }}>
              {c.text || ""}
            </div>
            {c.subtitle && (
              <div className="mt-4 text-[3vw] text-muted-foreground font-semibold leading-snug">
                {c.subtitle}
              </div>
            )}
          </div>
        </div>
      );
    }

    case "teacher_note": {
      if (screen !== "host") return <Waiting screen={screen} />;
      const c = content as Extract<SlotContent, { type: "teacher_note" }>;
      return (
        <div className="min-h-screen w-full flex flex-col p-10 animate-slot-in"
          style={{ background: "oklch(0.18 0.06 60)" }}>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-[color:var(--orange)] mb-6">
            <span className="w-2 h-2 rounded-full bg-[color:var(--orange)] animate-pulse shrink-0" />
            Teacher note · visible on Host only
          </div>
          <div className="text-3xl font-bold leading-snug whitespace-pre-wrap flex-1"
            style={{ color: "oklch(0.95 0.08 60)" }}>
            {c.text || ""}
          </div>
          {c.has_reveal_button && (
            <div className="mt-10">
              <Button
                onClick={() => {
                  if (channel) {
                    broadcast(channel, {
                      type: "reveal_results",
                      payload: { slotId: c.question_id ?? slotId ?? "current" },
                    });
                    sounds.questionReveal();
                  }
                }}
                className="h-16 px-10 text-xl uppercase tracking-widest font-extrabold"
              >
                Reveal Results
              </Button>
            </div>
          )}
        </div>
      );
    }

    case "youtube": {
      const c = content as Extract<SlotContent, { type: "youtube" }>;
      if (!c.url) return <Waiting screen={screen} />;
      const videoId = extractYouTubeId(c.url);
      if (!videoId) return <Waiting screen={screen} />;
      const params = screen === "host"
        ? "autoplay=1&rel=0&modestbranding=1"
        : "autoplay=1&mute=1&rel=0&modestbranding=1";
      return (
        <div className="min-h-screen w-full bg-black animate-slot-in">
          <iframe key={videoId + screen}
            src={`https://www.youtube.com/embed/${videoId}?${params}`}
            className="w-full h-screen border-0"
            allow="autoplay; fullscreen" allowFullScreen title="YouTube video" />
        </div>
      );
    }

    case "video_upload": {
      const c = content as Extract<SlotContent, { type: "video_upload" }>;
      if (!c.url) return <Waiting screen={screen} />;
      return (
        <div className="min-h-screen w-full bg-black animate-slot-in">
          <video key={c.url} src={c.url} className="w-full h-screen object-cover"
            autoPlay loop={c.loop !== false} playsInline muted={muted || screen !== "host"} />
        </div>
      );
    }

    case "image": {
      const c = content as Extract<SlotContent, { type: "image" }>;
      if (!c.url) return <Waiting screen={screen} />;
      return (
        <div className="min-h-screen w-full bg-black animate-slot-in">
          <img src={c.url} alt="" className="w-full h-screen object-cover" />
        </div>
      );
    }

    case "embed": {
      const c = content as Extract<SlotContent, { type: "embed" }>;
      if (!c.url) return <Waiting screen={screen} />;
      return (
        <div className="min-h-screen w-full bg-background animate-slot-in">
          <iframe
            key={c.url}
            src={c.url}
            className="w-full h-screen border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; microphone; camera; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            title="Embedded content"
          />
        </div>
      );
    }

    case "html_upload": {
      const c = content as Extract<SlotContent, { type: "html_upload" }>;
      if (!c.url) return <Waiting screen={screen} />;
      return (
        <div className="min-h-screen w-full bg-background animate-slot-in">
          <iframe
            key={c.url}
            src={c.url}
            className="w-full h-screen border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture"
            allowFullScreen
            title="HTML content"
          />
        </div>
      );
    }

    case "webpage": {
      const c = content as Extract<SlotContent, { type: "webpage" }>;
      if (!c.url) return <Waiting screen={screen} />;
      const proxied = `/api/proxy?url=${encodeURIComponent(c.url)}`;
      return (
        <div className="min-h-screen w-full bg-background animate-slot-in">
          <iframe
            key={c.url}
            src={proxied}
            className="w-full h-screen border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture"
            allowFullScreen
            title="Web page"
          />
        </div>
      );
    }

    case "host_webcam": {
      if (!sessionId) return <Waiting screen={screen} />;
      return <HostWebcamViewer sessionId={sessionId} />;
    }

    case "confidence_checker": {
      const c = content as Extract<SlotContent, { type: "confidence_checker" }>;
      if (screen === "screen2")
        return <ConfidenceCheckerTS2 content={c} sessionId={sessionId} slotId={slotId} />;
      if (screen === "host")
        return <ConfidenceCheckerHost sessionId={sessionId} slotId={slotId} />;
      return <Waiting screen={screen} />;
    }

    case "wheel_spinner": {
      const c = content as Extract<SlotContent, { type: "wheel_spinner" }>;
      return <WheelSpinnerRenderer content={c} screen={screen} sessionId={sessionId} />;
    }

    case "countdown_timer": {
      const c = content as Extract<SlotContent, { type: "countdown_timer" }>;
      return <CountdownTimerRenderer content={c} screen={screen} sessionId={sessionId} />;
    }

    case "host_timer": {
      if (screen !== "host") return <Waiting screen={screen} />;
      const c = content as Extract<SlotContent, { type: "host_timer" }>;
      return <HostTimerRenderer content={c} />;
    }

    case "multiple_choice":
    case "true_or_false":
    case "poll":
    case "likert": {
      const c = content as QuestionContent;
      if (screen === "screen2")
        return <QuestionRendererTS2 content={c} sessionId={sessionId} slotId={slotId} />;
      if (screen === "host")
        return <QuestionRendererHost content={c} sessionId={sessionId} />;
      // TS1 content should be set to teacher_note with has_reveal_button by designer
      return <Waiting screen={screen} />;
    }

    default:
      return <Waiting screen={screen} />;
  }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0];
    return null;
  } catch { return null; }
}

// ─────────────────────────────────────────────
// WAITING STATE
// ─────────────────────────────────────────────

function Waiting({ screen }: { screen: "host" | "screen1" | "screen2" }) {
  const label = screen === "host" ? "Host" : screen === "screen1" ? "Touch Screen 1" : "Touch Screen 2";
  return (
    <div className="min-h-screen w-full bg-immersive bg-grid flex flex-col items-center justify-center p-10">
      <div className="text-xs uppercase tracking-[0.5em] text-[color:var(--cyan)] mb-6 animate-float-glow">{label}</div>
      <div className="text-5xl md:text-7xl font-extrabold text-glow text-center max-w-3xl">Standing by</div>
      <div className="mt-8 flex gap-2">
        <span className="w-2 h-2 rounded-full bg-[color:var(--cyan)] animate-pulse" />
        <span className="w-2 h-2 rounded-full bg-[color:var(--cyan)] animate-pulse [animation-delay:200ms]" />
        <span className="w-2 h-2 rounded-full bg-[color:var(--cyan)] animate-pulse [animation-delay:400ms]" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// HOST WEBCAM — viewer side
// ─────────────────────────────────────────────

function HostWebcamViewer({ sessionId }: { sessionId: string }) {
  const { stream, waiting } = useWebcamViewer(sessionId, true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (stream) {
      v.srcObject = stream;
      v.play().catch(() => {});
    } else {
      v.srcObject = null;
    }
  }, [stream]);

  return (
    <div className="min-h-screen w-full bg-black flex items-center justify-center animate-slot-in relative">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-screen object-contain bg-black"
      />
      {waiting && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-immersive bg-grid">
          <div className="text-xs uppercase tracking-[0.5em] text-[color:var(--cyan)] animate-float-glow">
            Host Webcam
          </div>
          <div className="text-3xl md:text-5xl font-extrabold text-glow text-center">
            Waiting for host camera…
          </div>
          <div className="flex gap-2 mt-4">
            <span className="w-2 h-2 rounded-full bg-[color:var(--cyan)] animate-pulse" />
            <span className="w-2 h-2 rounded-full bg-[color:var(--cyan)] animate-pulse [animation-delay:200ms]" />
            <span className="w-2 h-2 rounded-full bg-[color:var(--cyan)] animate-pulse [animation-delay:400ms]" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// SUBMITTED STATE (shared)
// ─────────────────────────────────────────────

function SubmittedState() {
  return (
    <div className="min-h-screen w-full bg-immersive bg-grid flex flex-col items-center justify-center p-10 animate-slot-in">
      <div className="text-xs uppercase tracking-[0.5em] text-[color:var(--success)] mb-6">Response received</div>
      <div className="text-5xl md:text-7xl font-extrabold text-glow text-center">Waiting for next activity…</div>
      <div className="mt-8 flex gap-2">
        <span className="w-2 h-2 rounded-full bg-[color:var(--cyan)] animate-pulse" />
        <span className="w-2 h-2 rounded-full bg-[color:var(--cyan)] animate-pulse [animation-delay:200ms]" />
        <span className="w-2 h-2 rounded-full bg-[color:var(--cyan)] animate-pulse [animation-delay:400ms]" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CONFIDENCE CHECKER — Touch Screen 2
// ─────────────────────────────────────────────

function ConfidenceCheckerTS2({ content, sessionId, slotId }: {
  content: { prompt: string; optional_qualitative?: boolean };
  sessionId?: string; slotId?: string;
}) {
  const [score, setScore] = useState<number | null>(null);
  const [thoughts, setThoughts] = useState<string[]>([]);
  const [newThought, setNewThought] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const addThought = () => {
    const t = newThought.trim();
    if (!t || thoughts.length >= 5) return;
    setThoughts(p => [...p, t]);
    setNewThought("");
  };

  const handleSubmit = async () => {
    if (!score || !sessionId || submitting) return;
    setSubmitting(true);
    await supabase.from("responses").insert({
      session_id: sessionId, slot_id: slotId ?? null, screen_role: "screen2",
      response_type: "confidence_checker", response_data: { score, thoughts } as never,
    });
    setSubmitting(false);
    setSubmitted(true);
  };

  if (submitted) return <SubmittedState />;

  return (
    <div className="min-h-screen w-full bg-immersive bg-grid flex flex-col items-center justify-center p-8 gap-8 animate-slot-in">
      <div className="text-2xl md:text-3xl font-bold text-center max-w-lg leading-snug">
        {content.prompt || "How confident are you?"}
      </div>
      <div className="flex gap-3 md:gap-5">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => setScore(n)}
            className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl text-3xl md:text-4xl font-extrabold border-2 transition-all duration-150 select-none
              ${score === n ? "border-[color:var(--cyan)] bg-[color:var(--cyan)]/20 text-[color:var(--cyan)] scale-110 shadow-[0_0_24px_color-mix(in_oklab,var(--cyan)_40%,transparent)]"
                : "border-border text-muted-foreground hover:border-[color:var(--cyan)]/50 active:scale-95"}`}>
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between w-full max-w-xs text-xs text-muted-foreground uppercase tracking-widest">
        <span>Not at all</span><span>Very confident</span>
      </div>
      {content.optional_qualitative && (
        <div className="w-full max-w-lg space-y-3">
          <div className="text-sm text-muted-foreground uppercase tracking-widest">Add a thought (optional, up to 5)</div>
          {thoughts.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--cyan)] shrink-0" /><span>{t}</span>
            </div>
          ))}
          {thoughts.length < 5 && (
            <div className="flex gap-2">
              <input value={newThought} onChange={e => setNewThought(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addThought(); } }}
                placeholder="Type a thought and press Enter…"
                className="flex-1 bg-background/60 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[color:var(--cyan)]" />
              <button onClick={addThought} className="px-4 py-3 border border-border rounded-xl text-sm hover:border-[color:var(--cyan)]">+</button>
            </div>
          )}
        </div>
      )}
      <Button onClick={handleSubmit} disabled={!score || submitting}
        className="h-14 px-12 text-lg uppercase tracking-widest font-extrabold disabled:opacity-30">
        {submitting ? "Submitting…" : "Submit"}
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────
// CONFIDENCE CHECKER — Host (live aggregate)
// ─────────────────────────────────────────────

function ConfidenceCheckerHost({ sessionId, slotId }: { sessionId?: string; slotId?: string }) {
  const [scores, setScores] = useState<number[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      let q = supabase.from("responses").select("response_data")
        .eq("session_id", sessionId).eq("response_type", "confidence_checker");
      if (slotId) q = q.eq("slot_id", slotId);
      const { data } = await q;
      if (data) setScores(data.map(r => ((r.response_data as { score?: number }) ?? {}).score).filter((s): s is number => typeof s === "number"));
    })();
    const ch = supabase.channel(`cc:${sessionId}`);
    ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "responses", filter: `session_id=eq.${sessionId}` },
      (payload) => {
        const row = payload.new as { response_type: string; response_data: { score: number } };
        if (row.response_type === "confidence_checker" && row.response_data?.score)
          setScores(p => [...p, row.response_data.score]);
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId, slotId]);

  const counts = [1, 2, 3, 4, 5].map(n => scores.filter(s => s === n).length);
  const maxCount = Math.max(...counts, 1);
  const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";
  const barColors = ["var(--destructive)", "var(--orange)", "oklch(0.82 0.18 80)", "oklch(0.75 0.18 150)", "var(--success)"];

  return (
    <div className="min-h-screen w-full bg-immersive bg-grid flex flex-col items-center justify-center p-12 gap-10 animate-slot-in">
      <div className="text-xs uppercase tracking-[0.4em] text-[color:var(--cyan)]">Confidence Checker · Live</div>
      <div className="flex items-end gap-6 md:gap-10 h-48">
        {[1, 2, 3, 4, 5].map((n, i) => {
          const h = counts[i] === 0 ? 4 : Math.max(12, (counts[i] / maxCount) * 176);
          return (
            <div key={n} className="flex flex-col items-center gap-2">
              <span className="text-2xl font-extrabold">{counts[i]}</span>
              <div className="w-14 md:w-20 rounded-t-xl transition-all duration-700" style={{ height: `${h}px`, background: barColors[i] }} />
              <span className="text-xl font-bold" style={{ color: barColors[i] }}>{n}</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-16 text-center">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Responses</div>
          <div className="text-6xl font-extrabold text-glow">{scores.length}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Average</div>
          <div className="text-6xl font-extrabold text-[color:var(--cyan)]">{avg}</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// WHEEL SPINNER
// ─────────────────────────────────────────────

const WHEEL_COLORS = ["var(--cyan)", "var(--orange)", "var(--success)", "oklch(0.72 0.18 300)", "oklch(0.82 0.18 80)"];

function WheelSpinnerRenderer({ content, screen, sessionId }: {
  content: { items: string[] }; screen: "host" | "screen1" | "screen2"; sessionId?: string;
}) {
  const items = (content.items ?? []).filter(Boolean);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const spinningRef = useRef(false);
  const baseRotationRef = useRef(0);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const triggerSpin = useCallback((spinItems: string[], winner: string) => {
    if (spinningRef.current || spinItems.length === 0) return;
    spinningRef.current = true;
    setResult(null);
    setSpinning(true);
    const sectorDeg = 360 / spinItems.length;
    const winIdx = Math.max(0, spinItems.indexOf(winner));
    const winnerCenter = winIdx * sectorDeg + sectorDeg / 2;
    const targetMod = (360 - winnerCenter + 360) % 360;
    const currentMod = baseRotationRef.current % 360;
    const delta = ((targetMod - currentMod) + 360) % 360;
    baseRotationRef.current = baseRotationRef.current + 360 * 5 + delta;
    setRotation(baseRotationRef.current);
    setTimeout(() => {
      spinningRef.current = false;
      setSpinning(false);
      setResult(winner);
      sounds.questionReveal();
      setTimeout(() => setResult(null), 3000);
    }, 4000);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    const ch = supabase.channel(`whl:${sessionId}`, { config: { broadcast: { self: true } } });
    channelRef.current = ch;
    ch.on("broadcast", { event: "wheel_spin" },
      ({ payload }: { payload: { items: string[]; result: string } }) => {
        triggerSpin(payload.items, payload.result);
      }).subscribe();
    return () => { supabase.removeChannel(ch); channelRef.current = null; };
  }, [sessionId, triggerSpin]);

  const handleSpin = () => {
    if (spinning || items.length === 0 || !channelRef.current) return;
    const winner = items[Math.floor(Math.random() * items.length)];
    channelRef.current.send({ type: "broadcast", event: "wheel_spin", payload: { items, result: winner } });
  };

  const sectorDeg = items.length > 0 ? 360 / items.length : 360;
  const conicParts = items.length > 0
    ? items.map((_, i) => `${WHEEL_COLORS[i % WHEEL_COLORS.length]} ${i * sectorDeg}deg ${(i + 1) * sectorDeg}deg`).join(", ")
    : "var(--muted) 0deg 360deg";

  return (
    <div className="min-h-screen w-full bg-immersive bg-grid flex flex-col items-center justify-center gap-8 animate-slot-in">
      <div className="relative">
        <div className="absolute left-1/2 -translate-x-1/2 z-10 text-4xl leading-none select-none"
          style={{ top: "-28px", filter: "drop-shadow(0 2px 10px color-mix(in oklab, var(--cyan) 60%, transparent))" }}>▼</div>
        <div className="w-72 h-72 md:w-[400px] md:h-[400px] rounded-full relative"
          style={{
            background: `conic-gradient(${conicParts})`,
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
            boxShadow: "0 0 60px color-mix(in oklab, var(--cyan) 30%, transparent), 0 0 120px color-mix(in oklab, var(--cyan) 15%, transparent)",
          }}>
          {items.map((item, i) => {
            const angle = i * sectorDeg + sectorDeg / 2;
            const rad = ((angle - 90) * Math.PI) / 180;
            const x = 50 + 35 * Math.cos(rad);
            const y = 50 + 35 * Math.sin(rad);
            return (
              <span key={i} className="absolute text-[10px] md:text-xs font-extrabold text-white leading-none text-center pointer-events-none"
                style={{ left: `${x}%`, top: `${y}%`, maxWidth: "60px", transform: `translate(-50%, -50%) rotate(${angle}deg)`, textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
                {item.length > 10 ? item.slice(0, 10) + "…" : item}
              </span>
            );
          })}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-background border-[3px] border-[color:var(--cyan)]" />
          </div>
        </div>
      </div>
      {result && (
        <div className="animate-slot-in text-center">
          <div className="text-xs uppercase tracking-[0.4em] text-[color:var(--orange)] mb-2">Result</div>
          <div className="text-5xl md:text-7xl font-extrabold text-glow">{result}</div>
        </div>
      )}
      {screen === "host" && (
        <Button onClick={handleSpin} disabled={spinning || items.length === 0}
          className="h-16 px-14 text-xl uppercase tracking-widest font-extrabold disabled:opacity-30">
          {spinning ? "Spinning…" : "Spin"}
        </Button>
      )}
      {items.length === 0 && <div className="text-sm text-muted-foreground uppercase tracking-widest">No items configured</div>}
    </div>
  );
}

// ─────────────────────────────────────────────
// QUESTION — Touch Screen 2
// ─────────────────────────────────────────────

function QuestionRendererTS2({ content, sessionId, slotId }: {
  content: QuestionContent; sessionId?: string; slotId?: string;
}) {
  const [answer, setAnswer] = useState<number | string | null>(null);
  const [thoughts, setThoughts] = useState<string[]>([]);
  const [newThought, setNewThought] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const addThought = () => {
    const t = newThought.trim();
    if (!t || thoughts.length >= 5) return;
    setThoughts(p => [...p, t]);
    setNewThought("");
  };

  const handleSubmit = async () => {
    if (answer === null || !sessionId || submitting) return;
    setSubmitting(true);
    await supabase.from("responses").insert({
      session_id: sessionId, slot_id: slotId ?? null, screen_role: "screen2",
      response_type: "question",
      response_data: { type: content.type, answer, questionId: content.id ?? "unknown", thoughts: content.type === "likert" ? thoughts : undefined } as never,
    });
    setSubmitting(false);
    setSubmitted(true);
  };

  if (submitted) return <SubmittedState />;

  // True / False
  if (content.type === "true_or_false") {
    return (
      <div className="min-h-screen w-full bg-immersive bg-grid flex flex-col items-center justify-center p-8 gap-8 animate-slot-in">
        <div className="text-2xl md:text-3xl font-bold text-center max-w-lg">{(content as { text: string }).text || "True or False?"}</div>
        <div className="flex gap-6">
          {(["true", "false"] as const).map(v => (
            <button key={v} onClick={() => setAnswer(v)}
              className={`w-36 h-20 rounded-2xl text-2xl font-extrabold border-2 uppercase tracking-widest transition-all duration-150
                ${answer === v ? "border-[color:var(--cyan)] bg-[color:var(--cyan)]/20 text-[color:var(--cyan)] scale-105" : "border-border text-muted-foreground hover:border-[color:var(--cyan)]/50"}`}>
              {v}
            </button>
          ))}
        </div>
        <Button onClick={handleSubmit} disabled={answer === null || submitting}
          className="h-14 px-12 text-lg uppercase tracking-widest font-extrabold disabled:opacity-30">
          {submitting ? "Submitting…" : "Submit"}
        </Button>
      </div>
    );
  }

  // Likert
  if (content.type === "likert") {
    const lc = content as Extract<QuestionContent, { type: "likert" }>;
    return (
      <div className="min-h-screen w-full bg-immersive bg-grid flex flex-col items-center justify-center p-8 gap-8 animate-slot-in">
        <div className="text-2xl md:text-3xl font-bold text-center max-w-lg">{lc.text || "Rate your understanding"}</div>
        <div className="flex gap-3 md:gap-5">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setAnswer(n)}
              className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl text-3xl md:text-4xl font-extrabold border-2 transition-all duration-150 select-none
                ${answer === n ? "border-[color:var(--cyan)] bg-[color:var(--cyan)]/20 text-[color:var(--cyan)] scale-110" : "border-border text-muted-foreground hover:border-[color:var(--cyan)]/50"}`}>
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between w-full max-w-xs text-xs text-muted-foreground uppercase tracking-widest">
          <span>Disagree</span><span>Agree</span>
        </div>
        {lc.optional_qualitative && (
          <div className="w-full max-w-lg space-y-3">
            <div className="text-sm text-muted-foreground uppercase tracking-widest">Add a thought (optional)</div>
            {thoughts.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--cyan)] shrink-0" /><span>{t}</span>
              </div>
            ))}
            {thoughts.length < 5 && (
              <div className="flex gap-2">
                <input value={newThought} onChange={e => setNewThought(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addThought(); } }}
                  placeholder="Type a thought…"
                  className="flex-1 bg-background/60 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[color:var(--cyan)]" />
                <button onClick={addThought} className="px-4 py-3 border border-border rounded-xl text-sm hover:border-[color:var(--cyan)]">+</button>
              </div>
            )}
          </div>
        )}
        <Button onClick={handleSubmit} disabled={answer === null || submitting}
          className="h-14 px-12 text-lg uppercase tracking-widest font-extrabold disabled:opacity-30">
          {submitting ? "Submitting…" : "Submit"}
        </Button>
      </div>
    );
  }

  // Multiple choice / poll
  const opts = (content as { options?: string[] }).options ?? [];
  return (
    <div className="min-h-screen w-full bg-immersive bg-grid flex flex-col items-center justify-center p-8 gap-6 animate-slot-in">
      <div className="text-2xl md:text-3xl font-bold text-center max-w-lg">{(content as { text: string }).text || "Question"}</div>
      <div className="flex flex-col gap-3 w-full max-w-lg">
        {opts.map((opt, i) => (
          <button key={i} onClick={() => setAnswer(i)}
            className={`w-full px-6 py-4 rounded-2xl text-left text-lg font-semibold border-2 transition-all duration-150
              ${answer === i ? "border-[color:var(--cyan)] bg-[color:var(--cyan)]/20 text-[color:var(--cyan)]" : "border-border text-foreground hover:border-[color:var(--cyan)]/50"}`}>
            <span className="mr-3 text-muted-foreground font-bold">{String.fromCharCode(65 + i)}.</span>{opt}
          </button>
        ))}
      </div>
      <Button onClick={handleSubmit} disabled={answer === null || submitting}
        className="h-14 px-12 text-lg uppercase tracking-widest font-extrabold disabled:opacity-30">
        {submitting ? "Submitting…" : "Submit"}
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────
// QUESTION — Host (live count → animated results)
// ─────────────────────────────────────────────

type ResponseRow = { response_data: { answer: number | string; thoughts?: string[] } };

function QuestionRendererHost({ content, sessionId }: { content: QuestionContent; sessionId?: string }) {
  const [revealed, setRevealed] = useState(false);
  const [responseCount, setResponseCount] = useState(0);
  const [responses, setResponses] = useState<ResponseRow[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      const { count } = await supabase.from("responses").select("id", { count: "exact" })
        .eq("session_id", sessionId).eq("response_type", "question");
      if (count !== null) setResponseCount(count);
    })();

    const respCh = supabase.channel(`qh-resp:${sessionId}`);
    respCh.on("postgres_changes", { event: "INSERT", schema: "public", table: "responses", filter: `session_id=eq.${sessionId}` },
      (payload) => {
        if ((payload.new as { response_type: string }).response_type === "question")
          setResponseCount(c => c + 1);
      }).subscribe();

    const revealCh = supabase.channel(`qh-rev:${sessionId}`);
    revealCh.on("broadcast", { event: "reveal_results" }, async () => {
      const { data } = await supabase.from("responses").select("response_data")
        .eq("session_id", sessionId).eq("response_type", "question");
      setResponses((data ?? []) as ResponseRow[]);
      setRevealed(true);
    }).subscribe();

    return () => { supabase.removeChannel(respCh); supabase.removeChannel(revealCh); };
  }, [sessionId]);

  if (!revealed) {
    const text = (content as { text?: string }).text;
    return (
      <div className="min-h-screen w-full bg-immersive bg-grid flex flex-col items-center justify-center gap-8 animate-slot-in">
        <div className="text-xs uppercase tracking-[0.4em] text-[color:var(--cyan)]">Question Live</div>
        {text && <div className="text-2xl md:text-4xl font-bold text-center max-w-2xl">{text}</div>}
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1 text-center">Responses</div>
          <div className="text-8xl font-extrabold text-glow">{responseCount}</div>
        </div>
        <div className="flex gap-2">
          <span className="w-2 h-2 rounded-full bg-[color:var(--cyan)] animate-pulse" />
          <span className="w-2 h-2 rounded-full bg-[color:var(--cyan)] animate-pulse [animation-delay:200ms]" />
          <span className="w-2 h-2 rounded-full bg-[color:var(--cyan)] animate-pulse [animation-delay:400ms]" />
        </div>
      </div>
    );
  }

  return <QuestionResults content={content} responses={responses} />;
}

function QuestionResults({ content, responses }: { content: QuestionContent; responses: ResponseRow[] }) {
  const [animating, setAnimating] = useState(true);
  useEffect(() => { const t = setTimeout(() => setAnimating(false), 150); return () => clearTimeout(t); }, []);

  const total = responses.length;

  if (content.type === "true_or_false") {
    const trueCount = responses.filter(r => r.response_data.answer === "true").length;
    const falseCount = responses.filter(r => r.response_data.answer === "false").length;
    const correct = content.correct_tf ? "true" : "false";
    return (
      <div className="min-h-screen w-full bg-immersive bg-grid flex flex-col items-center justify-center p-12 gap-8 animate-slot-in">
        <div className="text-xs uppercase tracking-[0.4em] text-[color:var(--cyan)]">Results</div>
        <div className="text-2xl font-bold text-center max-w-2xl">{content.text}</div>
        <div className="flex gap-16 justify-center">
          {(["true", "false"] as const).map(v => {
            const count = v === "true" ? trueCount : falseCount;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            const isCorrect = v === correct;
            return (
              <div key={v} className={`text-center transition-all duration-500 ${isCorrect ? "scale-110" : "opacity-50"}`}>
                <div className={`text-6xl font-extrabold uppercase tracking-widest ${isCorrect ? "text-[color:var(--success)]" : "text-muted-foreground"}`}>{v}</div>
                <div className="text-4xl font-bold mt-2">{count}</div>
                <div className="text-lg text-muted-foreground">{pct}%</div>
                {isCorrect && <div className="text-xs uppercase tracking-widest text-[color:var(--success)] mt-1">Correct ✓</div>}
              </div>
            );
          })}
        </div>
        <div className="text-sm text-muted-foreground">{total} response{total !== 1 ? "s" : ""}</div>
      </div>
    );
  }

  if (content.type === "likert") {
    const scores = responses.map(r => Number(r.response_data.answer)).filter(n => n >= 1 && n <= 5);
    const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";
    const counts = [1, 2, 3, 4, 5].map(n => scores.filter(s => s === n).length);
    const maxCount = Math.max(...counts, 1);
    return (
      <div className="min-h-screen w-full bg-immersive bg-grid flex flex-col items-center justify-center p-12 gap-8 animate-slot-in">
        <div className="text-xs uppercase tracking-[0.4em] text-[color:var(--cyan)]">Results</div>
        <div className="text-2xl font-bold text-center max-w-2xl">{content.text}</div>
        <div className="text-8xl font-extrabold text-[color:var(--cyan)] text-glow">{avg}</div>
        <div className="flex items-end gap-4 h-24">
          {[1, 2, 3, 4, 5].map((n, i) => {
            const h = counts[i] === 0 ? 4 : Math.max(8, (counts[i] / maxCount) * 88);
            return (
              <div key={n} className="flex flex-col items-center gap-1">
                <div className="w-10 rounded-t transition-all duration-700" style={{ height: animating ? "4px" : `${h}px`, background: "var(--cyan)", transitionDelay: `${i * 80}ms` }} />
                <span className="text-sm font-bold">{n}</span>
              </div>
            );
          })}
        </div>
        <div className="text-sm text-muted-foreground">{scores.length} response{scores.length !== 1 ? "s" : ""} · Average {avg}</div>
      </div>
    );
  }

  // Multiple choice / poll
  const opts = (content as { options?: string[] }).options ?? [];
  const counts = opts.map((_, i) => responses.filter(r => r.response_data.answer === i).length);
  const maxCount = Math.max(...counts, 1);

  return (
    <div className="min-h-screen w-full bg-immersive bg-grid flex flex-col items-center justify-center p-12 gap-6 animate-slot-in">
      <div className="text-xs uppercase tracking-[0.4em] text-[color:var(--cyan)]">Results</div>
      <div className="text-2xl font-bold text-center max-w-2xl">{(content as { text?: string }).text}</div>
      <div className="w-full max-w-3xl space-y-4">
        {opts.map((opt, i) => {
          const count = counts[i];
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const barW = animating ? 0 : (counts[i] / maxCount) * 100;
          const isCorrect = content.type === "multiple_choice" && content.correct === i;
          return (
            <div key={i} className="animate-slot-in" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`font-semibold ${isCorrect ? "text-[color:var(--cyan)]" : "text-foreground"}`}>
                  {String.fromCharCode(65 + i)}. {opt} {isCorrect && "✓"}
                </span>
                <span className="text-muted-foreground text-sm">{count} ({pct}%)</span>
              </div>
              <div className="h-5 bg-card/60 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${barW}%`, background: isCorrect ? "var(--cyan)" : "var(--orange)", transitionDelay: `${i * 80}ms` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-sm text-muted-foreground">{total} response{total !== 1 ? "s" : ""}</div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COUNTDOWN TIMER
// Host has Start/Pause/Reset controls; all screens share timer state via broadcast.
// ─────────────────────────────────────────────

function CountdownTimerRenderer({ content, screen, sessionId }: {
  content: { label?: string; duration_secs: number };
  screen: "host" | "screen1" | "screen2";
  sessionId?: string;
}) {
  const [secsLeft, setSecsLeft] = useState(content.duration_secs);
  const [running, setRunning] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const secsLeftRef = useRef(content.duration_secs);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    secsLeftRef.current = secsLeft;
  }, [secsLeft]);

  useEffect(() => {
    if (!sessionId) return;
    const ch = supabase.channel(`timer:${sessionId}`, { config: { broadcast: { self: true } } });
    channelRef.current = ch;
    ch.on("broadcast", { event: "timer_start" }, ({ payload }: { payload: { startedAt: number; baseSecs: number } }) => {
      startedAtRef.current = payload.startedAt;
      secsLeftRef.current = payload.baseSecs;
      setSecsLeft(payload.baseSecs);
      setRunning(true);
    });
    ch.on("broadcast", { event: "timer_pause" }, ({ payload }: { payload: { secsLeft: number } }) => {
      startedAtRef.current = null;
      setSecsLeft(payload.secsLeft);
      secsLeftRef.current = payload.secsLeft;
      setRunning(false);
    });
    ch.on("broadcast", { event: "timer_reset" }, () => {
      startedAtRef.current = null;
      setSecsLeft(content.duration_secs);
      secsLeftRef.current = content.duration_secs;
      setRunning(false);
    });
    ch.subscribe();
    return () => { supabase.removeChannel(ch); channelRef.current = null; };
  }, [sessionId, content.duration_secs]);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      if (startedAtRef.current === null) return;
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      const remaining = Math.max(0, secsLeftRef.current - elapsed);
      setSecsLeft(remaining);
      if (remaining === 0) setRunning(false);
    }, 200);
    return () => clearInterval(interval);
  }, [running]);

  const mins = Math.floor(secsLeft / 60);
  const secs = secsLeft % 60;
  const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const urgent = secsLeft > 0 && secsLeft <= 10;
  const done = secsLeft === 0;

  const handleStart = () => {
    const baseSecs = secsLeftRef.current;
    const startedAt = Date.now();
    channelRef.current?.send({
      type: "broadcast", event: "timer_start",
      payload: { startedAt, baseSecs },
    });
  };

  const handlePause = () => {
    const remaining = secsLeftRef.current;
    channelRef.current?.send({
      type: "broadcast", event: "timer_pause",
      payload: { secsLeft: remaining },
    });
  };

  const handleReset = () => {
    channelRef.current?.send({ type: "broadcast", event: "timer_reset", payload: {} });
  };

  return (
    <div className="min-h-screen w-full bg-immersive bg-grid flex flex-col items-center justify-center gap-8 animate-slot-in">
      {content.label && (
        <div className="text-2xl md:text-4xl font-bold text-center max-w-2xl px-8">{content.label}</div>
      )}
      <div
        className={`text-[22vw] font-extrabold font-mono leading-none tabular-nums transition-colors duration-500
          ${done ? "text-destructive text-glow" : urgent ? "text-[color:var(--orange)] text-glow" : "text-foreground"}`}
      >
        {timeStr}
      </div>
      {screen === "host" && (
        <div className="flex gap-4">
          {!running ? (
            <Button
              onClick={handleStart}
              disabled={done}
              className="h-14 px-10 text-lg uppercase tracking-widest font-extrabold disabled:opacity-30"
            >
              {secsLeft === content.duration_secs ? "Start" : "Resume"}
            </Button>
          ) : (
            <Button onClick={handlePause} variant="outline" className="h-14 px-10 text-lg uppercase tracking-widest">
              Pause
            </Button>
          )}
          <Button onClick={handleReset} variant="outline" className="h-14 px-10 text-lg uppercase tracking-widest">
            Reset
          </Button>
        </div>
      )}
      {done && (
        <div className="text-xl uppercase tracking-[0.3em] text-destructive animate-pulse font-bold">Time's up!</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// HOST TIMER — host-only local timer (no broadcast to side screens)
// ─────────────────────────────────────────────

function HostTimerRenderer({ content }: {
  content: { label?: string; duration_secs: number };
}) {
  const [secsLeft, setSecsLeft] = useState(content.duration_secs);
  const [running, setRunning] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const secsLeftRef = useRef(content.duration_secs);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    secsLeftRef.current = secsLeft;
  }, [secsLeft]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      if (startedAtRef.current === null) return;
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      const remaining = Math.max(0, secsLeftRef.current - elapsed);
      setSecsLeft(remaining);
      if (remaining === 0) setRunning(false);
    }, 200);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const mins = Math.floor(secsLeft / 60);
  const secs = secsLeft % 60;
  const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const urgent = secsLeft > 0 && secsLeft <= 10;
  const done = secsLeft === 0;

  const handleStart = () => {
    startedAtRef.current = Date.now();
    setRunning(true);
  };

  const handlePause = () => {
    startedAtRef.current = null;
    setRunning(false);
  };

  const handleReset = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    startedAtRef.current = null;
    setRunning(false);
    setSecsLeft(content.duration_secs);
    secsLeftRef.current = content.duration_secs;
  };

  return (
    <div className="min-h-screen w-full bg-immersive bg-grid flex flex-col items-center justify-center gap-8 animate-slot-in">
      {content.label && (
        <div className="text-2xl md:text-4xl font-bold text-center max-w-2xl px-8">{content.label}</div>
      )}
      <div
        className={`text-[22vw] font-extrabold font-mono leading-none tabular-nums transition-colors duration-500
          ${done ? "text-destructive text-glow" : urgent ? "text-[color:var(--orange)] text-glow" : "text-foreground"}`}
      >
        {timeStr}
      </div>
      <div className="flex gap-4">
        {!running ? (
          <Button
            onClick={handleStart}
            disabled={done}
            className="h-14 px-10 text-lg uppercase tracking-widest font-extrabold disabled:opacity-30"
          >
            {secsLeft === content.duration_secs ? "Start" : "Resume"}
          </Button>
        ) : (
          <Button onClick={handlePause} variant="outline" className="h-14 px-10 text-lg uppercase tracking-widest">
            Pause
          </Button>
        )}
        <Button onClick={handleReset} variant="outline" className="h-14 px-10 text-lg uppercase tracking-widest">
          Reset
        </Button>
      </div>
      {done && (
        <div className="text-xl uppercase tracking-[0.3em] text-destructive animate-pulse font-bold">Time's up!</div>
      )}
    </div>
  );
}
