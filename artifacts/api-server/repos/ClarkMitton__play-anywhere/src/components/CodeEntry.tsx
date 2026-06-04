// Shared code-entry surface for Touch Screen 1 and Touch Screen 2.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CodeEntry({
  screenLabel,
  onSubmit,
  error,
  busy,
}: {
  screenLabel: string;
  onSubmit: (code: string) => void;
  error?: string | null;
  busy?: boolean;
}) {
  const [code, setCode] = useState("");

  return (
    <div className="min-h-screen bg-immersive bg-grid flex items-center justify-center p-6">
      <div className="w-full max-w-xl text-center animate-slot-in">
        <div className="text-xs uppercase tracking-[0.4em] text-[color:var(--cyan)] mb-3">
          Bradford College · Immersive Learning
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold mb-2 text-glow">{screenLabel}</h1>
        <p className="text-muted-foreground mb-10 text-lg">Enter the 6-character code shown on the Host display.</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length >= 4) onSubmit(code.trim().toUpperCase());
          }}
          className="space-y-6"
        >
          <Input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))}
            maxLength={6}
            placeholder="ABC123"
            className="code-display text-center text-5xl h-24 bg-card/60 border-2 border-[color:var(--cyan)]/30 focus-visible:border-[color:var(--cyan)] focus-visible:ring-[color:var(--cyan)]"
          />
          {error && <div className="text-destructive uppercase tracking-widest text-sm">{error}</div>}
          <Button
            type="submit"
            disabled={busy || code.length < 4}
            className="w-full h-16 text-xl uppercase tracking-widest font-bold"
          >
            {busy ? "Connecting…" : "Connect"}
          </Button>
        </form>
      </div>
    </div>
  );
}
