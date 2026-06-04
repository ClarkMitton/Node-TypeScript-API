import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mic, Square, Upload, Play, Pause, Trash2, Download, FileText, CheckCircle2, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AnalysisMode } from "@/hooks/useSessionAnalysis";

export interface SessionCaptureDetails {
  subject: string;
}

interface SessionCaptureProps {
  mode: AnalysisMode;
  onComplete: (
    audioBlob: Blob,
    fileName: string,
    documents: {
      lessonPlan: File | null;
      scaffolding: File | null;
      lowerAbility: File | null;
      middleAbility: File | null;
      higherAbility: File | null;
    },
    sessionDetails: SessionCaptureDetails
  ) => void;
}

export function SessionCapture({ mode, onComplete }: SessionCaptureProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Session details
  const [subject, setSubject] = useState<string>("");

  // Document states
  const [lessonPlan, setLessonPlan] = useState<File | null>(null);
  const [scaffolding, setScaffolding] = useState<File | null>(null);
  const [lowerAbility, setLowerAbility] = useState<File | null>(null);
  const [middleAbility, setMiddleAbility] = useState<File | null>(null);
  const [higherAbility, setHigherAbility] = useState<File | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setFileName(`powered-recording-${Date.now()}.webm`);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      toast({
        title: "Microphone Access Required",
        description: "Please allow microphone access to record your session.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const handleAudioUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const validTypes = ["audio/mp3", "audio/mpeg", "audio/wav", "audio/m4a", "audio/webm", "audio/ogg"];
      if (!validTypes.some((type) => file.type.includes(type.split("/")[1]))) {
        toast({
          title: "Invalid File Type",
          description: "Please upload an audio file (MP3, WAV, M4A, WebM, or OGG).",
          variant: "destructive",
        });
        return;
      }

      const url = URL.createObjectURL(file);
      setAudioBlob(file);
      setAudioUrl(url);
      setFileName(file.name);
    }
  };

  const togglePlayback = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const clearAudio = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setFileName("");
    setIsPlaying(false);
    setRecordingTime(0);
  };

  const downloadAudio = () => {
    if (audioBlob && audioUrl) {
      const link = document.createElement("a");
      link.href = audioUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({
        title: "Download Started",
        description: "Your recording is being saved to your device.",
      });
    }
  };

  const handleDocumentUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
    setter: (file: File | null) => void
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      setter(file);
    }
  };

  const isReadyToSubmit = () => {
    if (!audioBlob) return false;
    if (!lessonPlan) return false;
    if (mode === "full-review") {
      return scaffolding && lowerAbility && middleAbility && higherAbility;
    }
    return true;
  };

  const handleSubmit = () => {
    if (audioBlob && isReadyToSubmit()) {
      onComplete(
        audioBlob,
        fileName,
        {
          lessonPlan,
          scaffolding,
          lowerAbility,
          middleAbility,
          higherAbility,
        },
        { subject }
      );
    }
  };

  const DocumentUploadCard = ({
    label,
    description,
    file,
    onUpload,
  }: {
    label: string;
    description: string;
    file: File | null;
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    
    return (
      <div
        className={`relative border-2 border-dashed rounded-lg p-4 transition-all cursor-pointer hover:border-primary/50 ${
          file ? "border-primary bg-primary/5" : "border-border"
        }`}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          onChange={onUpload}
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          className="hidden"
        />
        <div className="flex items-center gap-3">
          {file ? (
            <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
          ) : (
            <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground text-sm">{label}</p>
            {file ? (
              <p className="text-xs text-primary truncate">{file.name}</p>
            ) : (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="section-fade-in space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-heading font-semibold text-foreground">
          {mode === "deep-dive" ? "Capture Your Session" : "Full Session Capture"}
        </h2>
        <p className="text-muted-foreground">
          {mode === "deep-dive"
            ? "Record your teaching session and upload your lesson plan for delivery comparison"
            : "Record your session and upload all materials for comprehensive analysis"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Audio Section */}
        <div className="card-elevated p-6 space-y-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Mic className="w-5 h-5 text-primary" />
            Session Recording
          </h3>

          {!audioBlob ? (
            <div className="space-y-4">
              {isRecording ? (
                <div className="flex flex-col items-center space-y-4 py-4">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center pulse-recording">
                        <Mic className="w-8 h-8 text-destructive" />
                      </div>
                    </div>
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground text-xs font-mono px-2 py-0.5 rounded-full">
                      {formatTime(recordingTime)}
                    </div>
                  </div>
                  <Button onClick={stopRecording} variant="destructive" size="sm">
                    <Square className="w-4 h-4" />
                    Stop Recording
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-3 py-4">
                  <Button onClick={startRecording} size="lg" className="w-full">
                    <Mic className="w-5 h-5" />
                    Start Recording
                  </Button>
                  <div className="flex items-center gap-3 w-full">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">or</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleAudioUpload}
                    accept="audio/*"
                    className="hidden"
                  />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Audio File
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-secondary rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <Button
                    onClick={togglePlayback}
                    variant="outline"
                    size="icon"
                    className="flex-shrink-0 h-8 w-8"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm truncate">{fileName}</p>
                    <p className="text-xs text-muted-foreground">Ready for transcription</p>
                  </div>
                  <Button onClick={downloadAudio} variant="ghost" size="icon" className="h-8 w-8" title="Download recording">
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button onClick={clearAudio} variant="ghost" size="icon" className="h-8 w-8">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <audio
                  ref={audioRef}
                  src={audioUrl || undefined}
                  onEnded={() => setIsPlaying(false)}
                  className="hidden"
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                Audio ready
              </div>
            </div>
          )}
        </div>

        {/* Documents Section */}
        <div className="card-elevated p-6 space-y-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            {mode === "deep-dive" ? "Lesson Plan" : "Session Materials"}
          </h3>

          <div className="space-y-3">
            <DocumentUploadCard
              label="Lesson Plan"
              description="Upload to compare against your delivery"
              file={lessonPlan}
              onUpload={(e) => handleDocumentUpload(e, setLessonPlan)}
            />

            {mode === "full-review" && (
              <>
                <DocumentUploadCard
                  label="Scaffolding Materials"
                  description="Resources you used during the session"
                  file={scaffolding}
                  onUpload={(e) => handleDocumentUpload(e, setScaffolding)}
                />

                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-3">Student Work Samples</p>
                  <div className="space-y-2">
                    <DocumentUploadCard
                      label="Lower Ability Work"
                      description="Sample from lower ability student"
                      file={lowerAbility}
                      onUpload={(e) => handleDocumentUpload(e, setLowerAbility)}
                    />
                    <DocumentUploadCard
                      label="Middle Ability Work"
                      description="Sample from middle ability student"
                      file={middleAbility}
                      onUpload={(e) => handleDocumentUpload(e, setMiddleAbility)}
                    />
                    <DocumentUploadCard
                      label="Higher Ability Work"
                      description="Sample from higher ability student"
                      file={higherAbility}
                      onUpload={(e) => handleDocumentUpload(e, setHigherAbility)}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Teaching Focus */}
      <div className="card-elevated p-6 space-y-2">
        <Label htmlFor="session-subject">What were you teaching in this recording?</Label>
        <Input
          id="session-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. 'Introducing fractions using visual models' or 'Persuasive writing — opening paragraphs for KS3'"
        />
        <p className="text-xs text-muted-foreground">Be specific — the more detail you give, the more accurate your feedback will be.</p>
      </div>

      {/* Tips */}
      <div className="bg-muted rounded-lg p-4">
        <h3 className="font-semibold text-foreground mb-2">Tips for Best Results</h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Ensure a quiet environment for best transcription quality</li>
          <li>• Sessions of 8-12 minutes work best for detailed analysis</li>
          <li>• Upload the lesson plan you intended to deliver for accurate comparison</li>
          {mode === "full-review" && (
            <li>• Include work samples that show a range of abilities for differentiation analysis</li>
          )}
        </ul>
      </div>

      {/* Submit Button */}
      <div className="flex justify-center pt-4">
        <Button
          onClick={handleSubmit}
          disabled={!isReadyToSubmit()}
          size="xl"
          className="min-w-[200px]"
        >
          Continue to Transcript Review
          <ArrowRight className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}