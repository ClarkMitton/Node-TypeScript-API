// Stage Designer — Step 8
// Route: /admin/designer/$lessonId
// Three-screen mockup preview, horizontal slot timeline, per-slot editor panel.
// All slot mutations auto-save after 1.5 s idle, plus an explicit Save button.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const PX_PER_MIN = 12; // timeline pixels per minute
const MIN_SLOT_PX = 80; // minimum rendered slot width
const SNAP_MINS = [5, 10, 15, 20, 30]; // duration snap points
const SNAP_THRESHOLD = 1.5; // snap if within this many minutes of a point
const AUTOSAVE_DELAY = 1500; // ms idle before auto-save triggers

const END_BEHAVIOURS = [
  { value: "timed", label: "Timed auto-advance" },
  { value: "screen2_submit", label: "Touch Screen 2 submission" },
  { value: "screen1_continue", label: "Touch Screen 1 presses continue" },
] as const;

const LEAD_PHASES = ["Launch", "Establish", "Apply", "Demonstrate"] as const;

const LEAD_COLOURS: Record<string, string> = {
  Launch: "var(--cyan)",
  Establish: "var(--success)",
  Apply: "var(--orange)",
  Demonstrate: "oklch(0.72 0.18 300)", // violet
};

// Content types available per screen. teacher_note and host_timer are host (teacher screen) only.
const CONTENT_TYPES_HOST = [
  { value: "waiting", label: "Waiting (standby)" },
  { value: "text_slide", label: "Text Slide" },
  { value: "image", label: "Image" },
  { value: "youtube", label: "YouTube" },
  { value: "video_upload", label: "Video Upload" },
  { value: "embed", label: "Embed (iframe)" },
  { value: "webpage", label: "Webpage (proxied)" },
  { value: "html_upload", label: "HTML Upload" },
  { value: "confidence_checker", label: "Confidence Checker" },
  { value: "wheel_spinner", label: "Wheel Spinner" },
  { value: "countdown_timer", label: "Countdown Timer (all screens)" },
  { value: "host_timer", label: "Host Timer (Host only)" },
  { value: "host_webcam", label: "Host Webcam" },
  { value: "teacher_note", label: "Teacher Note (Host only)" },
];
const CONTENT_TYPES_SCREEN1 = [
  { value: "waiting", label: "Waiting (standby)" },
  { value: "text_slide", label: "Text Slide" },
  { value: "image", label: "Image" },
  { value: "youtube", label: "YouTube" },
  { value: "video_upload", label: "Video Upload" },
  { value: "embed", label: "Embed (iframe)" },
  { value: "webpage", label: "Webpage (proxied)" },
  { value: "html_upload", label: "HTML Upload" },
  { value: "confidence_checker", label: "Confidence Checker" },
  { value: "wheel_spinner", label: "Wheel Spinner" },
  { value: "countdown_timer", label: "Countdown Timer" },
  { value: "host_webcam", label: "Host Webcam" },
];
const CONTENT_TYPES_SCREEN2 = CONTENT_TYPES_SCREEN1;
// Lookup map for display labels
const ALL_TYPE_LABELS = Object.fromEntries(
  CONTENT_TYPES_SCREEN1.map((t) => [t.value, t.label]),
);

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type ContentDef = { type: string; [k: string]: unknown };

type QuestionDef = {
  id: string;
  type: "multiple_choice" | "true_or_false" | "poll" | "likert";
  text: string;
  options?: string[];
  correct?: number;
  correct_tf?: boolean;
  optional_qualitative?: boolean;
};

type SlotDef = {
  id: string;
  lesson_id: string;
  session_id: null;
  order_index: number;
  duration_mins: number;
  end_behaviour: string;
  pause_before_advance: boolean;
  lead_phase: string | null;
  name: string | null;
  screen_delay_secs: number;
  host_content: ContentDef;
  screen1_content: ContentDef;
  screen2_content: ContentDef;
};

type LessonRow = { id: string; title: string };

type ActiveScreen = "host" | "screen1" | "screen2";

type CtxMenuState = {
  x: number;
  y: number;
  slotId: string;
  sub: "end_behaviour" | "lead_phase" | null;
} | null;

type SaveStatus = "saved" | "saving" | "unsaved";

// ─────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────

export const Route = createFileRoute("/admin/designer/$lessonId")({
  head: () => ({ meta: [{ title: "Stage Designer · Immersive Learning" }] }),
  component: DesignerPage,
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

// Timings are disabled: slots render at a fixed width.
function slotPx(_mins: number): number {
  return 140;
}

function makeSlot(lessonId: string, orderIndex: number): SlotDef {
  return {
    id: crypto.randomUUID(),
    lesson_id: lessonId,
    session_id: null,
    order_index: orderIndex,
    duration_mins: 10,
    end_behaviour: "",
    pause_before_advance: false,
    lead_phase: null,
    name: null,
    screen_delay_secs: 0,
    host_content: { type: "waiting" },
    screen1_content: { type: "waiting" },
    screen2_content: { type: "waiting" },
  };
}

function makeFeedbackSlot(lessonId: string, orderIndex: number): SlotDef {
  return {
    ...makeSlot(lessonId, orderIndex),
    end_behaviour: "screen2_submit",
    screen1_content: { type: "teacher_note", text: "Awaiting student responses…" },
    screen2_content: { type: "confidence_checker", prompt: "How confident are you?" },
  };
}

async function uploadToStorage(
  file: File,
  lessonId: string,
): Promise<{ url: string; file_name: string } | null> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `lessons/${lessonId}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage.from("lesson-media").upload(path, file);
  if (error) {
    console.error("Storage upload error:", error);
    return null;
  }
  const { data } = supabase.storage.from("lesson-media").getPublicUrl(path);
  return { url: data.publicUrl, file_name: file.name };
}

async function getVideoDurationMins(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(Math.ceil(video.duration / 60));
    };
    video.onerror = () => resolve(10);
    video.src = URL.createObjectURL(file);
  });
}

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────

function DesignerPage() {
  const { lessonId } = Route.useParams();

  const [lesson, setLesson] = useState<LessonRow | null>(null);
  const [slots, setSlots] = useState<SlotDef[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>("host");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState>(null);
  const [showMissingEndBehaviour, setShowMissingEndBehaviour] = useState(false);

  // Refs let the stable saveAll callback always see latest state
  const slotsRef = useRef<SlotDef[]>([]);
  const deletedIdsRef = useRef<string[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autoSaveTimer = useRef<any>(undefined);

  useEffect(() => { slotsRef.current = slots; }, [slots]);
  useEffect(() => { deletedIdsRef.current = deletedIds; }, [deletedIds]);
  useEffect(() => () => clearTimeout(autoSaveTimer.current), []);

  // Load lesson + design-time slots (session_id is null for designer slots)
  useEffect(() => {
    (async () => {
      const [{ data: l }, { data: s }] = await Promise.all([
        supabase.from("lessons").select("id, title").eq("id", lessonId).single(),
        supabase
          .from("slots")
          .select("*")
          .eq("lesson_id", lessonId)
          .is("session_id", null)
          .order("order_index"),
      ]);
      if (l) setLesson(l as LessonRow);
      if (s) setSlots(s as unknown as SlotDef[]);
    })();
  }, [lessonId]);

  // ── Persistence ─────────────────────────────

  const saveAll = useCallback(async () => {
    setSaveStatus("saving");
    try {
      // Delete removed slots
      for (const id of deletedIdsRef.current) {
        const { error } = await supabase.from("slots").delete().eq("id", id);
        if (error) throw error;
      }
      // Batch upsert surviving slots
      if (slotsRef.current.length > 0) {
        const { error } = await supabase.from("slots").upsert(
          slotsRef.current.map((s) => ({
            id: s.id,
            lesson_id: s.lesson_id,
            session_id: null,
            order_index: s.order_index,
            duration_mins: s.duration_mins,
            end_behaviour: s.end_behaviour,
            pause_before_advance: s.pause_before_advance,
            lead_phase: s.lead_phase,
            name: s.name,
            screen_delay_secs: s.screen_delay_secs,
            host_content: s.host_content as never,
            screen1_content: s.screen1_content as never,
            screen2_content: s.screen2_content as never,
          })),
        );
        if (error) throw error;
      }
      setDeletedIds([]);
      setSaveStatus("saved");
    } catch (err) {
      console.error("[Designer] Save failed:", err);
      setSaveStatus("unsaved");
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
      alert(`Save failed: ${msg}\n\nCheck the browser console for details.`);
    }
  }, []);

  const markDirty = useCallback(() => {
    setSaveStatus("unsaved");
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveAll, AUTOSAVE_DELAY);
  }, [saveAll]);

  const handleSave = () => {
    saveAll();
  };

  // ── Sync to active session ───────────────────

  const handleSync = async () => {
    if (slotsRef.current.length === 0) return;
    const { data: active } = await supabase
      .from("sessions")
      .select("id, current_slot_index")
      .eq("lesson_id", lessonId)
      .eq("status", "active");

    if (!active || active.length === 0) {
      alert("No active sessions found for this lesson.");
      return;
    }

    for (const sess of active as { id: string; current_slot_index: number }[]) {
      const slot = slotsRef.current[sess.current_slot_index] ?? slotsRef.current[0];
      if (!slot) continue;
      await supabase
        .from("sessions")
        .update({
          state: {
            slot: {
              host: slot.host_content,
              screen1: slot.screen1_content,
              screen2: slot.screen2_content,
            },
          } as never,
        })
        .eq("id", sess.id);
    }

    alert(`Synced to ${active.length} active session${active.length !== 1 ? "s" : ""}.`);
  };

  // ── Slot mutations ───────────────────────────

  const updateSlot = useCallback(
    (id: string, patch: Partial<SlotDef>) => {
      setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      markDirty();
    },
    [markDirty],
  );

  const addSlot = useCallback(() => {
    setSlots((prev) => {
      const s = makeSlot(lessonId, prev.length);
      setSelectedId(s.id);
      return [...prev, s];
    });
    markDirty();
  }, [lessonId, markDirty]);

  const duplicateSlot = useCallback(
    (id: string) => {
      setSlots((prev) => {
        const idx = prev.findIndex((s) => s.id === id);
        if (idx === -1) return prev;
        const dup: SlotDef = { ...prev[idx], id: crypto.randomUUID() };
        const next = [...prev];
        next.splice(idx + 1, 0, dup);
        return next.map((s, i) => ({ ...s, order_index: i }));
      });
      markDirty();
    },
    [markDirty],
  );

  const deleteSlot = useCallback(
    (id: string) => {
      setDeletedIds((prev) => [...prev, id]);
      setSlots((prev) =>
        prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, order_index: i })),
      );
      if (selectedId === id) setSelectedId(null);
      markDirty();
    },
    [selectedId, markDirty],
  );

  const insertFeedback = useCallback(
    (nearId: string, position: "before" | "after") => {
      setSlots((prev) => {
        const idx = prev.findIndex((s) => s.id === nearId);
        const at = position === "before" ? idx : idx + 1;
        const fb = makeFeedbackSlot(lessonId, at);
        const next = [...prev];
        next.splice(at, 0, fb);
        return next.map((s, i) => ({ ...s, order_index: i }));
      });
      markDirty();
    },
    [lessonId, markDirty],
  );

  const reorderSlots = useCallback(
    (fromId: string, toIndex: number) => {
      setSlots((prev) => {
        const fromIdx = prev.findIndex((s) => s.id === fromId);
        if (fromIdx === -1) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIdx, 1);
        const clampedTo = Math.max(0, Math.min(toIndex, next.length));
        next.splice(clampedTo, 0, moved);
        return next.map((s, i) => ({ ...s, order_index: i }));
      });
      markDirty();
    },
    [markDirty],
  );

  // ── File drop onto timeline ──────────────────

  const handleTimelineDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      if (!files.length) return;

      setSlots((prev) => {
        // Placeholder — async video detection happens below
        return prev;
      });

      for (const file of files) {
        let durationMins = 10;
        let contentType = "image";

        if (file.type.startsWith("video/")) {
          contentType = "video_upload";
          durationMins = await getVideoDurationMins(file);
        } else if (file.type.startsWith("image/")) {
          contentType = "image";
          durationMins = 10 / 60; // 10 seconds
        } else {
          continue; // ignore non-image/video
        }

        const s = makeSlot(lessonId, slotsRef.current.length);
        s.duration_mins = durationMins;
        s.host_content = { type: contentType, file_name: file.name };
        s.screen1_content = { type: contentType, file_name: file.name };
        s.screen2_content = { type: contentType, file_name: file.name };
        setSlots((prev) => [...prev, { ...s, order_index: prev.length }]);
      }
      markDirty();
    },
    [lessonId, markDirty],
  );

  // ── Context menu actions ─────────────────────

  const closeCtx = useCallback(() => setCtxMenu(null), []);

  useEffect(() => {
    document.addEventListener("click", closeCtx);
    return () => document.removeEventListener("click", closeCtx);
  }, [closeCtx]);

  const selectedSlot = slots.find((s) => s.id === selectedId) ?? null;

  return (
    <div
      className="h-screen flex flex-col bg-immersive overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Header */}
      <DesignerHeader
        lesson={lesson}
        saveStatus={saveStatus}
        showMissing={showMissingEndBehaviour}
        onSave={handleSave}
        onSync={handleSync}
      />

      {/* Screen mockups */}
      <ScreenMockupsRow
        activeScreen={activeScreen}
        selectedSlot={selectedSlot}
        onSelectScreen={setActiveScreen}
      />

      {/* Timeline + Editor (fills remaining height) */}
      <div className="flex flex-1 overflow-hidden border-t border-border/60">
        <Timeline
          slots={slots}
          selectedId={selectedId}
          showMissing={showMissingEndBehaviour}
          onSelect={setSelectedId}
          onAdd={addSlot}
          onDelete={deleteSlot}
          onReorder={reorderSlots}
          onDrop={handleTimelineDrop}
          onContextMenu={(e, id) => {
            e.preventDefault();
            setCtxMenu({ x: e.clientX, y: e.clientY, slotId: id, sub: null });
          }}
          updateSlot={updateSlot}
          markDirty={markDirty}
        />

        {/* Right panel — only shown when a slot is selected */}
        {selectedSlot && (
          <SlotEditorPanel
            slot={selectedSlot}
            lessonId={lessonId}
            activeScreen={activeScreen}
            showEndBehaviourError={showMissingEndBehaviour && !selectedSlot.end_behaviour}
            onActiveScreen={setActiveScreen}
            onUpdate={(patch) => updateSlot(selectedSlot.id, patch)}
          />
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          sub={ctxMenu.sub}
          currentSlot={slots.find((s) => s.id === ctxMenu.slotId)}
          onSetSub={(sub) => setCtxMenu((c) => (c ? { ...c, sub } : null))}
          onDuplicate={() => { duplicateSlot(ctxMenu.slotId); closeCtx(); }}
          onDelete={() => { deleteSlot(ctxMenu.slotId); closeCtx(); }}
          onInsertFeedbackBefore={() => { insertFeedback(ctxMenu.slotId, "before"); closeCtx(); }}
          onInsertFeedbackAfter={() => { insertFeedback(ctxMenu.slotId, "after"); closeCtx(); }}
          onSetEndBehaviour={(v) => { updateSlot(ctxMenu.slotId, { end_behaviour: v }); closeCtx(); }}
          onSetLeadPhase={(v) => { updateSlot(ctxMenu.slotId, { lead_phase: v || null }); closeCtx(); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// HEADER
// ─────────────────────────────────────────────

function DesignerHeader({
  lesson,
  saveStatus,
  showMissing,
  onSave,
  onSync,
}: {
  lesson: LessonRow | null;
  saveStatus: SaveStatus;
  showMissing: boolean;
  onSave: () => void;
  onSync: () => void;
}) {
  const statusLabel =
    saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : "Unsaved";
  const statusColour =
    saveStatus === "saved"
      ? "text-[color:var(--success)]"
      : saveStatus === "saving"
        ? "text-[color:var(--cyan)]"
        : "text-[color:var(--orange)]";

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-background/80 backdrop-blur shrink-0">
      <div className="flex items-center gap-4">
        <Link
          to="/admin"
          className="text-sm text-muted-foreground hover:text-[color:var(--cyan)] transition-colors uppercase tracking-widest"
        >
          ← Admin
        </Link>
        <div className="h-4 w-px bg-border" />
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-[color:var(--cyan)]">
            Stage Designer
          </div>
          <h1 className="text-lg font-extrabold leading-tight">
            {lesson?.title ?? "Loading…"}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {showMissing && (
          <span className="text-xs text-destructive uppercase tracking-widest animate-pulse">
            End behaviour missing
          </span>
        )}
        <span className={`text-xs uppercase tracking-widest ${statusColour}`}>
          {statusLabel}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={onSync}
          className="h-9 px-4 uppercase tracking-widest text-xs"
        >
          Sync
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          className="h-9 px-5 uppercase tracking-widest text-xs"
        >
          Save
        </Button>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────
// SCREEN MOCKUPS ROW
// ─────────────────────────────────────────────

function ScreenMockupsRow({
  activeScreen,
  selectedSlot,
  onSelectScreen,
}: {
  activeScreen: ActiveScreen;
  selectedSlot: SlotDef | null;
  onSelectScreen: (s: ActiveScreen) => void;
}) {
  return (
    <div className="flex items-end justify-center gap-6 px-8 py-4 bg-background/40 border-b border-border/60 shrink-0">
      <ScreenMockup
        label="Student Screen 1"
        screen="screen1"
        isActive={activeScreen === "screen1"}
        content={selectedSlot?.screen1_content ?? null}
        portrait
        onClick={() => onSelectScreen("screen1")}
      />
      <ScreenMockup
        label="Host · Teacher Screen"
        screen="host"
        isActive={activeScreen === "host"}
        content={selectedSlot?.host_content ?? null}
        portrait={false}
        onClick={() => onSelectScreen("host")}
      />
      <ScreenMockup
        label="Student Screen 2"
        screen="screen2"
        isActive={activeScreen === "screen2"}
        content={selectedSlot?.screen2_content ?? null}
        portrait
        onClick={() => onSelectScreen("screen2")}
      />
    </div>
  );
}

function ScreenMockup({
  label,
  isActive,
  content,
  portrait,
  onClick,
}: {
  label: string;
  screen: ActiveScreen;
  isActive: boolean;
  content: ContentDef | null;
  portrait: boolean;
  onClick: () => void;
}) {
  const typeLabel = content?.type
    ? (ALL_TYPE_LABELS[content.type] ?? content.type)
    : "Waiting";

  return (
    <button
      onClick={onClick}
      className={`relative rounded-xl border-2 transition-all duration-200 flex flex-col items-center justify-center gap-1 shrink-0
        ${portrait ? "w-[88px] h-[156px]" : "w-[248px] h-[155px]"}
        ${
          isActive
            ? "border-[color:var(--cyan)] bg-card/80"
            : "border-border/40 bg-card/40 opacity-40 hover:opacity-60"
        }
        backdrop-blur cursor-pointer
      `}
      style={
        isActive
          ? { boxShadow: "0 0 28px color-mix(in oklab, var(--cyan) 30%, transparent)" }
          : undefined
      }
    >
      <span
        className={`text-[9px] uppercase tracking-widest font-bold px-2 text-center leading-tight ${
          isActive ? "text-[color:var(--cyan)]" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
      {content && content.type !== "waiting" && (
        <span
          className={`text-[10px] font-bold px-2 text-center leading-tight max-w-full truncate ${
            isActive ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {typeLabel}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────
// TIMELINE
// ─────────────────────────────────────────────

function Timeline({
  slots,
  selectedId,
  showMissing,
  onSelect,
  onAdd,
  onDelete,
  onReorder,
  onDrop,
  onContextMenu,
  updateSlot,
  markDirty,
}: {
  slots: SlotDef[];
  selectedId: string | null;
  showMissing: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onReorder: (fromId: string, toIndex: number) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  updateSlot: (id: string, patch: Partial<SlotDef>) => void;
  markDirty: () => void;
}) {
  // Drag-to-reorder state (HTML5 DnD)
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // Resize disabled — timings removed
  const resizingId: string | null = null;

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    // File drop passes files; slot drag passes nothing in files
    if (e.dataTransfer.files.length > 0) {
      onDrop(e);
    } else if (dragId !== null && dropIndex !== null) {
      onReorder(dragId, dropIndex);
    }
    setDragId(null);
    setDropIndex(null);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background/20">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0 border-b border-border/40">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Timeline · {slots.length} slot{slots.length !== 1 ? "s" : ""}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={onAdd}
          className="h-8 px-4 uppercase tracking-widest text-[10px]"
        >
          + Add Slot
        </Button>
      </div>

      {/* Scrollable track */}
      <div
        className="flex-1 overflow-x-auto overflow-y-hidden"
        style={{ cursor: resizingId ? "ew-resize" : "default" }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="flex items-center gap-3 px-5 py-5 min-h-full min-w-max">
          {slots.length === 0 ? (
            <div className="flex items-center justify-center min-w-[480px] h-24 border-2 border-dashed border-border/40 rounded-2xl text-muted-foreground text-sm uppercase tracking-widest">
              Drop images / videos here, or click + Add Slot
            </div>
          ) : (
            <>
              {slots.map((slot, idx) => (
                <div key={slot.id} className="relative flex items-center">
                  {/* Insertion indicator before this slot */}
                  {dropIndex === idx && dragId && dragId !== slot.id && (
                    <InsertLine />
                  )}

                  <SlotBlock
                    slot={slot}
                    isSelected={slot.id === selectedId}
                    isResizing={slot.id === resizingId}
                    missingEnd={showMissing && !slot.end_behaviour}
                    onClick={() => onSelect(slot.id)}
                    onContextMenu={(e) => onContextMenu(e, slot.id)}
                    onDelete={() => onDelete(slot.id)}
                    onResizeStart={() => {}}
                    onDragStart={(e) => {
                      setDragId(slot.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", slot.id);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setDropIndex(e.clientX < rect.left + rect.width / 2 ? idx : idx + 1);
                    }}
                    onDragLeave={() => setDropIndex(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragId) onReorder(dragId, dropIndex ?? idx);
                      setDragId(null);
                      setDropIndex(null);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDropIndex(null);
                    }}
                  />
                </div>
              ))}

              {/* Insertion indicator at end */}
              {dropIndex === slots.length && dragId && <InsertLine />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InsertLine() {
  return (
    <div className="w-0.5 h-20 rounded-full bg-[color:var(--cyan)] mx-1 animate-pulse shrink-0" />
  );
}

// ── Individual slot block ─────────────────────

function SlotBlock({
  slot,
  isSelected,
  isResizing,
  missingEnd,
  onClick,
  onContextMenu,
  onDelete,
  onResizeStart,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  slot: SlotDef;
  isSelected: boolean;
  isResizing: boolean;
  missingEnd: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDelete: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
  onDragStart: React.DragEventHandler;
  onDragOver: React.DragEventHandler;
  onDragLeave: React.DragEventHandler;
  onDrop: React.DragEventHandler;
  onDragEnd: React.DragEventHandler;
}) {
  const width = slotPx(slot.duration_mins);
  const leadColour = slot.lead_phase ? LEAD_COLOURS[slot.lead_phase] : null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`group relative rounded-xl border-2 transition-all duration-150 select-none overflow-hidden cursor-pointer
        ${
          isSelected
            ? "border-[color:var(--cyan)]"
            : missingEnd
              ? "border-destructive"
              : "border-border hover:border-[color:var(--cyan)]/50"
        }
        ${isResizing ? "opacity-80" : ""}
        bg-card/80 backdrop-blur
      `}
      style={{
        width: `${width}px`,
        minHeight: "80px",
        boxShadow: isSelected
          ? "0 0 16px color-mix(in oklab, var(--cyan) 25%, transparent)"
          : missingEnd
            ? "0 0 10px color-mix(in oklab, var(--destructive) 20%, transparent)"
            : undefined,
      }}
    >
      {/* LEAD phase colour strip */}
      {leadColour && (
        <div
          className="absolute inset-x-0 top-0 h-1 rounded-t-xl"
          style={{ background: leadColour }}
        />
      )}

      {/* Delete button — visible on hover */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="Delete slot"
        className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-destructive/80 hover:bg-destructive flex items-center justify-center text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity"
      >
        ×
      </button>

      <div className="px-3 pt-3 pb-2 flex flex-col gap-1.5 h-full">
        {/* Per-screen content type pips */}
        <div className="flex gap-1">
          <ContentPip type={slot.host_content.type} label="H" />
          <ContentPip type={slot.screen1_content.type} label="1" />
          <ContentPip type={slot.screen2_content.type} label="2" />
        </div>

        {/* Slot name */}
        {slot.name && (
          <div className="text-[9px] text-muted-foreground truncate leading-tight">
            {slot.name}
          </div>
        )}

        {/* LEAD initial + delay indicator */}
        <div className="flex items-end justify-between mt-auto">
          {slot.lead_phase ? (
            <span
              className="text-[9px] font-extrabold uppercase tracking-widest"
              style={{ color: leadColour ?? undefined }}
            >
              {slot.lead_phase.charAt(0)}
            </span>
          ) : <span />}
          {slot.screen_delay_secs > 0 && (
            <span className="text-[8px] text-[color:var(--cyan)] font-bold">
              +{slot.screen_delay_secs}s
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ContentPip({ type, label }: { type: string; label: string }) {
  const active = type && type !== "waiting";
  return (
    <div
      className={`text-[8px] font-bold rounded px-1 leading-[14px] uppercase ${
        active
          ? "bg-[color:var(--cyan)]/20 text-[color:var(--cyan)]"
          : "bg-border/30 text-muted-foreground"
      }`}
    >
      {label}
    </div>
  );
}

// ─────────────────────────────────────────────
// CONTEXT MENU
// ─────────────────────────────────────────────

function ContextMenu({
  x,
  y,
  sub,
  currentSlot,
  onSetSub,
  onDuplicate,
  onDelete,
  onInsertFeedbackBefore,
  onInsertFeedbackAfter,
  onSetEndBehaviour,
  onSetLeadPhase,
}: {
  x: number;
  y: number;
  sub: "end_behaviour" | "lead_phase" | null;
  currentSlot?: SlotDef;
  onSetSub: (s: "end_behaviour" | "lead_phase" | null) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onInsertFeedbackBefore: () => void;
  onInsertFeedbackAfter: () => void;
  onSetEndBehaviour: (v: string) => void;
  onSetLeadPhase: (v: string) => void;
}) {
  // Clamp to viewport
  const left = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 800) - 228);
  const top = Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 600) - 320);

  return (
    <div
      className="fixed z-50 w-56 bg-card border border-border rounded-xl shadow-2xl py-1 text-sm"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <CtxItem onClick={onDuplicate}>Duplicate</CtxItem>
      <CtxItem onClick={onInsertFeedbackBefore}>Insert feedback before</CtxItem>
      <CtxItem onClick={onInsertFeedbackAfter}>Insert feedback after</CtxItem>

      <div className="my-1 border-t border-border/50" />


      {/* LEAD phase submenu */}
      <div className="relative">
        <CtxItem
          onClick={() => onSetSub(sub === "lead_phase" ? null : "lead_phase")}
          arrow
          active={sub === "lead_phase"}
        >
          Set LEAD phase
        </CtxItem>
        {sub === "lead_phase" && (
          <div className="absolute left-full top-0 w-44 bg-card border border-border rounded-xl shadow-2xl py-1 ml-1">
            <CtxItem
              onClick={() => onSetLeadPhase("")}
              checked={!currentSlot?.lead_phase}
            >
              None
            </CtxItem>
            {LEAD_PHASES.map((p) => (
              <CtxItem
                key={p}
                onClick={() => onSetLeadPhase(p)}
                checked={currentSlot?.lead_phase === p}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: LEAD_COLOURS[p] }}
                  />
                  {p}
                </span>
              </CtxItem>
            ))}
          </div>
        )}
      </div>

      <div className="my-1 border-t border-border/50" />
      <CtxItem onClick={onDelete} danger>
        Delete slot
      </CtxItem>
    </div>
  );
}

function CtxItem({
  children,
  onClick,
  danger,
  active,
  checked,
  arrow,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
  checked?: boolean;
  arrow?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between gap-2
        ${danger ? "text-destructive hover:bg-destructive/10" : "hover:bg-accent text-foreground"}
        ${active ? "bg-accent" : ""}
      `}
    >
      <span className={checked ? "font-bold" : ""}>{children}</span>
      <span className="text-muted-foreground shrink-0">
        {checked ? "✓" : arrow ? "›" : ""}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────
// QUESTION MODAL
// Full question editor: create / edit questions, save to resource bucket or
// insert directly into the active slot (sets all three screen contents at once).
// ─────────────────────────────────────────────

function blankQuestion(type: QuestionDef["type"]): QuestionDef {
  return {
    id: crypto.randomUUID(),
    type,
    text: "",
    options: type === "multiple_choice" || type === "poll" ? ["", ""] : undefined,
    correct: type === "multiple_choice" ? 0 : undefined,
    correct_tf: type === "true_or_false" ? true : undefined,
    optional_qualitative: type === "likert" ? false : undefined,
  };
}

function QuestionModal({
  open,
  initial,
  onClose,
  onInsert,
  onSave,
}: {
  open: boolean;
  initial: QuestionDef | null;
  onClose: () => void;
  onInsert: (q: QuestionDef) => void;
  onSave: (q: QuestionDef) => Promise<void>;
}) {
  const [q, setQ] = useState<QuestionDef>(() => initial ?? blankQuestion("multiple_choice"));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setQ(initial ?? blankQuestion("multiple_choice"));
  }, [open, initial]);

  const setType = (type: QuestionDef["type"]) => setQ(blankQuestion(type));

  const setOption = (i: number, val: string) => {
    const opts = [...(q.options ?? [])];
    opts[i] = val;
    setQ({ ...q, options: opts });
  };

  const addOption = () => {
    if ((q.options?.length ?? 0) >= 6) return;
    setQ({ ...q, options: [...(q.options ?? []), ""] });
  };

  const removeOption = (i: number) => {
    const opts = (q.options ?? []).filter((_, j) => j !== i);
    setQ({ ...q, options: opts, correct: Math.min(q.correct ?? 0, Math.max(0, opts.length - 1)) });
  };

  const isValid =
    q.text.trim().length > 0 &&
    (q.type === "multiple_choice" || q.type === "poll"
      ? (q.options?.length ?? 0) >= 2 && q.options!.every((o) => o.trim().length > 0)
      : true);

  const handleSave = async () => {
    setSaving(true);
    await onSave(q);
    setSaving(false);
  };

  const QUESTION_TYPES: { value: QuestionDef["type"]; label: string }[] = [
    { value: "multiple_choice", label: "Multiple Choice" },
    { value: "true_or_false", label: "True / False" },
    { value: "poll", label: "Poll" },
    { value: "likert", label: "Likert Scale" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[color:var(--cyan)] uppercase tracking-[0.4em] text-sm font-extrabold">
            Question Editor
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Type selector */}
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {QUESTION_TYPES.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setType(value)}
                  className={`px-3 py-2 rounded-lg border text-[10px] uppercase tracking-widest font-bold transition-colors
                    ${q.type === value
                      ? "border-[color:var(--cyan)] text-[color:var(--cyan)] bg-[color:var(--cyan)]/10"
                      : "border-border text-muted-foreground hover:border-[color:var(--cyan)]/50"
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Question text */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Question text</Label>
            <Textarea
              value={q.text}
              onChange={(e) => setQ({ ...q, text: e.target.value })}
              placeholder="Enter your question…"
              rows={3}
              className="bg-background/60 border-border focus-visible:border-[color:var(--cyan)] resize-none"
            />
          </div>

          {/* multiple_choice / poll options */}
          {(q.type === "multiple_choice" || q.type === "poll") && (
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Options{q.type === "multiple_choice" ? " — click circle to mark correct" : ""}
              </Label>
              <div className="space-y-2">
                {(q.options ?? []).map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {q.type === "multiple_choice" && (
                      <button
                        onClick={() => setQ({ ...q, correct: i })}
                        title="Mark as correct"
                        className={`w-5 h-5 rounded-full border-2 shrink-0 transition-colors
                          ${q.correct === i
                            ? "border-[color:var(--success)] bg-[color:var(--success)]"
                            : "border-border hover:border-[color:var(--success)]/60"
                          }`}
                      />
                    )}
                    <span className="text-[10px] font-bold text-muted-foreground w-4 shrink-0 text-center">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <Input
                      value={opt}
                      onChange={(e) => setOption(i, e.target.value)}
                      placeholder={`Option ${String.fromCharCode(65 + i)}…`}
                      className="flex-1 h-8 text-xs bg-background/60 border-border focus-visible:border-[color:var(--cyan)]"
                    />
                    {(q.options?.length ?? 0) > 2 && (
                      <button
                        onClick={() => removeOption(i)}
                        className="text-muted-foreground hover:text-destructive transition-colors text-lg leading-none shrink-0 px-1"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {(q.options?.length ?? 0) < 6 && (
                <button
                  onClick={addOption}
                  className="text-[10px] uppercase tracking-widest text-[color:var(--cyan)] hover:opacity-70 transition-opacity"
                >
                  + Add option
                </button>
              )}
            </div>
          )}

          {/* true_or_false */}
          {q.type === "true_or_false" && (
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Correct answer</Label>
              <div className="flex gap-3">
                {([true, false] as const).map((v) => (
                  <button
                    key={String(v)}
                    onClick={() => setQ({ ...q, correct_tf: v })}
                    className={`flex-1 py-3 rounded-xl border-2 text-sm font-extrabold uppercase tracking-widest transition-colors
                      ${q.correct_tf === v
                        ? v
                          ? "border-[color:var(--success)] text-[color:var(--success)] bg-[color:var(--success)]/10"
                          : "border-destructive text-destructive bg-destructive/10"
                        : "border-border text-muted-foreground hover:border-border/80"
                      }`}
                  >
                    {v ? "True" : "False"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* likert */}
          {q.type === "likert" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground cursor-pointer">
                  Optional qualitative input
                </Label>
                <Switch
                  checked={Boolean(q.optional_qualitative)}
                  onCheckedChange={(v) => setQ({ ...q, optional_qualitative: v })}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Touch Screen 2 shows a 1–5 scale. Enable to allow students to add a short text response.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-border/40">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-10 uppercase tracking-widest text-[10px]"
              disabled={!isValid || saving}
              onClick={handleSave}
            >
              {saving ? "Saving…" : "Save to resource bucket"}
            </Button>
            <Button
              size="sm"
              className="flex-1 h-10 uppercase tracking-widest text-[10px]"
              disabled={!isValid}
              onClick={() => onInsert(q)}
            >
              Insert into slot
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// SLOT EDITOR PANEL
// ─────────────────────────────────────────────

function SlotEditorPanel({
  slot,
  lessonId,
  activeScreen,
  showEndBehaviourError,
  onActiveScreen,
  onUpdate,
}: {
  slot: SlotDef;
  lessonId: string;
  activeScreen: ActiveScreen;
  showEndBehaviourError: boolean;
  onActiveScreen: (s: ActiveScreen) => void;
  onUpdate: (patch: Partial<SlotDef>) => void;
}) {
  // Question modal
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionDef | null>(null);

  const handleInsertQuestion = (q: QuestionDef) => {
    onUpdate({
      screen2_content: { ...q } as ContentDef,
      host_content: { ...q } as ContentDef,
      screen1_content: {
        type: "teacher_note",
        text: `Question: ${q.text}\n\nWhen students are ready, click 'Reveal Results'.`,
        has_reveal_button: true,
        question_id: q.id,
      } as ContentDef,
      end_behaviour: "screen2_submit",
    });
    setQuestionModalOpen(false);
  };

  const handleSaveToResourceBucket = async (q: QuestionDef) => {
    const { data: lesson } = await supabase
      .from("lessons")
      .select("resource_bucket")
      .eq("id", lessonId)
      .single();
    const existing = (lesson?.resource_bucket as QuestionDef[] | null) ?? [];
    const updated = existing.some((r) => r.id === q.id)
      ? existing.map((r) => (r.id === q.id ? q : r))
      : [...existing, q];
    await supabase
      .from("lessons")
      .update({ resource_bucket: updated as never })
      .eq("id", lessonId);
  };

  // Timings removed — duration controls disabled.


  // The content object + updater for the active screen
  const screenContent =
    activeScreen === "host"
      ? slot.host_content
      : activeScreen === "screen1"
        ? slot.screen1_content
        : slot.screen2_content;

  const setContentType = (type: string) => {
    if (activeScreen === "host") onUpdate({ host_content: { ...screenContent, type } });
    else if (activeScreen === "screen1")
      onUpdate({ screen1_content: { ...screenContent, type } });
    else onUpdate({ screen2_content: { ...screenContent, type } });
  };

  const onContentUpdate = (patch: Record<string, unknown>) => {
    if (activeScreen === "host")
      onUpdate({ host_content: { ...screenContent, ...patch } });
    else if (activeScreen === "screen1")
      onUpdate({ screen1_content: { ...screenContent, ...patch } });
    else onUpdate({ screen2_content: { ...screenContent, ...patch } });
  };

  const typeOptions =
    activeScreen === "host"
      ? CONTENT_TYPES_HOST
      : activeScreen === "screen1"
        ? CONTENT_TYPES_SCREEN1
        : CONTENT_TYPES_SCREEN2;

  const SCREENS: { key: ActiveScreen; label: string }[] = [
    { key: "host", label: "Host" },
    { key: "screen1", label: "TS1" },
    { key: "screen2", label: "TS2" },
  ];

  return (
    <div className="w-80 shrink-0 border-l border-border/60 bg-background/60 backdrop-blur flex flex-col overflow-hidden">
      {/* Screen selector tabs */}
      <div className="grid grid-cols-3 border-b border-border/60 shrink-0">
        {SCREENS.map(({ key, label }, i) => (
          <button
            key={key}
            onClick={() => onActiveScreen(key)}
            className={`py-3 text-[10px] uppercase tracking-widest font-bold transition-colors border-b-2
              ${activeScreen === key ? "border-[color:var(--cyan)] text-[color:var(--cyan)]" : "border-transparent text-muted-foreground hover:text-foreground"}
              ${i < 2 ? "border-r border-r-border/40" : ""}
            `}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content type selector (changes per active screen) */}
      <div className="px-5 py-4 border-b border-border/60 space-y-2 shrink-0">
        <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Content type
        </Label>
        <Select value={screenContent.type} onValueChange={setContentType}>
          <SelectTrigger className="bg-background/60 border-border focus:border-[color:var(--cyan)] focus:ring-[color:var(--cyan)]">
            <SelectValue placeholder="Select type…" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            {typeOptions.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Question modal — portal-rendered outside the panel scroll */}
      <QuestionModal
        open={questionModalOpen}
        initial={editingQuestion}
        onClose={() => setQuestionModalOpen(false)}
        onInsert={handleInsertQuestion}
        onSave={handleSaveToResourceBucket}
      />

      {/* Shared slot settings (scrollable) */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Content type configuration form */}
        <ContentTypeForm
          content={screenContent}
          screen={activeScreen}
          lessonId={lessonId}
          onChange={onContentUpdate}
          onOpenQuestionModal={(existing) => {
            setEditingQuestion(existing ?? null);
            setQuestionModalOpen(true);
          }}
        />
        <div className="border-t border-border/40" />

        {/* Slot name */}
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Slot name (optional)
          </Label>
          <Input
            value={slot.name ?? ""}
            onChange={(e) => onUpdate({ name: e.target.value || null })}
            placeholder="e.g. Introduction, Task 1…"
            className="bg-background/60 border-border focus-visible:border-[color:var(--cyan)]"
          />
        </div>

        {/* Side-screen delay */}
        <div className="space-y-2">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Side screen delay
          </Label>
          <Select
            value={String(slot.screen_delay_secs ?? 0)}
            onValueChange={(v) => onUpdate({ screen_delay_secs: Number(v) })}
          >
            <SelectTrigger className="bg-background/60 border-border focus:border-[color:var(--cyan)] focus:ring-[color:var(--cyan)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="0">No delay</SelectItem>
              <SelectItem value="5">5 seconds</SelectItem>
              <SelectItem value="10">10 seconds</SelectItem>
              <SelectItem value="15">15 seconds</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            Side screens count down before revealing new content. Last 3 seconds show 3…2…1.
          </p>
        </div>

        <div className="border-t border-border/40" />

        {/* LEAD phase */}
        <div className="space-y-2">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            LEAD phase
          </Label>
          <Select
            value={slot.lead_phase ?? "none"}
            onValueChange={(v) => onUpdate({ lead_phase: v === "none" ? null : v })}
          >
            <SelectTrigger className="bg-background/60 border-border focus:border-[color:var(--cyan)] focus:ring-[color:var(--cyan)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="none">None</SelectItem>
              {LEAD_PHASES.map((p) => (
                <SelectItem key={p} value={p}>
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0 inline-block"
                      style={{ background: LEAD_COLOURS[p] }}
                    />
                    {p}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CONTENT TYPE FORM
// Renders the appropriate editor fields for the active screen's content type.
// ─────────────────────────────────────────────

function ContentTypeForm({
  content,
  screen,
  lessonId,
  onChange,
  onOpenQuestionModal,
}: {
  content: ContentDef;
  screen: ActiveScreen;
  lessonId: string;
  onChange: (patch: Record<string, unknown>) => void;
  onOpenQuestionModal?: (existing?: QuestionDef) => void;
}) {
  switch (content.type) {
    case "waiting":
      return (
        <div className="py-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          No configuration needed
        </div>
      );

    case "text_slide":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Text
            </Label>
            <Input
              value={String(content.text ?? "")}
              onChange={(e) => onChange({ text: e.target.value })}
              placeholder="Main text…"
              className="bg-background/60 border-border focus-visible:border-[color:var(--cyan)]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Subtitle (optional)
            </Label>
            <Input
              value={String(content.subtitle ?? "")}
              onChange={(e) => onChange({ subtitle: e.target.value })}
              placeholder="Subtitle…"
              className="bg-background/60 border-border focus-visible:border-[color:var(--cyan)]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Size
            </Label>
            <Select
              value={String(content.size ?? "xl")}
              onValueChange={(v) => onChange({ size: v })}
            >
              <SelectTrigger className="bg-background/60 border-border focus:border-[color:var(--cyan)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {(["sm", "md", "lg", "xl", "2xl"] as const).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Colour
            </Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={String(content.color ?? "#e2f4ff")}
                onChange={(e) => onChange({ color: e.target.value })}
                className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent"
              />
              <span className="text-[10px] font-mono text-muted-foreground">
                {String(content.color ?? "default")}
              </span>
              <button
                onClick={() => onChange({ color: undefined })}
                className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      );

    case "teacher_note":
      if (screen !== "host") {
        return (
          <div className="py-3 text-center text-[10px] uppercase tracking-widest text-[color:var(--orange)]">
            Teacher note only renders on the Host display
          </div>
        );
      }
      return (
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Note text
          </Label>
          <Textarea
            value={String(content.text ?? "")}
            onChange={(e) => onChange({ text: e.target.value })}
            placeholder="Teacher note — visible only on the Host display…"
            rows={5}
            className="bg-background/60 border-border focus-visible:border-[color:var(--cyan)] resize-none"
          />
        </div>
      );

    case "youtube":
      return (
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            YouTube URL
          </Label>
          <Input
            value={String(content.url ?? "")}
            onChange={(e) => onChange({ url: e.target.value })}
            placeholder="https://www.youtube.com/watch?v=…"
            className="bg-background/60 border-border focus-visible:border-[color:var(--cyan)]"
          />
          <p className="text-[10px] text-muted-foreground">
            Host plays with audio. Other screens auto-muted.
          </p>
        </div>
      );

    case "video_upload":
      return (
        <div className="space-y-3">
          <FileUploadField
            label="Video file"
            accept="video/mp4,video/webm"
            currentFileName={content.file_name ? String(content.file_name) : undefined}
            lessonId={lessonId}
            maxSizeMb={500}
            onUpload={(url, file_name) => onChange({ url, file_name })}
          />
          <div className="flex items-center justify-between">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground cursor-pointer">
              Loop video
            </Label>
            <Switch
              checked={content.loop !== false}
              onCheckedChange={(v) => onChange({ loop: v })}
            />
          </div>
        </div>
      );

    case "image":
      return (
        <FileUploadField
          label="Image file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          currentFileName={content.file_name ? String(content.file_name) : undefined}
          lessonId={lessonId}
          maxSizeMb={50}
          onUpload={(url, file_name) => onChange({ url, file_name })}
        />
      );

    case "embed": {
      const extractUrl = (raw: string): string => {
        const trimmed = raw.trim();
        const match = trimmed.match(/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i);
        if (match) return match[1];
        return trimmed;
      };
      return (
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            URL or embed code
          </Label>
          <Input
            value={String(content.url ?? "")}
            onChange={(e) => onChange({ url: extractUrl(e.target.value) })}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              const extracted = extractUrl(pasted);
              if (extracted !== pasted) {
                e.preventDefault();
                onChange({ url: extracted });
              }
            }}
            placeholder="https://… or paste full <iframe> snippet"
            className="bg-background/60 border-border focus-visible:border-[color:var(--cyan)]"
          />
          <p className="text-[10px] text-muted-foreground">
            Paste a URL or the full embed code — we extract the src automatically.
          </p>
        </div>
      );
    }

    case "webpage":
      return (
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Webpage URL
          </Label>
          <Input
            value={String(content.url ?? "")}
            onChange={(e) => onChange({ url: e.target.value.trim() })}
            placeholder="https://example.com"
            className="bg-background/60 border-border focus-visible:border-[color:var(--cyan)]"
          />
          <p className="text-[10px] text-muted-foreground">
            Loaded through a server proxy so sites that block iframes still render.
            Logins, OAuth, and anti-bot pages won't work.
          </p>
        </div>
      );

    case "html_upload":
      return (
        <FileUploadField
          label="HTML file"
          accept=".html,.htm"
          currentFileName={content.file_name ? String(content.file_name) : undefined}
          lessonId={lessonId}
          maxSizeMb={10}
          onUpload={(url, file_name) => onChange({ url, file_name })}
        />
      );

    case "confidence_checker":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Prompt
            </Label>
            <Input
              value={String(content.prompt ?? "")}
              onChange={(e) => onChange({ prompt: e.target.value })}
              placeholder="How confident are you?"
              className="bg-background/60 border-border focus-visible:border-[color:var(--cyan)]"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground cursor-pointer">
              Optional qualitative input
            </Label>
            <Switch
              checked={Boolean(content.optional_qualitative)}
              onCheckedChange={(v) => onChange({ optional_qualitative: v })}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Touch Screen 2 shows 1–5 scale. Host shows live bar chart.
          </p>
        </div>
      );

    case "wheel_spinner":
      return (
        <WheelItemsEditor
          items={(content.items as string[] | undefined) ?? []}
          onChange={(items) => onChange({ items })}
        />
      );

    case "countdown_timer": {
      const durationSecs = Number(content.duration_secs ?? 60);
      const mins = Math.floor(durationSecs / 60);
      const secs = durationSecs % 60;
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Label (optional)
            </Label>
            <Input
              value={String(content.label ?? "")}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="e.g. You have 2 minutes to complete this task…"
              className="bg-background/60 border-border focus-visible:border-[color:var(--cyan)]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Duration
            </Label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0}
                  max={99}
                  value={mins}
                  onChange={(e) => {
                    const m = Math.max(0, Math.min(99, Number(e.target.value) || 0));
                    onChange({ duration_secs: m * 60 + secs });
                  }}
                  className="w-16 bg-background/60 border-border focus-visible:border-[color:var(--cyan)] text-center"
                />
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">min</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={secs}
                  onChange={(e) => {
                    const s = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                    onChange({ duration_secs: mins * 60 + s });
                  }}
                  className="w-16 bg-background/60 border-border focus-visible:border-[color:var(--cyan)] text-center"
                />
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">sec</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Host controls Start / Pause / Reset. Timer syncs to all screens.
            </p>
          </div>
        </div>
      );
    }

    case "host_timer": {
      if (screen !== "host") {
        return (
          <div className="py-3 text-center text-[10px] uppercase tracking-widest text-[color:var(--orange)]">
            Host Timer only renders on the Host display
          </div>
        );
      }
      const durationSecs = Number(content.duration_secs ?? 60);
      const mins = Math.floor(durationSecs / 60);
      const secs = durationSecs % 60;
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Text above timer (optional)
            </Label>
            <Input
              value={String(content.label ?? "")}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="e.g. Complete the task in…"
              className="bg-background/60 border-border focus-visible:border-[color:var(--cyan)]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Duration
            </Label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0}
                  max={99}
                  value={mins}
                  onChange={(e) => {
                    const m = Math.max(0, Math.min(99, Number(e.target.value) || 0));
                    onChange({ duration_secs: m * 60 + secs });
                  }}
                  className="w-16 bg-background/60 border-border focus-visible:border-[color:var(--cyan)] text-center"
                />
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">min</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={secs}
                  onChange={(e) => {
                    const s = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                    onChange({ duration_secs: mins * 60 + s });
                  }}
                  className="w-16 bg-background/60 border-border focus-visible:border-[color:var(--cyan)] text-center"
                />
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">sec</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Timer is local to the Host display only — side screens are not affected.
            </p>
          </div>
        </div>
      );
    }

    case "multiple_choice":
    case "true_or_false":
    case "poll":
    case "likert":
      return (
        <div className="py-2 space-y-2">
          {content.text ? (
            <div className="text-xs text-foreground bg-card/60 rounded-lg px-3 py-2 truncate">
              {String(content.text)}
            </div>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="w-full h-9 uppercase tracking-widest text-[10px]"
            onClick={() => onOpenQuestionModal?.(content as unknown as QuestionDef)}
          >
            {content.text ? "Edit question ›" : "Configure question ›"}
          </Button>
        </div>
      );

    default:
      return null;
  }
}

// ─────────────────────────────────────────────
// FILE UPLOAD FIELD
// Handles Supabase Storage uploads for video, image, and HTML files.
// ─────────────────────────────────────────────

function FileUploadField({
  label,
  accept,
  currentFileName,
  lessonId,
  maxSizeMb,
  onUpload,
}: {
  label: string;
  accept: string;
  currentFileName?: string;
  lessonId: string;
  maxSizeMb: number;
  onUpload: (url: string, file_name: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > maxSizeMb * 1024 * 1024) {
      setUploadError(`File too large (max ${maxSizeMb} MB)`);
      return;
    }
    setUploadError(null);
    setUploading(true);
    const result = await uploadToStorage(file, lessonId);
    setUploading(false);
    if (!result) {
      setUploadError("Upload failed — try again");
      return;
    }
    onUpload(result.url, result.file_name);
  };

  return (
    <div className="space-y-2">
      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </Label>
      {currentFileName && (
        <div className="flex items-center gap-2 text-xs text-[color:var(--success)] bg-[color:var(--success)]/10 rounded-lg px-3 py-2">
          <span className="shrink-0">✓</span>
          <span className="truncate">{currentFileName}</span>
        </div>
      )}
      <label
        className={`flex items-center justify-center h-10 px-4 rounded-lg border border-dashed cursor-pointer text-[10px] uppercase tracking-widest transition-colors
          ${uploading
            ? "border-[color:var(--cyan)] text-[color:var(--cyan)] animate-pulse"
            : "border-border text-muted-foreground hover:border-[color:var(--cyan)]/50"
          }`}
      >
        {uploading ? "Uploading…" : currentFileName ? "Replace file" : "Choose file"}
        <input
          type="file"
          accept={accept}
          className="sr-only"
          onChange={handleFile}
          disabled={uploading}
        />
      </label>
      {uploadError && (
        <p className="text-[10px] text-destructive">{uploadError}</p>
      )}
      <p className="text-[10px] text-muted-foreground">Max {maxSizeMb} MB</p>
    </div>
  );
}

// ─────────────────────────────────────────────
// WHEEL ITEMS EDITOR
// Add / edit / remove items for the wheel spinner content type.
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// WHEEL ITEMS EDITOR
function WheelItemsEditor({
  items,
  onChange,
}: {
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [newItem, setNewItem] = useState("");

  const addItem = () => {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    onChange([...items, trimmed]);
    setNewItem("");
  };

  return (
    <div className="space-y-2">
      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
        Items ({items.length})
      </Label>
      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={item}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                onChange(next);
              }}
              className="flex-1 h-8 text-xs bg-background/60 border-border focus-visible:border-[color:var(--cyan)]"
            />
            <button
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-destructive transition-colors text-lg leading-none shrink-0 px-1"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          placeholder="Add item and press Enter…"
          className="flex-1 h-8 text-xs bg-background/60 border-border focus-visible:border-[color:var(--cyan)]"
        />
        <button
          onClick={addItem}
          className="px-3 h-8 border border-border rounded-md text-sm hover:border-[color:var(--cyan)] transition-colors"
        >
          +
        </button>
      </div>
    </div>
  );
}
