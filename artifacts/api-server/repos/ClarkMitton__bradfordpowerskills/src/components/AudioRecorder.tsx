import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mic, Square, Upload, Play, Pause, Trash2, Download, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const FEEDBACK_CATEGORIES = [
  { id: "questioning", label: "Questioning Techniques" },
  { id: "clarity", label: "Clarity of Explanation" },
  { id: "tone", label: "Tone and Emotional Climate" },
  { id: "participation", label: "Student Participation and Voice Distribution" },
  { id: "listening", label: "Responsive Listening and Feedback" },
];

const LEARNER_LEVELS = [
  { value: "primary", label: "Primary (Reception - Year 2)" },
  { value: "ks1", label: "KS1 (Years 1-2)" },
  { value: "ks2", label: "KS2 (Years 3-6)" },
  { value: "ks3", label: "KS3 (Years 7-9)" },
  { value: "ks4", label: "KS4 (Years 10-11 / GCSE)" },
  { value: "ks5", label: "KS5 (Years 12-13 / A-Level)" },
  { value: "fe", label: "Further Education" },
  { value: "he", label: "Higher Education" },
  { value: "adult", label: "Adult Learners" },
];

export interface SessionDetails {
  learnerLevel: string;
  subject: string;
  selectedCategories: string[];
}

interface AudioRecorderProps {
  onFastFeedback: (audioBlob: Blob, fileName: string, sessionDetails: SessionDetails) => void;
  onTranscriptSubmit?: (transcript: string, sessionDetails: SessionDetails) => void;
}

export function AudioRecorder({ onFastFeedback }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  
  
  // Session details
  const [learnerLevel, setLearnerLevel] = useState<string>("");
  const [subject, setSubject] = useState<string>("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [allCategoriesSelected, setAllCategoriesSelected] = useState(true);
  
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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleCategoryToggle = (categoryId: string) => {
    if (allCategoriesSelected) {
      // Switching from "all" to specific selection
      setAllCategoriesSelected(false);
      setSelectedCategories([categoryId]);
    } else {
      setSelectedCategories(prev => 
        prev.includes(categoryId)
          ? prev.filter(id => id !== categoryId)
          : [...prev, categoryId]
      );
    }
  };

  const handleAllCategoriesToggle = () => {
    setAllCategoriesSelected(!allCategoriesSelected);
    if (!allCategoriesSelected) {
      setSelectedCategories([]);
    }
  };

  const getSessionDetails = (): SessionDetails => ({
    learnerLevel,
    subject,
    selectedCategories: allCategoriesSelected 
      ? FEEDBACK_CATEGORIES.map(c => c.label)
      : selectedCategories.map(id => FEEDBACK_CATEGORIES.find(c => c.id === id)?.label || ""),
  });

  const handleFastFeedback = () => {
    if (audioBlob) {
      onFastFeedback(audioBlob, fileName, getSessionDetails());
    }
  };



  return (
    <div className="section-fade-in space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-heading font-semibold text-foreground">
          Record or Upload Your Session
        </h2>
        <p className="text-muted-foreground">
          Record a live session or upload a pre-recorded audio file (8-12 minutes recommended)
        </p>
      </div>

      {!audioBlob ? (
        <div className="card-elevated p-8 space-y-6">
          {/* Recording Section */}
          <div className="flex flex-col items-center space-y-4">
            {isRecording ? (
              <>
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-destructive/10 flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center pulse-recording">
                      <Mic className="w-10 h-10 text-destructive" />
                    </div>
                  </div>
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground text-sm font-mono px-3 py-1 rounded-full">
                    {formatTime(recordingTime)}
                  </div>
                </div>
                <Button
                  onClick={stopRecording}
                  variant="destructive"
                  size="lg"
                  className="mt-6"
                >
                  <Square className="w-5 h-5" />
                  Stop Recording
                </Button>
              </>
            ) : (
              <>
                <Button onClick={startRecording} size="xl" className="group">
                  <Mic className="w-6 h-6" />
                  Start Recording
                </Button>
                <div className="flex items-center gap-4 w-full max-w-xs">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-sm text-muted-foreground">or</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="audio/*"
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  size="lg"
                >
                  <Upload className="w-5 h-5" />
                  Upload Audio File
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="card-elevated p-8 space-y-6">
          {/* Audio Preview */}
          <div className="flex flex-col items-center space-y-4">
            <div className="w-full max-w-md bg-secondary rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-3">
                <Button
                  onClick={togglePlayback}
                  variant="outline"
                  size="icon"
                  className="flex-shrink-0"
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5" />
                  )}
                </Button>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{fileName}</p>
                  <p className="text-sm text-muted-foreground">
                    Ready for feedback
                  </p>
                </div>
              </div>
              <audio
                ref={audioRef}
                src={audioUrl || undefined}
                onEnded={() => setIsPlaying(false)}
                className="hidden"
              />
            </div>

            {/* Session Details Form */}
            <div className="w-full max-w-md space-y-5 pt-4 border-t border-border">
              <h3 className="font-semibold text-foreground text-center">Session Details (Optional)</h3>
              
              {/* Learner Level */}
              <div className="space-y-2">
                <Label htmlFor="learner-level">Learner Level</Label>
                <Select value={learnerLevel} onValueChange={setLearnerLevel}>
                  <SelectTrigger id="learner-level">
                    <SelectValue placeholder="Select learner level..." />
                  </SelectTrigger>
                  <SelectContent>
                    {LEARNER_LEVELS.map(level => (
                      <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Subject */}
              <div className="space-y-2">
                <Label htmlFor="subject">What were you teaching in this recording?</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. 'Introducing fractions using visual models' or 'Persuasive writing — opening paragraphs for KS3'"
                />
                <p className="text-xs text-muted-foreground">Be specific — the more detail you give, the more accurate your feedback will be.</p>
              </div>

              {/* Feedback Categories */}
              <div className="space-y-3">
                <Label>Feedback Focus Areas</Label>
                <p className="text-sm text-muted-foreground">
                  Select specific areas for feedback, or leave as "All" for comprehensive feedback
                </p>
                
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="all-categories" 
                      checked={allCategoriesSelected}
                      onCheckedChange={handleAllCategoriesToggle}
                    />
                    <label 
                      htmlFor="all-categories" 
                      className="text-sm font-medium cursor-pointer"
                    >
                      All Categories (Comprehensive Feedback)
                    </label>
                  </div>
                  
                  <div className="pl-6 space-y-2 border-l-2 border-border ml-2">
                    {FEEDBACK_CATEGORIES.map(category => (
                      <div key={category.id} className="flex items-center space-x-2">
                        <Checkbox 
                          id={category.id}
                          checked={allCategoriesSelected || selectedCategories.includes(category.id)}
                          disabled={allCategoriesSelected}
                          onCheckedChange={() => handleCategoryToggle(category.id)}
                        />
                        <label 
                          htmlFor={category.id} 
                          className={`text-sm cursor-pointer ${allCategoriesSelected ? 'text-muted-foreground' : ''}`}
                        >
                          {category.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 justify-center pt-4">
              <Button onClick={clearAudio} variant="outline">
                <Trash2 className="w-4 h-4" />
                Clear
              </Button>
              <Button onClick={downloadAudio} variant="outline">
                <Download className="w-4 h-4" />
                Save to Desktop
              </Button>
              <Button onClick={handleFastFeedback} variant="success">
                <Zap className="w-4 h-4" />
                Get Fast Feedback
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="bg-muted rounded-3xl p-4">
        <h3 className="font-semibold text-foreground mb-2">Recording Tips</h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Ensure a quiet environment for best transcription quality</li>
          <li>• Sessions of 8-12 minutes work best for detailed feedback</li>
          <li>• Speak clearly and at a natural pace</li>
          <li>• Position your device close to the main speaker</li>
        </ul>
      </div>
    </div>
  );
}
