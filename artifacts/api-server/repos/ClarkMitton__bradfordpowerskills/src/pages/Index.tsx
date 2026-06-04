import React, { useState, useEffect, useRef } from "react";
import { StepIndicator } from "@/components/StepIndicator";
import { WelcomeScreen, UserRole } from "@/components/WelcomeScreen";
import { AudioRecorder } from "@/components/AudioRecorder";
import { SessionCapture } from "@/components/SessionCapture";
import { VideoCapture } from "@/components/VideoCapture";
import { FeedbackReport } from "@/components/FeedbackReport";
import { SessionCompare } from "@/components/SessionCompare";
import { ComparisonReport } from "@/components/ComparisonReport";
import { ProcessingLoader } from "@/components/ProcessingLoader";
import { RotatingInsight } from "@/components/RotatingInsight";
import { useSessionAnalysis } from "@/hooks/useSessionAnalysis";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, Loader2, Video, Upload, Sparkles, Zap } from "lucide-react";
import type { ComparisonData } from "@/components/SessionCompare";

const getStepsForMode = (mode: string | null) => {
  switch (mode) {
    case "quick":
      return [
        { id: 1, label: "Record Audio", shortLabel: "Audio" },
        { id: 2, label: "View Feedback", shortLabel: "Feedback" },
      ];
    case "deep-dive":
      return [
        { id: 1, label: "Capture Session", shortLabel: "Capture" },
        { id: 2, label: "View Feedback", shortLabel: "Feedback" },
      ];
    case "full-review":
      return [
        { id: 1, label: "Capture Session", shortLabel: "Capture" },
        { id: 2, label: "View Feedback", shortLabel: "Feedback" },
      ];
    case "video-analysis":
      return [
        { id: 1, label: "Upload Video", shortLabel: "Video" },
        { id: 2, label: "View Feedback", shortLabel: "Feedback" },
      ];
    case "compare-sessions":
      return [
        { id: 1, label: "Upload Reports", shortLabel: "Upload" },
        { id: 2, label: "View Comparison", shortLabel: "Compare" },
      ];
    default:
      return [];
  }
};


const Index = () => {
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [comparisonResult, setComparisonResult] = useState<ComparisonData | null>(null);

  const {
    state,
    selectMode,
    handleAudioReady,
    handleSessionCapture,
    handleTranscriptSubmit,
    handlePhaseSelection,
    handleVideoCapture,
    analyzeVideo,
    retryAnalysis,
    resetSession,
    goBack,
    advanceStep,
    setUserRole: setHookUserRole,
  } = useSessionAnalysis();

  const videoAutoAnalyzedRef = useRef(false);

  const handleReset = () => {
    setUserRole(null);
    setComparisonResult(null);
    videoAutoAnalyzedRef.current = false;
    resetSession();
  };

  // Sync userRole to hook
  useEffect(() => {
    if (userRole) {
      setHookUserRole(userRole);
    }
  }, [userRole, setHookUserRole]);

  // Auto-trigger video analysis when video capture completes
  useEffect(() => {
    if (
      state.mode === "video-analysis" &&
      state.step === 2 &&
      state.videoBlob &&
      !state.isAnalyzing &&
      !state.feedback &&
      !state.analysisError &&
      !videoAutoAnalyzedRef.current
    ) {
      videoAutoAnalyzedRef.current = true;
      analyzeVideo(["full"]);
    }
  }, [state.mode, state.step, state.videoBlob, state.isAnalyzing, state.feedback, state.analysisError, analyzeVideo]);

  const steps = getStepsForMode(state.mode);

  // Video processing loading state
  const VideoProcessingLoader = () => {
    const getStatusText = () => {
      switch (state.videoProcessingStatus) {
        case "loading":
          return { title: "Loading Video Processor", message: state.compressionMessage || "Loading video processor...", icon: Zap, detail: "Downloading processing engine", showProgress: false };
        case "preparing":
          return { title: "Preparing Video", message: state.compressionMessage || "Copying video to processor...", icon: Upload, detail: `${state.compressionProgress}% complete`, showProgress: true };
        case "compressing":
          return { title: "Compressing Video", message: state.compressionMessage || "Optimising for upload...", icon: Zap, detail: `${state.compressionProgress}% complete`, showProgress: true };
        case "uploading":
          return { title: "Uploading Video", message: state.compressionSavings || "Sending your video to our servers...", icon: Upload, detail: "This depends on your connection speed", showProgress: false };
        case "processing":
          return { title: "Indexing Video", message: "Processing your video content...", icon: Video, detail: "This typically takes 60–90 seconds", showProgress: false };
        case "analyzing":
          return { title: "Analysing Pedagogy", message: "AI is extracting teaching insights from visual and audio...", icon: Sparkles, detail: "Almost done...", showProgress: false };
        default:
          return { title: "Preparing Analysis", message: "Setting up video analysis...", icon: Video, detail: "Please wait", showProgress: false };
      }
    };

    const status = getStatusText();
    const StatusIcon = status.icon;
    const stages = ["loading", "preparing", "compressing", "uploading", "processing", "analyzing"];
    const currentStageIndex = stages.indexOf(state.videoProcessingStatus || "loading");

    return (
      <div className="section-fade-in flex flex-col items-center justify-center py-16 space-y-6">
        <div className="relative">
          <Loader2 className="w-16 h-16 text-primary animate-spin" />
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-sm font-mono px-3 py-1 rounded-full flex items-center gap-2">
            <StatusIcon className="w-4 h-4" />
            <span className="capitalize">{state.videoProcessingStatus || "preparing"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full max-w-xs">
          {stages.map((stage, index) => (
            <React.Fragment key={stage}>
              <div className={`h-2 flex-1 rounded-full transition-colors ${index <= currentStageIndex ? "bg-primary" : "bg-muted"}`} />
              {index < stages.length - 1 && (
                <div className={`w-1 h-1 rounded-full ${index < currentStageIndex ? "bg-primary" : "bg-muted"}`} />
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="text-center space-y-3">
          <h3 className="text-2xl font-heading font-semibold text-foreground">{status.title}</h3>
          <p className="text-muted-foreground max-w-md">{status.message}</p>
        </div>
        <RotatingInsight />
      </div>
    );
  };

  const renderStep = () => {
    if (state.step === 0) {
      return (
        <WelcomeScreen
          onSelectMode={selectMode}
          onSelectRole={setUserRole}
          selectedRole={userRole}
        />
      );
    }

    // Quick feedback mode flow (audio only)
    if (state.mode === "quick") {
      switch (state.step) {
        case 1:
          return <AudioRecorder onFastFeedback={handleAudioReady} onTranscriptSubmit={handleTranscriptSubmit} />;
        case 2:
          if (state.isTranscribing || (state.isAnalyzing && !state.feedback)) {
            return (
              <ProcessingLoader
                isTranscribing={state.isTranscribing}
                elapsed={state.isTranscribing ? state.transcriptionElapsed : undefined}
              />
            );
          }
          return (
            <FeedbackReport
              feedback={state.feedback}
              transcript={state.anonymizedTranscript}
              isLoading={state.isAnalyzing}
              onReset={handleReset}
              onRetry={retryAnalysis}
              error={state.analysisError}
              mode={state.mode}
              selectedPhases={state.selectedPhases}
              userRole={userRole}
            />
          );
      }
    }

    // Deep dive and full review modes
    if (state.mode === "deep-dive" || state.mode === "full-review") {
      switch (state.step) {
        case 1:
          return <SessionCapture mode={state.mode} onComplete={(blob, fileName, docs, details) => handleSessionCapture(blob, fileName, docs, details)} />;
        case 2:
          if (state.isTranscribing || (state.isAnalyzing && !state.feedback)) {
            return (
              <ProcessingLoader
                isTranscribing={state.isTranscribing}
                elapsed={state.isTranscribing ? state.transcriptionElapsed : undefined}
              />
            );
          }
          return (
            <FeedbackReport
              feedback={state.feedback}
              transcript={state.anonymizedTranscript}
              isLoading={state.isAnalyzing}
              onReset={handleReset}
              onRetry={retryAnalysis}
              error={state.analysisError}
              mode={state.mode}
              selectedPhases={state.selectedPhases}
              userRole={userRole}
            />
          );
      }
    }

    // Video analysis mode
    if (state.mode === "video-analysis") {
      switch (state.step) {
        case 1:
          return <VideoCapture onComplete={handleVideoCapture} />;
        case 2:
          if (state.isAnalyzing) {
            return <VideoProcessingLoader />;
          }
          return (
            <FeedbackReport
              feedback={state.feedback}
              transcript=""
              isLoading={state.isAnalyzing}
              onReset={handleReset}
              onRetry={() => state.selectedPhases.length > 0 && analyzeVideo(state.selectedPhases)}
              error={state.analysisError}
              mode={state.mode}
              selectedPhases={state.selectedPhases}
              userRole={userRole}
            />
          );
      }
    }

    // Compare sessions mode
    if (state.mode === "compare-sessions") {
      switch (state.step) {
        case 1:
          return (
            <SessionCompare
              userRole={userRole}
              onComplete={(result) => {
                setComparisonResult(result);
                advanceStep();
              }}
            />
          );
        case 2:
          if (!comparisonResult) {
            return (
              <ProcessingLoader isTranscribing={false} />
            );
          }
          return (
            <ComparisonReport
              result={comparisonResult}
              onReset={handleReset}
            />
          );
      }
    }

    return <WelcomeScreen onSelectMode={selectMode} selectedRole={userRole} />;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="container max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">PE</span>
              </div>
              <div>
                <h1 className="font-heading font-semibold text-foreground text-lg">PowerED</h1>
                <p className="text-xs text-muted-foreground">Teaching Feedback</p>
              </div>
            </div>
            {state.step > 0 && (
              <span className="text-sm text-muted-foreground">Bradford College</span>
            )}
          </div>
          {state.step > 0 && <StepIndicator steps={steps} currentStep={state.step} />}
        </div>
      </header>

      <main className="container max-w-4xl mx-auto px-4 py-8">
        {state.step > 0 && !state.isTranscribing && (
          <div className="flex gap-2 mb-6">
            <Button variant="outline" size="sm" onClick={goBack}>
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset}>
              <Home className="w-4 h-4" />
              Home
            </Button>
          </div>
        )}
        {renderStep()}
      </main>

      <footer className="border-t border-border bg-muted/30 mt-auto rounded-t-3xl">
        <div className="container max-w-4xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>© {new Date().getFullYear()} PowerED by Bradford College</p>
            <p>Your personal teaching coach</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
