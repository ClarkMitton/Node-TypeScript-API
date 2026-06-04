// Admin Test Mode — /admin/test
// Creates a fresh session and renders Host + Screen 1 + Screen 2 in three
// embedded iframes side-by-side so the admin can test all three surfaces
// without juggling browser windows. Both screens auto-join via ?code= params.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { generateCode } from "@/lib/codes";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/test")({
  head: () => ({ meta: [{ title: "Test Mode · Admin" }] }),
  component: TestMode,
});

type Lesson = { id: string; title: string; featured: boolean };

type TestSession = {
  id: string;
  screen1_code: string;
  screen2_code: string;
};

type SlotRow = {
  host_content: unknown;
  screen1_content: unknown;
  screen2_content: unknown;
};

function TestMode() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState<string>("");
  const [session, setSession] = useState<TestSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [slotsList, setSlotsList] = useState<SlotRow[]>([]);
  const [slotIndex, setSlotIndex] = useState(0);

  // Load lessons on mount
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("lessons")
        .select("id, title, featured")
        .order("featured", { ascending: false })
        .order("created_at", { ascending: false });
      const list = (data ?? []) as Lesson[];
      setLessons(list);
      const featured = list.find((l) => l.featured);
      setSelectedLessonId(featured?.id ?? list[0]?.id ?? "");
    })();
  }, []);

  const startTest = useCallback(async () => {
    if (!selectedLessonId) return;
    setBusy(true);

    // Pre-load ALL slots so we can launch the session immediately and let the
    // test-mode header drive prev/next without going through the host iframe.
    const { data: slotRows } = await supabase
      .from("slots")
      .select("host_content, screen1_content, screen2_content")
      .eq("lesson_id", selectedLessonId)
      .is("session_id", null)
      .order("order_index");
    const all = (slotRows ?? []) as SlotRow[];
    const first = all[0];
    const initialState = first
      ? {
          slot: {
            host: first.host_content,
            screen1: first.screen1_content,
            screen2: first.screen2_content,
          },
          indices: { host: 0, screen1: 0, screen2: 0 },
        }
      : {};

    const { data, error } = await supabase
      .from("sessions")
      .insert({
        lesson_id: selectedLessonId,
        host_code: generateCode(),
        screen1_code: generateCode(),
        screen2_code: generateCode(),
        status: first ? "active" : "waiting",
        current_slot_index: 0,
        screen1_connected: true,
        screen2_connected: true,
        state: initialState as never,
      })
      .select("id, screen1_code, screen2_code")
      .single();
    setBusy(false);
    if (error || !data) {
      console.error("Failed to create test session:", error);
      return;
    }
    setSlotsList(all);
    setSlotIndex(0);
    setSession(data as TestSession);
  }, [selectedLessonId]);

  const goToSlot = useCallback(
    async (next: number) => {
      if (!session || slotsList.length === 0) return;
      const clamped = Math.max(0, Math.min(slotsList.length - 1, next));
      if (clamped === slotIndex) return;
      const slot = slotsList[clamped];
      await supabase
        .from("sessions")
        .update({
          current_slot_index: clamped,
          state: {
            slot: {
              host: slot.host_content,
              screen1: slot.screen1_content,
              screen2: slot.screen2_content,
            },
            indices: { host: clamped, screen1: clamped, screen2: clamped },
          } as never,
        })
        .eq("id", session.id);
      setSlotIndex(clamped);
    },
    [session, slotsList, slotIndex],
  );

  const endTest = useCallback(async () => {
    if (!session) return;
    await supabase
      .from("sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", session.id);
    setSession(null);
    setSlotsList([]);
    setSlotIndex(0);
  }, [session]);

  const reloadAll = () => setReloadTick((t) => t + 1);

  // ── Setup screen ──
  if (!session) {
    return (
      <div className="min-h-screen bg-immersive bg-grid p-8">
        <header className="flex items-center justify-between mb-10">
          <div>
            <div className="text-xs uppercase tracking-[0.4em] text-[color:var(--cyan)]">
              Admin · Test Mode
            </div>
            <h1 className="text-3xl font-extrabold mt-1 text-glow">
              Test all 3 screens at once
            </h1>
          </div>
          <Link to="/admin">
            <Button variant="outline" className="h-11 px-6 uppercase tracking-widest">
              ← Admin
            </Button>
          </Link>
        </header>

        <div className="max-w-xl mx-auto bg-card/60 backdrop-blur border border-border rounded-2xl p-8 animate-slot-in">
          <p className="text-muted-foreground mb-6">
            Spins up a fresh session and embeds Host, Screen 1 and Screen 2 in
            three live windows on this page. Both touch screens auto-join — no
            code entry needed.
          </p>

          <label className="text-xs uppercase tracking-widest text-muted-foreground mb-2 block">
            Lesson
          </label>
          <select
            value={selectedLessonId}
            onChange={(e) => setSelectedLessonId(e.target.value)}
            className="w-full h-12 rounded-md bg-background border border-border px-3 text-base mb-6"
          >
            {lessons.length === 0 && <option value="">No lessons available</option>}
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
                {l.featured ? " ★" : ""}
              </option>
            ))}
          </select>

          <Button
            onClick={startTest}
            disabled={busy || !selectedLessonId}
            className="w-full h-14 text-lg uppercase tracking-widest font-extrabold"
          >
            {busy ? "Starting…" : "Start Test"}
          </Button>
        </div>
      </div>
    );
  }

  // ── Live test grid ──
  const hostUrl = `/host?session=${session.id}`;
  const s1Url = `/screen/1?code=${session.screen1_code}`;
  const s2Url = `/screen/2?code=${session.screen2_code}`;

  return (
    <div className="min-h-screen bg-immersive bg-grid flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 border-b border-border/60 shrink-0">
        <div className="flex items-center gap-4">
          <div className="text-xs uppercase tracking-[0.4em] text-[color:var(--cyan)]">
            Test Mode · Live
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            session {session.id.slice(0, 8)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToSlot(slotIndex - 1)}
            disabled={slotIndex <= 0 || slotsList.length === 0}
            className="uppercase tracking-widest text-xs h-9 px-3"
          >
            ← Prev
          </Button>
          <span className="text-xs font-mono text-muted-foreground tabular-nums px-1">
            {slotsList.length === 0
              ? "—"
              : `Slot ${slotIndex + 1}/${slotsList.length}`}
          </span>
          <Button
            size="sm"
            onClick={() => goToSlot(slotIndex + 1)}
            disabled={slotIndex >= slotsList.length - 1 || slotsList.length === 0}
            className="uppercase tracking-widest text-xs h-9 px-3 font-extrabold"
          >
            Next →
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={reloadAll}
            className="uppercase tracking-widest text-xs h-9 px-3"
          >
            ↻ Reload all
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(hostUrl, "_blank")}
            className="uppercase tracking-widest text-xs h-9 px-3"
          >
            Host ↗
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(s1Url, "_blank")}
            className="uppercase tracking-widest text-xs h-9 px-3"
          >
            S1 ↗
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(s2Url, "_blank")}
            className="uppercase tracking-widest text-xs h-9 px-3"
          >
            S2 ↗
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={endTest}
            className="uppercase tracking-widest text-xs h-9 px-3"
          >
            End test
          </Button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3 p-3 min-h-0">
        <TestFrame title="Host" src={hostUrl} accent="var(--cyan)" reloadKey={reloadTick} />
        <TestFrame title="Screen 1" src={s1Url} accent="var(--orange)" reloadKey={reloadTick} />
        <TestFrame title="Screen 2" src={s2Url} accent="var(--success)" reloadKey={reloadTick} />
      </div>
    </div>
  );
}

function TestFrame({
  title,
  src,
  accent,
  reloadKey,
}: {
  title: string;
  src: string;
  accent: string;
  reloadKey: number;
}) {
  return (
    <div
      className="flex flex-col rounded-xl border-2 overflow-hidden bg-card/40"
      style={{ borderColor: `color-mix(in oklab, ${accent} 50%, transparent)` }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 text-xs uppercase tracking-[0.3em] font-bold shrink-0"
        style={{ color: accent, background: `color-mix(in oklab, ${accent} 8%, transparent)` }}
      >
        <span>{title}</span>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="opacity-60 hover:opacity-100"
        >
          open ↗
        </a>
      </div>
      <iframe
        key={reloadKey}
        src={src}
        title={title}
        className="flex-1 w-full bg-background border-0"
        allow="autoplay; fullscreen; clipboard-write"
      />
    </div>
  );
}
