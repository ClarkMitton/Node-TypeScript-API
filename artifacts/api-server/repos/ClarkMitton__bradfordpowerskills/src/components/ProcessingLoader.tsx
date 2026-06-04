import { Clock, CheckCircle2, Loader2 } from "lucide-react";
import { RotatingInsight } from "@/components/RotatingInsight";
import { cn } from "@/lib/utils";

interface ProcessingLoaderProps {
  isTranscribing: boolean;
  elapsed?: number;
}

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

export function ProcessingLoader({ isTranscribing, elapsed }: ProcessingLoaderProps) {
  const transcribeComplete = !isTranscribing;
  const analysingActive = !isTranscribing;

  return (
    <div className="section-fade-in flex flex-col items-center justify-center py-16 space-y-8">
      {/* Two-stage progress */}
      <div className="w-full max-w-sm space-y-4">
        {/* Stage 1: Transcription */}
        <div className={cn(
          "flex items-center gap-4 p-4 rounded-xl border transition-colors",
          transcribeComplete
            ? "bg-success/5 border-success/20"
            : "bg-primary/5 border-primary/20"
        )}>
          <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center">
            {transcribeComplete ? (
              <CheckCircle2 className="w-9 h-9 text-success" />
            ) : (
              <Loader2 className="w-9 h-9 text-primary animate-spin" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn(
              "font-semibold text-sm",
              transcribeComplete ? "text-success" : "text-primary"
            )}>
              Stage 1: Transcribing your recording...
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {transcribeComplete ? "Complete" : "Converting audio to text and anonymising names"}
            </p>
          </div>
          {!transcribeComplete && elapsed !== undefined && (
            <div className="flex-shrink-0 flex items-center gap-1 text-xs font-mono text-primary bg-primary/10 px-2 py-1 rounded-full">
              <Clock className="w-3 h-3" />
              {formatTime(elapsed)}
            </div>
          )}
        </div>

        {/* Connector */}
        <div className="flex justify-center">
          <div className={cn(
            "w-px h-4 transition-colors",
            transcribeComplete ? "bg-success/40" : "bg-border"
          )} />
        </div>

        {/* Stage 2: Feedback generation */}
        <div className={cn(
          "flex items-center gap-4 p-4 rounded-xl border transition-colors",
          analysingActive
            ? "bg-primary/5 border-primary/20"
            : "bg-muted/40 border-border"
        )}>
          <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center">
            {analysingActive ? (
              <Loader2 className="w-9 h-9 text-primary animate-spin" />
            ) : (
              <div className="w-9 h-9 rounded-full border-2 border-dashed border-muted-foreground/30" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn(
              "font-semibold text-sm",
              analysingActive ? "text-primary" : "text-muted-foreground"
            )}>
              Stage 2: Generating your feedback...
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {analysingActive ? "AI is reviewing your session in detail" : "Waiting for transcription"}
            </p>
          </div>
        </div>
      </div>

      <RotatingInsight />
    </div>
  );
}
