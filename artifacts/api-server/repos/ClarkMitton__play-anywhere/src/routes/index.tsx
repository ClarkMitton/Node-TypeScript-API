// Launcher — /
// Shows a featured lesson hero card (if any featured lesson exists) or a grid
// of all lessons. Clicking Launch creates a new session and redirects to /host.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { generateCode } from "@/lib/codes";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Immersive Learning · Bradford College" },
      { name: "description", content: "Launcher for immersive lessons across Host and Touch Screens." },
    ],
  }),
  component: Launcher,
});

type Lesson = {
  id: string;
  title: string;
  description: string | null;
  estimated_duration_mins: number;
  featured: boolean;
};

function Launcher() {
  const navigate = useNavigate();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("lessons")
        .select("id, title, description, estimated_duration_mins, featured")
        .order("featured", { ascending: false })
        .order("created_at", { ascending: false });
      setLessons((data ?? []) as Lesson[]);
      setLoading(false);
    })();
  }, []);

  const launch = async (lessonId: string) => {
    setLaunching(lessonId);
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        lesson_id: lessonId,
        host_code: generateCode(),
        screen1_code: generateCode(),
        screen2_code: generateCode(),
        status: "waiting",
        state: {},
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("Failed to create session:", error);
      setLaunching(null);
      return;
    }
    navigate({ to: "/host", search: { session: data.id } as never });
  };

  const featured = lessons.filter((l) => l.featured);
  const showHero = featured.length > 0;
  const displayList = showHero ? featured : lessons;

  return (
    <div className="min-h-screen bg-immersive bg-grid">
      <header className="flex items-center justify-between p-8">
        <div>
          <div className="text-xs uppercase tracking-[0.4em] text-[color:var(--cyan)]">Bradford College</div>
          <h1 className="text-4xl font-extrabold mt-1 text-glow">Immersive Learning</h1>
        </div>
        <Link to="/admin">
          <Button variant="outline" className="h-12 px-6 uppercase tracking-widest">
            Build
          </Button>
        </Link>
      </header>

      <main className="px-8 pb-16 max-w-5xl mx-auto">
        {loading ? (
          <div className="text-muted-foreground text-center py-24 text-xl">Loading…</div>
        ) : lessons.length === 0 ? (
          <div className="text-center py-24 animate-slot-in">
            <div className="text-3xl font-bold mb-3">No lessons yet</div>
            <div className="text-muted-foreground mb-8">Create one in the Admin panel to get started.</div>
            <Link to="/admin">
              <Button className="h-14 px-8 text-lg uppercase tracking-widest">Open Admin</Button>
            </Link>
          </div>
        ) : showHero ? (
          // ── Featured hero card(s) ──────────────────
          <div className="space-y-6 animate-slot-in">
            <div className="text-xs uppercase tracking-[0.4em] text-[color:var(--orange)] mb-2">Featured</div>
            {displayList.map((l) => (
              <div
                key={l.id}
                className="bg-card/70 backdrop-blur border-2 border-[color:var(--cyan)]/40 hover:border-[color:var(--cyan)] transition-colors rounded-3xl p-10"
                style={{ boxShadow: "0 0 40px color-mix(in oklab, var(--cyan) 10%, transparent)" }}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                  <div className="flex-1">
                    <h2 className="text-4xl font-extrabold text-glow mb-3">{l.title}</h2>
                    {l.description && (
                      <p className="text-muted-foreground text-lg max-w-2xl">{l.description}</p>
                    )}
                    <div className="mt-4 text-xs uppercase tracking-widest text-[color:var(--cyan)]">
                      {l.estimated_duration_mins} minutes
                    </div>
                  </div>
                  <Button
                    onClick={() => launch(l.id)}
                    disabled={launching !== null}
                    className="h-20 px-14 text-2xl uppercase tracking-widest font-extrabold shrink-0 disabled:opacity-50"
                  >
                    {launching === l.id ? "Launching…" : "Launch"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // ── Lesson grid ───────────────────────────
          <div className="space-y-5">
            {displayList.map((l) => (
              <div
                key={l.id}
                className="bg-card/60 backdrop-blur border border-border hover:border-[color:var(--cyan)]/60 transition-colors rounded-2xl p-6 animate-slot-in flex items-center justify-between gap-6"
              >
                <div className="flex-1">
                  <h2 className="text-2xl font-extrabold">{l.title}</h2>
                  {l.description && (
                    <p className="text-muted-foreground mt-1 max-w-2xl">{l.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-widest text-[color:var(--cyan)]">Duration</div>
                    <div className="text-2xl font-bold">{l.estimated_duration_mins}m</div>
                  </div>
                  <Button
                    onClick={() => launch(l.id)}
                    disabled={launching !== null}
                    className="h-14 px-8 text-lg uppercase tracking-widest font-extrabold disabled:opacity-50"
                  >
                    {launching === l.id ? "Launching…" : "Launch"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
