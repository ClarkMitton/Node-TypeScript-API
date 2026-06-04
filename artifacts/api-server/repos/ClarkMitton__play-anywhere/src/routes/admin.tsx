// Admin panel — Step 7
// PIN-protected (4158). Three tabs: Lessons, Data, Settings.
// Stage designer navigation wires to /admin/designer/$lessonId (created in Step 8).

import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

const ADMIN_PIN = "4158";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type ResourceFile = {
  name: string;
  url: string;
  type: string;
  size: number;
  path: string;
};

type Lesson = {
  id: string;
  title: string;
  description: string | null;
  estimated_duration_mins: number;
  ms_form_url: string | null;
  slots: unknown;
  resource_bucket: ResourceFile[] | null;
  featured: boolean;
  created_at: string;
  updated_at: string;
};

type SessionRow = {
  id: string;
  lesson_id: string | null;
  created_at: string;
  ended_at: string | null;
  status: string;
  lessonTitle?: string;
};

type ResponseRow = {
  id: string;
  session_id: string | null;
  slot_id: string | null;
  response_type: string;
  response_data: unknown;
  screen_role: string;
  created_at: string;
};

// ─────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────
export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin · Immersive Learning" }],
  }),
  component: AdminPage,
});

function AdminPage() {
  // Initialise to false on both server and client to avoid hydration mismatch.
  // Then read sessionStorage after mount to restore the unlock for the session.
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => {
    if (sessionStorage.getItem("admin_unlocked") === "1") setUnlocked(true);
  }, []);
  const handleUnlock = () => {
    sessionStorage.setItem("admin_unlocked", "1");
    setUnlocked(true);
  };

  // When a child route (e.g. /admin/designer/$lessonId) is active, render the
  // Outlet instead of the AdminPanel so the child component actually mounts.
  const matchRoute = useMatchRoute();
  const onChildRoute = !matchRoute({ to: "/admin", fuzzy: false });

  if (!unlocked) return <PinEntry onUnlock={handleUnlock} />;
  if (onChildRoute) return <Outlet />;
  return <AdminPanel />;
}

// ─────────────────────────────────────────────
// PIN ENTRY
// ─────────────────────────────────────────────
function PinEntry({ onUnlock }: { onUnlock: () => void }) {
  const [digits, setDigits] = useState("");
  const [shaking, setShaking] = useState(false);
  const [isError, setIsError] = useState(false);

  const press = useCallback(
    (d: string) => {
      setDigits((prev) => {
        if (prev.length >= 4) return prev;
        const next = prev + d;
        if (next.length === 4) {
          if (next === ADMIN_PIN) {
            // Brief delay so the last dot visibly fills before transition
            setTimeout(onUnlock, 150);
          } else {
            setShaking(true);
            setIsError(true);
            setTimeout(() => {
              setShaking(false);
              setIsError(false);
              setDigits("");
            }, 600);
          }
        }
        return next;
      });
    },
    [onUnlock],
  );

  const backspace = useCallback(() => setDigits((p) => p.slice(0, -1)), []);

  // Allow physical keyboard input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") press(e.key);
      else if (e.key === "Backspace") backspace();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [press, backspace]);

  return (
    <div className="min-h-screen bg-immersive bg-grid flex items-center justify-center p-8">
      <div className="text-center animate-slot-in">
        <div className="text-xs uppercase tracking-[0.4em] text-[color:var(--cyan)] mb-3">
          Bradford College · Admin
        </div>
        <h1 className="text-5xl font-extrabold text-glow mb-14">Enter PIN</h1>

        {/* PIN dot indicators */}
        <div className={`flex gap-5 justify-center mb-12 ${shaking ? "animate-shake" : ""}`}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-6 h-6 rounded-full border-2 transition-all duration-150 ${
                isError
                  ? "border-destructive bg-destructive"
                  : i < digits.length
                    ? "border-[color:var(--cyan)] bg-[color:var(--cyan)]"
                    : "border-[color:var(--cyan)]/40 bg-transparent"
              }`}
            />
          ))}
        </div>

        {/* Numpad — 3-column grid: 1-9, then ⌫ / 0 / [empty] */}
        <div className="grid grid-cols-3 gap-3 w-[280px] mx-auto">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <PadBtn key={n} label={String(n)} onClick={() => press(String(n))} />
          ))}
          <PadBtn label="⌫" onClick={backspace} variant="muted" />
          <PadBtn label="0" onClick={() => press("0")} />
          <div /> {/* intentional blank cell */}
        </div>
      </div>
    </div>
  );
}

function PadBtn({
  label,
  onClick,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  variant?: "default" | "muted";
}) {
  return (
    <button
      onClick={onClick}
      className={`h-20 w-full rounded-2xl border-2 text-3xl font-bold bg-card/60 backdrop-blur transition-all duration-100 active:scale-95 ${
        variant === "muted"
          ? "border-border text-muted-foreground hover:border-[color:var(--orange)] hover:text-[color:var(--orange)]"
          : "border-[color:var(--cyan)]/30 text-foreground hover:border-[color:var(--cyan)] hover:bg-[color:var(--cyan)]/10"
      }`}
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────
// ADMIN PANEL SHELL
// ─────────────────────────────────────────────
function AdminPanel() {
  return (
    <div className="min-h-screen bg-immersive bg-grid">
      <header className="flex items-center justify-between px-8 py-6 border-b border-border/60">
        <div>
          <div className="text-xs uppercase tracking-[0.4em] text-[color:var(--cyan)]">
            Bradford College · Admin
          </div>
          <h1 className="text-3xl font-extrabold mt-1 text-glow">Immersive Learning</h1>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/admin/test"
            className="text-xs uppercase tracking-widest h-10 px-4 inline-flex items-center rounded-md border border-[color:var(--orange)]/50 text-[color:var(--orange)] hover:bg-[color:var(--orange)]/10 transition-colors"
          >
            ⚡ Test Mode
          </a>
          <a
            href="/"
            className="text-sm text-muted-foreground hover:text-[color:var(--cyan)] transition-colors uppercase tracking-widest"
          >
            ← Launcher
          </a>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-8 py-8">
        <Tabs defaultValue="lessons">
          <TabsList className="mb-8 bg-card/60 border border-border">
            <TabsTrigger value="lessons" className="uppercase tracking-widest text-sm px-6">
              Lessons
            </TabsTrigger>
            <TabsTrigger value="data" className="uppercase tracking-widest text-sm px-6">
              Data
            </TabsTrigger>
            <TabsTrigger value="settings" className="uppercase tracking-widest text-sm px-6">
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lessons">
            <LessonsTab />
          </TabsContent>
          <TabsContent value="data">
            <DataTab />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// LESSONS TAB
// ─────────────────────────────────────────────
function LessonsTab() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Lesson | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const loadLessons = useCallback(async () => {
    const { data } = await supabase
      .from("lessons")
      .select("*")
      .order("created_at", { ascending: false });
    setLessons((data ?? []) as Lesson[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadLessons();
  }, [loadLessons]);

  const toggleFeatured = async (lesson: Lesson) => {
    const next = !lesson.featured;
    if (next) {
      // Enforce only one featured lesson at a time
      await supabase.from("lessons").update({ featured: false }).neq("id", lesson.id);
    }
    await supabase.from("lessons").update({ featured: next }).eq("id", lesson.id);
    loadLessons();
  };

  const deleteLesson = async (lesson: Lesson) => {
    await supabase.from("lessons").delete().eq("id", lesson.id);
    setDeleteTarget(null);
    loadLessons();
  };

  const handleBatchUpload = async (lesson: Lesson, files: FileList) => {
    setUploadingFor(lesson.id);
    const uploaded: ResourceFile[] = [];

    for (const file of Array.from(files)) {
      // Sanitise filename to avoid storage path issues
      const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const path = `lessons/${lesson.id}/${safeName}`;

      const { error } = await supabase.storage
        .from("lesson-media")
        .upload(path, file, { upsert: true });

      if (!error) {
        const {
          data: { publicUrl },
        } = supabase.storage.from("lesson-media").getPublicUrl(path);
        uploaded.push({ name: file.name, url: publicUrl, type: file.type, size: file.size, path });
      }
    }

    if (uploaded.length > 0) {
      const existing = Array.isArray(lesson.resource_bucket) ? lesson.resource_bucket : [];
      await supabase
        .from("lessons")
        .update({ resource_bucket: [...existing, ...uploaded] })
        .eq("id", lesson.id);
      loadLessons();
    }

    setUploadingFor(null);
  };

  if (loading) {
    return <div className="text-muted-foreground text-center py-24 text-xl">Loading…</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-extrabold uppercase tracking-widest">
          Lessons ({lessons.length})
        </h2>
        <Button
          onClick={() => setCreateOpen(true)}
          className="h-11 px-6 uppercase tracking-widest"
        >
          + New Lesson
        </Button>
      </div>

      {lessons.length === 0 ? (
        <div className="text-center py-24 animate-slot-in">
          <div className="text-4xl font-extrabold mb-3">No lessons yet</div>
          <div className="text-muted-foreground mb-8">
            Create your first lesson to get started.
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="h-14 px-8 text-lg uppercase tracking-widest"
          >
            Create Lesson
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {lessons.map((lesson) => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              onFeatured={() => toggleFeatured(lesson)}
              onEdit={() => {
                // Designer route is created in Step 8
                window.location.href = `/admin/designer/${lesson.id}`;
              }}
              onDelete={() => setDeleteTarget(lesson)}
              onUpload={(files) => handleBatchUpload(lesson, files)}
              uploading={uploadingFor === lesson.id}
            />
          ))}
        </div>
      )}

      <CreateLessonModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(lesson) => {
          setCreateOpen(false);
          loadLessons();
          // Navigate to stage designer (Step 8)
          window.location.href = `/admin/designer/${lesson.id}`;
        }}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.title}"?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This permanently removes the lesson and all its slots. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteLesson(deleteTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Lesson card ──────────────────────────────
function LessonCard({
  lesson,
  onFeatured,
  onEdit,
  onDelete,
  onUpload,
  uploading,
}: {
  lesson: Lesson;
  onFeatured: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUpload: (files: FileList) => void;
  uploading: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const fileCount = Array.isArray(lesson.resource_bucket) ? lesson.resource_bucket.length : 0;

  return (
    <div className="bg-card/60 backdrop-blur border border-border rounded-2xl p-6 animate-slot-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-xl font-extrabold">{lesson.title}</h3>
            {lesson.featured && (
              <Badge className="bg-[color:var(--orange)]/20 text-[color:var(--orange)] border border-[color:var(--orange)]/40 uppercase tracking-widest text-[10px] px-2">
                Featured
              </Badge>
            )}
          </div>
          {lesson.description && (
            <p className="text-muted-foreground mt-1 text-sm max-w-2xl">{lesson.description}</p>
          )}
          <div className="flex items-center gap-5 mt-3 text-xs uppercase tracking-widest text-muted-foreground">
            <span>{lesson.estimated_duration_mins}m</span>
            {fileCount > 0 && (
              <span>
                {fileCount} file{fileCount !== 1 ? "s" : ""}
              </span>
            )}
            {lesson.ms_form_url && (
              <span className="text-[color:var(--cyan)]">Form linked</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={onFeatured}
            className={`uppercase tracking-widest text-xs h-9 px-3 transition-colors ${
              lesson.featured
                ? "border-[color:var(--orange)] text-[color:var(--orange)]"
                : "border-border text-muted-foreground"
            }`}
          >
            {lesson.featured ? "★ Featured" : "☆ Feature"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="uppercase tracking-widest text-xs h-9 px-3"
          >
            {uploading ? "Uploading…" : "↑ Files"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) onUpload(e.target.files);
              // Reset so the same file can be picked again
              e.target.value = "";
            }}
          />

          <Button
            size="sm"
            variant="outline"
            onClick={onEdit}
            className="uppercase tracking-widest text-xs h-9 px-3"
          >
            Edit
          </Button>

          <Button
            size="sm"
            variant="destructive"
            onClick={onDelete}
            className="uppercase tracking-widest text-xs h-9 px-3"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Create lesson modal ──────────────────────
function CreateLessonModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (lesson: Lesson) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("30");
  const [formUrl, setFormUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setDescription("");
    setDuration("30");
    setFormUrl("");
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const save = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    const { data, error: err } = await supabase
      .from("lessons")
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        estimated_duration_mins: parseInt(duration) || 30,
        ms_form_url: formUrl.trim() || null,
        slots: [],
        resource_bucket: [],
      })
      .select()
      .single();
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    reset();
    onCreate(data as Lesson);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl font-extrabold">New Lesson</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label className="uppercase tracking-widest text-xs text-muted-foreground">
              Title *
            </Label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="e.g. Introduction to Anatomy"
              className="bg-background/60 border-border focus-visible:border-[color:var(--cyan)] focus-visible:ring-[color:var(--cyan)]"
            />
          </div>

          <div className="space-y-2">
            <Label className="uppercase tracking-widest text-xs text-muted-foreground">
              Description
            </Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief overview of the lesson"
              className="bg-background/60 border-border focus-visible:border-[color:var(--cyan)] focus-visible:ring-[color:var(--cyan)]"
            />
          </div>

          <div className="space-y-2">
            <Label className="uppercase tracking-widest text-xs text-muted-foreground">
              Duration (mins)
            </Label>
            <Input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              min={1}
              max={240}
              className="bg-background/60 border-border focus-visible:border-[color:var(--cyan)] focus-visible:ring-[color:var(--cyan)]"
            />
          </div>

          <div className="space-y-2">
            <Label className="uppercase tracking-widest text-xs text-muted-foreground">
              MS Forms URL
            </Label>
            <Input
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="https://forms.office.com/…"
              className="bg-background/60 border-border focus-visible:border-[color:var(--cyan)] focus-visible:ring-[color:var(--cyan)]"
            />
          </div>

          {error && (
            <div className="text-destructive text-sm uppercase tracking-widest">{error}</div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving || !title.trim()}
            className="uppercase tracking-widest"
          >
            {saving ? "Creating…" : "Create & Design"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// DATA TAB
// ─────────────────────────────────────────────
type ConfidenceGroup = {
  sessionId: string;
  date: string;
  lessonTitle: string;
  average: number;
  count: number;
};

function DataTab() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [sessRes, respRes, lessRes] = await Promise.all([
        supabase
          .from("sessions")
          .select("id, lesson_id, created_at, ended_at, status")
          .order("created_at", { ascending: false }),
        supabase
          .from("responses")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("lessons").select("id, title"),
      ]);

      const lessonMap = new Map(
        ((lessRes.data ?? []) as { id: string; title: string }[]).map((l) => [l.id, l.title]),
      );

      const sessWithTitle = ((sessRes.data ?? []) as SessionRow[]).map((s) => ({
        ...s,
        lessonTitle: s.lesson_id ? (lessonMap.get(s.lesson_id) ?? "Unknown lesson") : "—",
      }));

      setSessions(sessWithTitle);
      setResponses((respRes.data ?? []) as ResponseRow[]);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="text-muted-foreground text-center py-24 text-xl">Loading data…</div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-24 animate-slot-in">
        <div className="text-4xl font-extrabold mb-3">No data yet</div>
        <div className="text-muted-foreground">Run some sessions to see results here.</div>
      </div>
    );
  }

  // Build per-session confidence checker averages
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  const ccResponses = responses.filter((r) => r.response_type === "confidence_checker");

  const ccBySession = ccResponses.reduce<Map<string, ResponseRow[]>>((acc, r) => {
    const key = r.session_id ?? "";
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key)!.push(r);
    return acc;
  }, new Map());

  const confidenceGroups: ConfidenceGroup[] = [];
  for (const [sid, resps] of ccBySession) {
    const sess = sessionMap.get(sid);
    if (!sess) continue;
    const scores = resps
      .map((r) => {
        const d = r.response_data as Record<string, unknown>;
        return typeof d?.score === "number" ? d.score : null;
      })
      .filter((s): s is number => s !== null);
    if (scores.length === 0) continue;
    confidenceGroups.push({
      sessionId: sid,
      date: new Date(sess.created_at).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      lessonTitle: sess.lessonTitle ?? "—",
      average: scores.reduce((a, b) => a + b, 0) / scores.length,
      count: scores.length,
    });
  }

  const pollLikertCount = responses.filter(
    (r) => r.response_type === "poll" || r.response_type === "likert",
  ).length;

  return (
    <div className="space-y-12">
      {/* Sessions table */}
      <section>
        <h2 className="text-lg font-extrabold uppercase tracking-widest mb-5 text-[color:var(--cyan)]">
          Sessions ({sessions.length})
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground border-b border-border bg-card/40">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Lesson</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Responses</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const durationMs =
                  s.ended_at
                    ? new Date(s.ended_at).getTime() - new Date(s.created_at).getTime()
                    : null;
                const durationMins =
                  durationMs !== null ? Math.round(durationMs / 60000) : null;
                const respCount = responses.filter((r) => r.session_id === s.id).length;
                return (
                  <tr
                    key={s.id}
                    className="border-b border-border/40 hover:bg-card/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3 px-4 font-medium">{s.lessonTitle}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`uppercase tracking-widest text-xs font-bold ${
                          s.status === "active"
                            ? "text-[color:var(--success)]"
                            : s.status === "ended"
                              ? "text-muted-foreground"
                              : "text-[color:var(--cyan)]"
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {durationMins !== null ? `${durationMins}m` : "—"}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{respCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Confidence checker results */}
      {confidenceGroups.length > 0 && (
        <section>
          <h2 className="text-lg font-extrabold uppercase tracking-widest mb-5 text-[color:var(--cyan)]">
            Confidence Check Results
          </h2>
          <div className="grid gap-3">
            {confidenceGroups.map((g) => (
              <div
                key={g.sessionId}
                className="bg-card/60 rounded-xl border border-border p-4 flex items-center justify-between gap-4"
              >
                <div>
                  <div className="font-bold">{g.lessonTitle}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
                    {g.date} · {g.count} response{g.count !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
                    Avg score
                  </div>
                  <div
                    className={`text-3xl font-extrabold ${
                      g.average >= 4
                        ? "text-[color:var(--success)]"
                        : g.average >= 3
                          ? "text-[color:var(--cyan)]"
                          : "text-[color:var(--orange)]"
                    }`}
                  >
                    {g.average.toFixed(1)}
                    <span className="text-base text-muted-foreground">/5</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Poll / Likert placeholder */}
      {pollLikertCount > 0 && (
        <section>
          <h2 className="text-lg font-extrabold uppercase tracking-widest mb-5 text-[color:var(--cyan)]">
            Poll &amp; Likert Responses
          </h2>
          <div className="bg-card/60 rounded-xl border border-border p-6 text-muted-foreground">
            {pollLikertCount} response{pollLikertCount !== 1 ? "s" : ""} collected. Full
            breakdown available once the question system (Step 10) is live.
          </div>
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// SETTINGS TAB
// ─────────────────────────────────────────────
function SettingsTab() {
  return (
    <div className="flex items-center justify-center min-h-[50vh] animate-slot-in">
      <div className="text-center max-w-md">
        <div className="text-xs uppercase tracking-[0.5em] text-[color:var(--orange)] mb-4">
          Settings
        </div>
        <h2 className="text-5xl font-extrabold text-glow mb-5">Coming soon</h2>
        <p className="text-muted-foreground leading-relaxed">
          Volume controls, PIN change, screen layout preferences, and Supabase connection
          diagnostics land here in a future step.
        </p>
      </div>
    </div>
  );
}
