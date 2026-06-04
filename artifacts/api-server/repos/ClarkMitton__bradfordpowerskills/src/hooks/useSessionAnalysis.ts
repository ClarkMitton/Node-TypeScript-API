import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { compressVideo, formatBytes } from "@/lib/videoCompressor";
import { usePrivacyCleanup } from "@/hooks/usePrivacyCleanup";
import type { SelectedPhase } from "@/components/PhaseSelector";
import type { SessionDetails } from "@/components/AudioRecorder";
import type { SessionCaptureDetails } from "@/components/SessionCapture";
import type { UserRole } from "@/components/WelcomeScreen";

interface HighlightedName {
  id: string;
  name: string;
  startIndex: number;
  endIndex: number;
  replaced: boolean;
}

interface CategoryFeedback {
  name: string;
  rating: number | string;
  whatsWorking: string;
  toMakeStronger: string;
  tryThisNext: string;
}

interface LEADPhaseFeedback {
  phase: string;
  rating: "exemplary" | "solid" | "developing" | "emerging";
  observations: string[];
  suggestions: string[];
}

interface StandardEnglishData {
  stars: number;
  feedback: string;
}

interface ITTECFIndicator {
  standard: string;
  subCode: string;
  statement: string;
  status: "demonstrated" | "not_yet_evidenced";
  evidence: string;
}

interface FeedbackData {
  categories: CategoryFeedback[];
  leadPhases: LEADPhaseFeedback[];
  overallSummary: string;
  topStrength: string;
  priorityGrowthArea: string;
  standardEnglish?: StandardEnglishData;
  ittecfIndicators?: ITTECFIndicator[];
  [key: string]: unknown;
}

export type AnalysisMode = "quick" | "deep-dive" | "full-review" | "video-analysis" | "compare-sessions" | null;

interface SessionState {
  step: number;
  mode: AnalysisMode;
  audioBlob: Blob | null;
  audioFileName: string;
  transcript: string;
  highlightedNames: HighlightedName[];
  anonymizedTranscript: string;
  documents: {
    lessonPlan: File | null;
    scaffolding: File | null;
    lowerAbility: File | null;
    middleAbility: File | null;
    higherAbility: File | null;
  };
  feedback: FeedbackData | null;
  isTranscribing: boolean;
  isAnalyzing: boolean;
  selectedPhases: SelectedPhase[];
  transcriptionStartTime: number | null;
  transcriptionElapsed: number;
  sessionDetails: SessionDetails | null;
  analysisError: string | null;
  userRole: UserRole | null;
  // Video analysis state
  videoBlob: Blob | null;
  videoFileName: string;
  videoStoragePath: string | null;
  videoTaskId: string | null;
  isVideoAnalysis: boolean;
  videoProcessingStatus: "loading" | "preparing" | "compressing" | "uploading" | "processing" | "analyzing" | null;
  compressionProgress: number;
  compressionMessage: string;
  compressionSavings: string | null;
}

const initialState: SessionState = {
  step: 0,
  mode: null,
  audioBlob: null,
  audioFileName: "",
  transcript: "",
  highlightedNames: [],
  anonymizedTranscript: "",
  documents: {
    lessonPlan: null,
    scaffolding: null,
    lowerAbility: null,
    middleAbility: null,
    higherAbility: null,
  },
  feedback: null,
  isTranscribing: false,
  isAnalyzing: false,
  selectedPhases: [],
  transcriptionStartTime: null,
  transcriptionElapsed: 0,
  sessionDetails: null,
  analysisError: null,
  userRole: null,
  // Video analysis initial state
  videoBlob: null,
  videoFileName: "",
  videoStoragePath: null,
  videoTaskId: null,
  isVideoAnalysis: false,
  videoProcessingStatus: null,
  compressionProgress: 0,
  compressionMessage: "",
  compressionSavings: null,
};

// Mock function to detect names in transcript
const detectNames = (text: string): HighlightedName[] => {
  const commonNames = [
    "John", "Sarah", "Michael", "Emma", "James", "Emily", "David", "Sophie",
    "Daniel", "Olivia", "Mohammed", "Chloe", "Jack", "Mia", "Thomas", "Grace",
    "Charlie", "Lily", "William", "Ella", "Harry", "Amelia", "George", "Isla"
  ];
  
  const names: HighlightedName[] = [];
  
  commonNames.forEach((name) => {
    const regex = new RegExp(`\\b${name}\\b`, "gi");
    let match;
    while ((match = regex.exec(text)) !== null) {
      names.push({
        id: `${name}-${match.index}`,
        name: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        replaced: false,
      });
    }
  });
  
  return names.sort((a, b) => a.startIndex - b.startIndex);
};

// Auto-anonymize transcript by replacing detected names
const autoAnonymizeTranscript = (text: string, names: HighlightedName[]): string => {
  if (names.length === 0) return text;
  
  let result = text;
  const sortedNames = [...names].sort((a, b) => b.startIndex - a.startIndex);
  
  sortedNames.forEach((name) => {
    result = result.slice(0, name.startIndex) + "Student" + result.slice(name.endIndex);
  });
  
  return result;
};

// Real transcription using ElevenLabs Speech-to-Text
const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Transcription failed");
  }

  const data = await response.json();
  
  if (data.words && data.words.length > 0) {
    return formatTranscriptWithTimestamps(data.text, data.words);
  }
  
  return data.text;
};

// Format transcript with timestamps at natural break points
const formatTranscriptWithTimestamps = (
  text: string,
  words: Array<{ text: string; start: number; end: number; speaker?: string }>
): string => {
  if (!words.length) return text;

  const lines: string[] = [];
  let currentLine = "";
  let lastTimestamp = 0;
  let lastSpeaker = "";
  
  words.forEach((word, index) => {
    const currentTime = word.start;
    const speaker = word.speaker || "";
    
    const shouldAddTimestamp = 
      currentTime - lastTimestamp >= 30 || 
      (speaker && speaker !== lastSpeaker && lastSpeaker !== "");
    
    if (shouldAddTimestamp && currentLine.trim()) {
      const minutes = Math.floor(currentTime / 60);
      const seconds = Math.floor(currentTime % 60);
      const timestamp = `[${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}]`;
      
      lines.push(currentLine.trim());
      currentLine = `${timestamp} `;
      lastTimestamp = currentTime;
    }
    
    if (speaker && speaker !== lastSpeaker) {
      lastSpeaker = speaker;
    }
    
    currentLine += word.text + " ";
    
    if (word.text.match(/[.!?]$/) && index < words.length - 1) {
      lines.push(currentLine.trim());
      currentLine = "";
    }
  });
  
  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }
  
  return lines.join("\n\n");
};

// Real AI feedback generation
const generateFeedback = async (
  transcript: string,
  selectedPhases: SelectedPhase[],
  mode: AnalysisMode,
  documents: SessionState["documents"],
  sessionDetails: SessionDetails | null,
  userRole: UserRole | null
): Promise<FeedbackData> => {
  let lessonPlanText = "";
  let scaffoldingText = "";
  let studentWorkText = "";

  if (documents.lessonPlan) {
    lessonPlanText = await documents.lessonPlan.text().catch(() => "");
  }
  if (documents.scaffolding) {
    scaffoldingText = await documents.scaffolding.text().catch(() => "");
  }

  const studentWorkParts = [];
  if (documents.lowerAbility) studentWorkParts.push("Lower ability student work sample provided");
  if (documents.middleAbility) studentWorkParts.push("Middle ability student work sample provided");
  if (documents.higherAbility) studentWorkParts.push("Higher ability student work sample provided");
  studentWorkText = studentWorkParts.join(". ");

  const { data, error } = await supabase.functions.invoke("analyze-session", {
    body: {
      transcript,
      selectedPhases,
      lessonPlan: lessonPlanText,
      scaffolding: scaffoldingText,
      studentWork: studentWorkText,
      mode,
      learnerLevel: sessionDetails?.learnerLevel || "",
      subject: sessionDetails?.subject || "",
      selectedCategories: sessionDetails?.selectedCategories || [],
      userRole: userRole || "staff",
    },
  });

  if (error) {
    console.error("Analysis error:", error);
    throw new Error(error.message || "Failed to analyze session");
  }

  return data as FeedbackData;
};

// Upload video to storage and return the path
const uploadVideoToStorage = async (file: File): Promise<string> => {
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const storagePath = `${timestamp}_${sanitizedName}`;
  
  const { error } = await supabase.storage
    .from("teaching-videos")
    .upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("Storage upload error:", error);
    throw new Error("Failed to upload video: " + error.message);
  }

  return storagePath;
};

export function useSessionAnalysis() {
  const [state, setState] = useState<SessionState>(initialState);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingAbortRef = useRef<boolean>(false);
  
  const { 
    trackVideoStoragePath, 
    trackBlobs, 
    deleteVideoFromStorage,
    performFullCleanup 
  } = usePrivacyCleanup();

  useEffect(() => {
    trackBlobs(state.audioBlob, state.videoBlob);
  }, [state.audioBlob, state.videoBlob, trackBlobs]);

  useEffect(() => {
    trackVideoStoragePath(state.videoStoragePath);
  }, [state.videoStoragePath, trackVideoStoragePath]);

  // Transcription timer effect
  useEffect(() => {
    if (state.isTranscribing && state.transcriptionStartTime) {
      timerRef.current = setInterval(() => {
        setState(prev => ({
          ...prev,
          transcriptionElapsed: Math.floor((Date.now() - (prev.transcriptionStartTime || Date.now())) / 1000)
        }));
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [state.isTranscribing, state.transcriptionStartTime]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      pollingAbortRef.current = true;
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
      }
    };
  }, []);

  const setUserRole = useCallback((role: UserRole) => {
    setState((prev) => ({ ...prev, userRole: role }));
  }, []);

  const selectMode = useCallback((mode: AnalysisMode) => {
    setState((prev) => ({ ...prev, mode, step: 1 }));
  }, []);

  const triggerAnalysis = useCallback(async (
    anonymizedTranscript: string,
    selectedPhases: SelectedPhase[],
    sessionDetails: SessionDetails | null,
    mode: AnalysisMode,
    documents: SessionState["documents"],
    userRole: UserRole | null
  ) => {
    setState((prev) => ({
      ...prev,
      isAnalyzing: true,
      analysisError: null,
    }));

    try {
      const feedback = await generateFeedback(
        anonymizedTranscript,
        selectedPhases,
        mode,
        documents,
        sessionDetails,
        userRole
      );
      
      setState((prev) => ({
        ...prev,
        feedback,
        isAnalyzing: false,
        analysisError: null,
      }));
    } catch (error) {
      console.error("Analysis failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Analysis failed. Please try again.";
      toast.error(errorMessage);
      setState((prev) => ({
        ...prev,
        isAnalyzing: false,
        analysisError: errorMessage,
      }));
    }
  }, []);

  const handleAudioReady = useCallback(async (blob: Blob, fileName: string, sessionDetails?: SessionDetails) => {
    setState((prev) => ({
      ...prev,
      audioBlob: blob,
      audioFileName: fileName,
      step: 2,
      isTranscribing: true,
      transcriptionStartTime: Date.now(),
      transcriptionElapsed: 0,
      sessionDetails: sessionDetails || null,
      selectedPhases: ["full"],
    }));

    try {
      const transcript = await transcribeAudio(blob);
      
      if (!transcript || transcript.trim().length === 0) {
        throw new Error("Transcription returned empty. Please try recording again.");
      }
      
      const names = detectNames(transcript);
      const anonymizedTranscript = autoAnonymizeTranscript(transcript, names);
      
      setState((prev) => ({
        ...prev,
        transcript,
        highlightedNames: names,
        anonymizedTranscript,
        isTranscribing: false,
        transcriptionStartTime: null,
      }));
      
      toast.success("Audio transcribed and anonymized successfully");
      
      const fullPhases: SelectedPhase[] = ["full"];
      // Need to read userRole from state at call time
      setState((prev) => {
        setTimeout(() => {
          triggerAnalysis(anonymizedTranscript, fullPhases, sessionDetails || null, "quick", initialState.documents, prev.userRole);
        }, 0);
        return prev;
      });
    } catch (error) {
      console.error("Transcription failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Transcription failed. Please try again.";
      toast.error(errorMessage);
      setState((prev) => ({
        ...prev,
        isTranscribing: false,
        transcriptionStartTime: null,
        step: 1,
      }));
    }
  }, [triggerAnalysis]);

  const handleSessionCapture = useCallback(async (
    blob: Blob,
    fileName: string,
    documents: SessionState["documents"],
    captureDetails?: SessionCaptureDetails
  ) => {
    const currentMode = state.mode;
    const sessionDetails: SessionDetails | null = captureDetails
      ? { learnerLevel: "", subject: captureDetails.subject, selectedCategories: [] }
      : null;

    setState((prev) => ({
      ...prev,
      audioBlob: blob,
      audioFileName: fileName,
      documents,
      step: 2,
      isTranscribing: true,
      transcriptionStartTime: Date.now(),
      transcriptionElapsed: 0,
      selectedPhases: ["full"],
      sessionDetails,
    }));

    try {
      const transcript = await transcribeAudio(blob);

      if (!transcript || transcript.trim().length === 0) {
        throw new Error("Transcription returned empty. Please try recording again.");
      }

      const names = detectNames(transcript);
      const anonymizedTranscript = autoAnonymizeTranscript(transcript, names);

      setState((prev) => ({
        ...prev,
        transcript,
        highlightedNames: names,
        anonymizedTranscript,
        isTranscribing: false,
        transcriptionStartTime: null,
      }));

      toast.success("Audio transcribed and anonymised successfully");

      const fullPhases: SelectedPhase[] = ["full"];
      setState((prev) => {
        setTimeout(() => {
          triggerAnalysis(anonymizedTranscript, fullPhases, sessionDetails, currentMode, documents, prev.userRole);
        }, 0);
        return prev;
      });
    } catch (error) {
      console.error("Transcription failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Transcription failed. Please try again.";
      toast.error(errorMessage);
      setState((prev) => ({
        ...prev,
        isTranscribing: false,
        transcriptionStartTime: null,
        step: 1,
      }));
    }
  }, [state.mode, triggerAnalysis]);

  const handleTranscriptSubmit = useCallback((transcript: string, sessionDetails?: SessionDetails) => {
    const names = detectNames(transcript);
    const anonymizedTranscript = autoAnonymizeTranscript(transcript, names);
    
    setState((prev) => ({
      ...prev,
      transcript,
      highlightedNames: names,
      anonymizedTranscript,
      step: 2,
      sessionDetails: sessionDetails || null,
      selectedPhases: ["full"],
    }));
    
    toast.success("Transcript loaded and anonymized successfully");
    
    const fullPhases: SelectedPhase[] = ["full"];
    setState((prev) => {
      setTimeout(() => {
        triggerAnalysis(anonymizedTranscript, fullPhases, sessionDetails || null, prev.mode, initialState.documents, prev.userRole);
      }, 0);
      return prev;
    });
  }, [triggerAnalysis]);

  const confirmTranscript = useCallback((anonymizedTranscript: string) => {
    setState((prev) => ({
      ...prev,
      anonymizedTranscript,
      audioBlob: null,
      step: 2,
    }));
  }, []);

  const handlePhaseSelection = useCallback(async (selectedPhases: SelectedPhase[]) => {
    setState((prev) => ({
      ...prev,
      selectedPhases,
      isAnalyzing: true,
      analysisError: null,
      step: 2,
    }));

    try {
      const feedback = await generateFeedback(
        state.anonymizedTranscript,
        selectedPhases,
        state.mode,
        state.documents,
        state.sessionDetails,
        state.userRole
      );
      
      setState((prev) => ({
        ...prev,
        feedback,
        isAnalyzing: false,
        analysisError: null,
      }));
    } catch (error) {
      console.error("Analysis failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Analysis failed. Please try again.";
      toast.error(errorMessage);
      setState((prev) => ({
        ...prev,
        isAnalyzing: false,
        analysisError: errorMessage,
      }));
    }
  }, [state.anonymizedTranscript, state.mode, state.documents, state.sessionDetails, state.userRole]);

  const retryAnalysis = useCallback(() => {
    if (state.selectedPhases.length > 0) {
      handlePhaseSelection(state.selectedPhases);
    }
  }, [state.selectedPhases, handlePhaseSelection]);

  const resetSession = useCallback(() => {
    pollingAbortRef.current = true;
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
    }
    performFullCleanup();
    setState(initialState);
  }, [performFullCleanup]);

  const advanceStep = useCallback(() => {
    setState((prev) => ({ ...prev, step: prev.step + 1 }));
  }, []);

  const goBack = useCallback(() => {
    setState((prev) => {
      if (prev.step <= 1) {
        pollingAbortRef.current = true;
        if (pollingRef.current) {
          clearTimeout(pollingRef.current);
        }
        return initialState;
      }
      return { ...prev, step: prev.step - 1 };
    });
  }, []);

  const handleVideoCapture = useCallback(async (blob: Blob, fileName: string) => {
    setState((prev) => ({
      ...prev,
      videoBlob: blob,
      videoFileName: fileName,
      isVideoAnalysis: true,
      step: 2,
      videoProcessingStatus: null,
      selectedPhases: ["full"],
    }));
  }, []);

  const pollVideoStatus = useCallback(async (
    taskId: string, 
    selectedPhases: SelectedPhase[],
    maxAttempts = 60
  ) => {
    let attempts = 0;
    pollingAbortRef.current = false;

    const poll = async () => {
      if (pollingAbortRef.current || attempts >= maxAttempts) {
        if (attempts >= maxAttempts) {
          setState((prev) => ({
            ...prev,
            isAnalyzing: false,
            videoProcessingStatus: null,
            analysisError: "Video processing timed out. Please try again with a shorter video.",
          }));
          toast.error("Video processing timed out");
        }
        return;
      }

      attempts++;

      try {
        const { data, error } = await supabase.functions.invoke("video-analysis-status", {
          body: { taskId, selectedPhases },
        });

        if (error) {
          throw new Error(error.message || "Failed to check video status");
        }

        if (data.status === "complete") {
          if (state.videoStoragePath) {
            console.log("[Privacy] Deleting video after successful analysis");
            deleteVideoFromStorage(state.videoStoragePath);
          }
          
          setState((prev) => ({
            ...prev,
            feedback: data.feedback,
            isAnalyzing: false,
            videoProcessingStatus: null,
            analysisError: null,
            videoBlob: null,
            videoStoragePath: null,
          }));
          toast.success("Video analysis complete!");
          return;
        }

        if (data.status === "failed") {
          throw new Error(data.error || "Video processing failed");
        }

        setState((prev) => ({
          ...prev,
          videoProcessingStatus: data.taskStatus === "indexing" ? "analyzing" : "processing",
        }));

        pollingRef.current = setTimeout(poll, 5000);
      } catch (error) {
        console.error("Polling error:", error);
        const errorMessage = error instanceof Error ? error.message : "Video analysis failed. Please try again.";
        setState((prev) => ({
          ...prev,
          isAnalyzing: false,
          videoProcessingStatus: null,
          analysisError: errorMessage,
        }));
        toast.error(errorMessage);
      }
    };

    poll();
  }, []);

  const analyzeVideo = useCallback(async (selectedPhases: SelectedPhase[]) => {
    if (!state.videoBlob) {
      toast.error("No video to analyze");
      return;
    }

    setState((prev) => ({
      ...prev,
      selectedPhases,
      isAnalyzing: true,
      videoProcessingStatus: "loading",
      compressionProgress: 0,
      compressionMessage: "Loading video processor...",
      compressionSavings: null,
      step: 2,
      analysisError: null,
    }));

    try {
      const compressionResult = await compressVideo(
        state.videoBlob as unknown as File,
        (progress) => {
          setState((prev) => ({
            ...prev,
            videoProcessingStatus: progress.stage,
            compressionProgress: progress.progress,
            compressionMessage: progress.message,
          }));
        }
      );

      const savings = compressionResult.originalSize > compressionResult.compressedSize
        ? `Reduced from ${formatBytes(compressionResult.originalSize)} to ${formatBytes(compressionResult.compressedSize)}`
        : null;

      setState((prev) => ({
        ...prev,
        videoProcessingStatus: "uploading",
        compressionProgress: 100,
        compressionSavings: savings,
      }));

      const videoFile = new File([compressionResult.blob], state.videoFileName.replace(/\.\w+$/, ".mp4"), {
        type: "video/mp4",
      });
      const storagePath = await uploadVideoToStorage(videoFile);

      setState((prev) => ({
        ...prev,
        videoStoragePath: storagePath,
        videoProcessingStatus: "processing",
      }));

      const { data, error } = await supabase.functions.invoke("start-video-analysis", {
        body: {
          storagePath,
          fileName: state.videoFileName,
          selectedPhases,
        },
      });

      if (error) {
        throw new Error(error.message || "Failed to start video analysis");
      }

      if (!data.taskId) {
        throw new Error("No task ID returned from server");
      }

      setState((prev) => ({
        ...prev,
        videoTaskId: data.taskId,
      }));

      pollVideoStatus(data.taskId, selectedPhases);

    } catch (error) {
      console.error("Video analysis failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Video analysis failed. Please try again.";
      toast.error(errorMessage);
      setState((prev) => ({
        ...prev,
        isAnalyzing: false,
        videoProcessingStatus: null,
        analysisError: errorMessage,
      }));
    }
  }, [state.videoBlob, state.videoFileName, pollVideoStatus]);

  return {
    state,
    selectMode,
    handleAudioReady,
    handleSessionCapture,
    handleTranscriptSubmit,
    confirmTranscript,
    handlePhaseSelection,
    handleVideoCapture,
    analyzeVideo,
    retryAnalysis,
    resetSession,
    goBack,
    advanceStep,
    setUserRole,
  };
}
