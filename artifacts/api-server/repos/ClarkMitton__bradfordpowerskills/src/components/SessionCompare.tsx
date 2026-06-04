import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Mic, X, AlertCircle, Loader2, Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { UserRole } from "@/components/WelcomeScreen";

// ── Shared types ──────────────────────────────────────────────────────────────

export interface ITTECFEvidence {
  standard: string;
  title: string;
  sessionA: boolean;
  sessionB: boolean;
}

export interface ComparisonData {
  sessionA: { mvpMoment: string };
  sessionB: { mvpMoment: string };
  embedding?: string | null;
  growth?: string | null;
  resolved?: string | null;
  persistent?: string | null;
  standardEnglishTrajectory?: string | null;
  focusForNextSession?: string | null;
  ittecfEvidence?: ITTECFEvidence[] | null;
}

// ── Input mode types ──────────────────────────────────────────────────────────

type CompareInputMode = "pdf-pdf" | "pdf-audio" | "audio-audio";

interface ProcessedSlot {
  type: "pdf" | "audio";
  file: File;
  filename: string;
  /** For PDFs: base64 content. For audio: serialised feedback text after processing */
  payload: string;
  /** Audio processing state */
  processingStage?: "transcribing" | "analysing" | "done" | "error";
  processingError?: string;
}

// ── Upload zone sub-component ─────────────────────────────────────────────────

interface UploadZoneProps {
  label: string;
  accept: string;
  acceptLabel: string;
  slot: ProcessedSlot | null;
  error: string | null;
  isLoading: boolean;
  loadingLabel?: string;
  onFile: (file: File) => void;
  onClear: () => void;
}

function UploadZone({ label, accept, acceptLabel, slot, error, isLoading, loadingLabel, onFile, onClear }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  const isProcessing = slot?.processingStage === "transcribing" || slot?.processingStage === "analysing";
  const isDone = slot?.processingStage === "done";
  const hasProcessingError = slot?.processingStage === "error";

  return (
    <div className="space-y-2 flex-1">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-6 text-center transition-all min-h-[140px] flex items-center justify-center",
          isDragging && "border-primary bg-primary/5",
          !isDragging && !slot && !error && "border-border hover:border-primary/50 hover:bg-secondary/30",
          slot && !hasProcessingError && "border-success bg-success/5",
          (error || hasProcessingError) && "border-destructive/50 bg-destructive/5"
        )}
      >
        {slot ? (
          <div className="flex flex-col items-center gap-3 w-full">
            {isProcessing ? (
              <>
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">
                  {slot.processingStage === "transcribing" ? "Transcribing audio..." : "Generating feedback..."}
                </p>
              </>
            ) : (
              <>
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", isDone ? "bg-success/10" : "bg-success/10")}>
                  {isDone ? (
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  ) : slot.type === "audio" ? (
                    <Mic className="w-5 h-5 text-success" />
                  ) : (
                    <FileText className="w-5 h-5 text-success" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground text-sm truncate max-w-[200px] mx-auto">
                    {slot.filename}
                  </p>
                  {isDone && (
                    <p className="text-xs text-success mt-1">Feedback generated ✓</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClear}
                  className="text-muted-foreground hover:text-destructive h-7 w-7"
                >
                  <X className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">{loadingLabel || "Reading file..."}</p>
          </div>
        ) : (
          <>
            <input
              type="file"
              accept={accept}
              onChange={handleChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="space-y-3 pointer-events-none">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Upload className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Drop file here</p>
                <p className="text-xs text-muted-foreground mt-1">or click to browse ({acceptLabel})</p>
              </div>
            </div>
          </>
        )}
      </div>
      {(error || hasProcessingError) && (
        <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{error || slot?.processingError}</p>
        </div>
      )}
    </div>
  );
}

// ── Helper: file to base64 ───────────────────────────────────────────────────

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// ── Helper: process audio file through the full pipeline ─────────────────────

async function processAudioForComparison(
  audioFile: File,
  userRole: UserRole | null,
  onStageChange: (stage: "transcribing" | "analysing" | "done" | "error", error?: string) => void
): Promise<string> {
  // Step 1: Transcribe
  onStageChange("transcribing");

  const formData = new FormData();
  formData.append("audio", audioFile, audioFile.name);

  const transcribeResponse = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: formData,
    }
  );

  if (!transcribeResponse.ok) {
    const err = await transcribeResponse.json().catch(() => ({}));
    throw new Error(err.error || "Transcription failed");
  }

  const transcription = await transcribeResponse.json();
  const transcript = transcription.text;

  if (!transcript || transcript.trim().length === 0) {
    throw new Error("Transcription returned empty — the audio may be too short or unclear.");
  }

  // Step 2: Analyse
  onStageChange("analysing");

  const { data: feedback, error: analyseError } = await supabase.functions.invoke("analyze-session", {
    body: {
      transcript,
      selectedPhases: ["full"],
      lessonPlan: "",
      scaffolding: "",
      studentWork: "",
      mode: "quick",
      learnerLevel: "",
      subject: "",
      selectedCategories: [],
      userRole: userRole || "staff",
    },
  });

  if (analyseError) {
    throw new Error(analyseError.message || "Analysis failed");
  }

  // Step 3: Serialize feedback into readable text for comparison
  const reportText = serializeFeedbackToText(feedback);
  onStageChange("done");
  return reportText;
}

/** Turn structured feedback JSON into readable text the comparison AI can parse */
function serializeFeedbackToText(feedback: any): string {
  const lines: string[] = [];
  lines.push("=== PowerED Session Feedback Report ===\n");

  if (feedback.overallSummary) {
    lines.push("## Overall Summary");
    lines.push(feedback.overallSummary + "\n");
  }

  if (feedback.topStrength) {
    lines.push("## Top Strength");
    lines.push(feedback.topStrength + "\n");
  }

  if (feedback.priorityGrowthArea) {
    lines.push("## Priority Growth Area");
    lines.push(feedback.priorityGrowthArea + "\n");
  }

  if (feedback.categories && Array.isArray(feedback.categories)) {
    lines.push("## Domain Feedback\n");
    for (const cat of feedback.categories) {
      lines.push(`### ${cat.name} (Rating: ${cat.rating})`);
      if (cat.whatsWorking) lines.push(`What's Working Well: ${cat.whatsWorking}`);
      if (cat.toMakeStronger) lines.push(`To Make It Even Stronger: ${cat.toMakeStronger}`);
      if (cat.tryThisNext) lines.push(`Try This Next Time: ${cat.tryThisNext}`);
      lines.push("");
    }
  }

  if (feedback.standardEnglish) {
    lines.push("## Standard English");
    lines.push(`Stars: ${feedback.standardEnglish.stars}/5`);
    if (feedback.standardEnglish.feedback) lines.push(feedback.standardEnglish.feedback);
    lines.push("");
  }

  if (feedback.ittecfIndicators && Array.isArray(feedback.ittecfIndicators)) {
    lines.push("## ITTECF Indicators Evidenced\n");
    for (const ind of feedback.ittecfIndicators) {
      lines.push(`- Standard ${ind.standard} ${ind.subCode}: ${ind.statement} [${ind.status}]`);
      if (ind.evidence) lines.push(`  Evidence: ${ind.evidence}`);
    }
    lines.push("");
  }

  if (feedback.leadPhases && Array.isArray(feedback.leadPhases)) {
    lines.push("## Lesson Phases\n");
    for (const phase of feedback.leadPhases) {
      lines.push(`### ${phase.phase} (${phase.rating})`);
      if (phase.observations) lines.push(`Observations: ${phase.observations.join("; ")}`);
      if (phase.suggestions) lines.push(`Suggestions: ${phase.suggestions.join("; ")}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ── Input mode selector ──────────────────────────────────────────────────────

interface ModeSelectorProps {
  selected: CompareInputMode;
  onChange: (mode: CompareInputMode) => void;
}

function InputModeSelector({ selected, onChange }: ModeSelectorProps) {
  const modes: { value: CompareInputMode; label: string; desc: string; icon: React.ReactNode }[] = [
    { value: "pdf-pdf", label: "2 Reports", desc: "Compare two downloaded PDFs", icon: <FileText className="w-5 h-5" /> },
    { value: "pdf-audio", label: "Report + Audio", desc: "Compare a PDF with a new recording", icon: <><FileText className="w-4 h-4" /><span className="text-xs">+</span><Mic className="w-4 h-4" /></> },
    { value: "audio-audio", label: "2 Recordings", desc: "Compare two audio recordings", icon: <Mic className="w-5 h-5" /> },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {modes.map((m) => (
        <button
          key={m.value}
          onClick={() => onChange(m.value)}
          className={cn(
            "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center",
            selected === m.value
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-border hover:border-primary/40 hover:bg-secondary/30"
          )}
        >
          <div className="flex items-center gap-1 text-primary">{m.icon}</div>
          <p className="text-sm font-semibold text-foreground">{m.label}</p>
          <p className="text-xs text-muted-foreground">{m.desc}</p>
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface SessionCompareProps {
  onComplete: (result: ComparisonData) => void;
  userRole?: UserRole | null;
}

export function SessionCompare({ onComplete, userRole }: SessionCompareProps) {
  const [inputMode, setInputMode] = useState<CompareInputMode>("pdf-pdf");
  const [slotA, setSlotA] = useState<ProcessedSlot | null>(null);
  const [slotB, setSlotB] = useState<ProcessedSlot | null>(null);
  const [errorA, setErrorA] = useState<string | null>(null);
  const [errorB, setErrorB] = useState<string | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const slotTypeForPosition = useCallback((pos: "A" | "B"): "pdf" | "audio" => {
    if (inputMode === "pdf-pdf") return "pdf";
    if (inputMode === "audio-audio") return "audio";
    return pos === "A" ? "pdf" : "audio";
  }, [inputMode]);

  const handleModeChange = useCallback((mode: CompareInputMode) => {
    setInputMode(mode);
    setSlotA(null);
    setSlotB(null);
    setErrorA(null);
    setErrorB(null);
    setAnalysisError(null);
  }, []);

  const handleFile = useCallback(
    async (file: File, pos: "A" | "B") => {
      const setError = pos === "A" ? setErrorA : setErrorB;
      const setSlot = pos === "A" ? setSlotA : setSlotB;
      const setLoading = pos === "A" ? setLoadingA : setLoadingB;
      const expectedType = slotTypeForPosition(pos);

      setError(null);
      setAnalysisError(null);

      if (expectedType === "pdf") {
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) {
          setError("Please upload a PDF report file.");
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          setError("File is too large. Please upload a PDF under 10 MB.");
          return;
        }
        setLoading(true);
        try {
          const base64 = await fileToBase64(file);
          setSlot({ type: "pdf", file, filename: file.name, payload: base64 });
        } catch {
          setError("Failed to read the PDF file.");
        } finally {
          setLoading(false);
        }
      } else {
        // Audio file
        const audioTypes = ["audio/", "video/webm", "video/mp4", "video/ogg"];
        const isAudio = audioTypes.some((t) => file.type.startsWith(t)) || /\.(mp3|wav|m4a|ogg|webm|mp4|aac|flac|wma)$/i.test(file.name);
        if (!isAudio) {
          setError("Please upload an audio file (MP3, WAV, M4A, etc.).");
          return;
        }
        if (file.size > 100 * 1024 * 1024) {
          setError("Audio file is too large. Please upload a file under 100 MB.");
          return;
        }

        // Set slot immediately so UI shows the file, then process in background
        const slot: ProcessedSlot = { type: "audio", file, filename: file.name, payload: "", processingStage: "transcribing" };
        setSlot({ ...slot });

        try {
          const reportText = await processAudioForComparison(
            file,
            userRole ?? null,
            (stage, error) => {
              setSlot((prev) => prev ? { ...prev, processingStage: stage, processingError: error } : prev);
            }
          );
          setSlot((prev) => prev ? { ...prev, payload: reportText, processingStage: "done" } : prev);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Audio processing failed.";
          setSlot((prev) => prev ? { ...prev, processingStage: "error", processingError: msg } : prev);
        }
      }
    },
    [slotTypeForPosition, userRole]
  );

  const bothReady =
    slotA && slotB &&
    slotA.payload &&
    slotB.payload &&
    slotA.processingStage !== "transcribing" &&
    slotA.processingStage !== "analysing" &&
    slotA.processingStage !== "error" &&
    slotB.processingStage !== "transcribing" &&
    slotB.processingStage !== "analysing" &&
    slotB.processingStage !== "error";

  const handleAnalyse = async () => {
    if (!slotA || !slotB) return;
    setIsAnalysing(true);
    setAnalysisError(null);

    try {
      // Build the payload based on slot types
      const body: Record<string, string> = {
        filenameA: slotA.filename,
        filenameB: slotB.filename,
      };

      if (slotA.type === "pdf" && slotB.type === "pdf") {
        body.pdfA = slotA.payload;
        body.pdfB = slotB.payload;
      } else if (slotA.type === "pdf" && slotB.type === "audio") {
        // PDF A + text B (audio-derived)
        body.pdfA = slotA.payload;
        body.reportBText = slotB.payload;
      } else if (slotA.type === "audio" && slotB.type === "pdf") {
        body.reportAText = slotA.payload;
        body.pdfB = slotB.payload;
      } else {
        // Both audio-derived text
        body.reportAText = slotA.payload;
        body.reportBText = slotB.payload;
      }

      const { data, error } = await supabase.functions.invoke("compare-sessions", { body });

      if (error) throw new Error(error.message || "Comparison failed");
      onComplete(data as ComparisonData);
    } catch (err) {
      setIsAnalysing(false);
      setAnalysisError(
        err instanceof Error ? err.message : "Comparison failed. Please try again."
      );
    }
  };

  // ── Loading state
  if (isAnalysing) {
    return (
      <div className="section-fade-in flex flex-col items-center justify-center py-16 space-y-6">
        <div className="relative">
          <Loader2 className="w-16 h-16 text-primary animate-spin" />
          <Sparkles className="w-6 h-6 text-yellow-500 absolute -top-1 -right-1 animate-pulse" />
        </div>
        <div className="text-center space-y-3">
          <h3 className="text-2xl font-heading font-semibold text-foreground">
            Analysing Your Teaching Journey
          </h3>
          <p className="text-muted-foreground max-w-md">
            Reading both reports and comparing your sessions to identify growth, embedded practice, and your next development focus...
          </p>
        </div>
      </div>
    );
  }

  const slotAType = slotTypeForPosition("A");
  const slotBType = slotTypeForPosition("B");

  const labelA = inputMode === "audio-audio" ? "First Recording" : "First Report";
  const labelB = inputMode === "pdf-pdf" ? "Second Report" : inputMode === "pdf-audio" ? "New Recording" : "Second Recording";

  const acceptA = slotAType === "pdf" ? ".pdf" : ".mp3,.wav,.m4a,.ogg,.webm,.aac,.flac,.wma";
  const acceptB = slotBType === "pdf" ? ".pdf" : ".mp3,.wav,.m4a,.ogg,.webm,.aac,.flac,.wma";
  const acceptLabelA = slotAType === "pdf" ? "PDF" : "Audio";
  const acceptLabelB = slotBType === "pdf" ? "PDF" : "Audio";

  return (
    <div className="section-fade-in space-y-8 max-w-3xl mx-auto">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-heading font-semibold text-foreground">
          Compare Your Sessions
        </h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Choose what you'd like to compare — two downloaded reports, a report and a new recording, or two recordings.
        </p>
      </div>

      {/* Input mode selector */}
      <InputModeSelector selected={inputMode} onChange={handleModeChange} />

      <div className="flex flex-col sm:flex-row gap-6">
        <UploadZone
          label={labelA}
          accept={acceptA}
          acceptLabel={acceptLabelA}
          slot={slotA}
          error={errorA}
          isLoading={loadingA}
          loadingLabel={slotAType === "pdf" ? "Reading PDF..." : "Reading audio..."}
          onFile={(f) => handleFile(f, "A")}
          onClear={() => { setSlotA(null); setErrorA(null); }}
        />
        <UploadZone
          label={labelB}
          accept={acceptB}
          acceptLabel={acceptLabelB}
          slot={slotB}
          error={errorB}
          isLoading={loadingB}
          loadingLabel={slotBType === "pdf" ? "Reading PDF..." : "Reading audio..."}
          onFile={(f) => handleFile(f, "B")}
          onClear={() => { setSlotB(null); setErrorB(null); }}
        />
      </div>

      {analysisError && (
        <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-xl">
          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{analysisError}</p>
        </div>
      )}

      {/* Help */}
      <div className="bg-muted/50 rounded-xl p-5 space-y-2">
        <p className="text-sm font-semibold text-foreground">How it works</p>
        {inputMode === "pdf-pdf" && (
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Run a PowerED feedback session (Audio Only or Deep Dive)</li>
            <li>On the results page, click <strong>Download Report</strong> to save the PDF</li>
            <li>Upload both saved PDF files here to compare your progress</li>
          </ol>
        )}
        {inputMode === "pdf-audio" && (
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Upload a previous PowerED report PDF as your first session</li>
            <li>Upload a new audio recording — PowerED will transcribe and analyse it automatically</li>
            <li>The comparison will run once both are ready</li>
          </ol>
        )}
        {inputMode === "audio-audio" && (
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Upload two audio recordings from different teaching sessions</li>
            <li>PowerED will transcribe and analyse each one automatically</li>
            <li>Once both are processed, you can compare your development</li>
          </ol>
        )}
      </div>

      <div className="flex justify-center">
        <Button
          size="lg"
          className="gap-2"
          disabled={!bothReady}
          onClick={handleAnalyse}
        >
          <Sparkles className="w-5 h-5" />
          Analyse My Development
        </Button>
      </div>
    </div>
  );
}
