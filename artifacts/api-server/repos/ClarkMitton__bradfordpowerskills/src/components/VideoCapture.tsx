import React, { useState, useRef, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Video, X, Play, Pause, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface VideoCaptureProps {
  onComplete: (videoBlob: Blob, fileName: string) => void;
}

const MAX_FILE_SIZE_MB = 500;
const RECOMMENDED_DURATION_MIN = 30;

export const VideoCapture = forwardRef<HTMLDivElement, VideoCaptureProps>(({ onComplete }, ref) => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsValidating(true);

    // Validate file type
    const validTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"];
    if (!validTypes.includes(file.type)) {
      toast.error("Please upload a valid video file (MP4, WebM, or MOV)");
      setIsValidating(false);
      return;
    }

    // Validate file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      toast.error(`File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB. Your file is ${fileSizeMB.toFixed(0)}MB.`);
      setIsValidating(false);
      return;
    }

    // Create URL for preview
    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);
    setIsValidating(false);

    toast.success("Video loaded successfully!");
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const durationMin = videoRef.current.duration / 60;
      setDuration(durationMin);

      if (durationMin > RECOMMENDED_DURATION_MIN) {
        toast.warning(
          `Video is ${durationMin.toFixed(0)} minutes. Processing may take ${Math.ceil(durationMin / 10)} minutes or more.`,
          { duration: 5000 }
        );
      }
    }
  };

  const togglePlayback = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const clearVideo = () => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setVideoFile(null);
    setVideoUrl(null);
    setDuration(null);
    setIsPlaying(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = () => {
    if (videoFile) {
      onComplete(videoFile, videoFile.name);
    }
  };

  const formatDuration = (minutes: number) => {
    const mins = Math.floor(minutes);
    const secs = Math.round((minutes - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div ref={ref} className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-foreground">Upload Your Teaching Video</h2>
        <p className="text-muted-foreground">
          We'll analyze both the visual and audio elements of your teaching session
        </p>
      </div>

      {!videoFile ? (
        <Card className="border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 transition-colors">
          <CardContent className="p-8">
            <label
              htmlFor="video-upload"
              className="flex flex-col items-center justify-center cursor-pointer"
            >
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <span className="text-lg font-medium text-foreground mb-2">
                Click to upload or drag and drop
              </span>
              <span className="text-sm text-muted-foreground">
                MP4, WebM, or MOV (max {MAX_FILE_SIZE_MB}MB)
              </span>
              <input
                ref={fileInputRef}
                id="video-upload"
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
                className="hidden"
                onChange={handleFileSelect}
                disabled={isValidating}
              />
            </label>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <CardTitle className="text-base">{videoFile.name}</CardTitle>
                  <CardDescription>
                    {(videoFile.size / (1024 * 1024)).toFixed(1)}MB
                    {duration && ` • ${formatDuration(duration)} minutes`}
                  </CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={clearVideo}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
              <video
                ref={videoRef}
                src={videoUrl || undefined}
                className="w-full h-full object-contain"
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Button
                  variant="secondary"
                  size="lg"
                  className="rounded-full w-14 h-14 opacity-80 hover:opacity-100"
                  onClick={togglePlayback}
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6" />
                  ) : (
                    <Play className="w-6 h-6 ml-1" />
                  )}
                </Button>
              </div>
            </div>

            {duration && duration > RECOMMENDED_DURATION_MIN && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">Long video detected</p>
                  <p className="text-amber-600/80 dark:text-amber-400/80">
                    Processing may take {Math.ceil(duration / 10)}-{Math.ceil(duration / 5)} minutes. 
                    You can continue using the app while we analyze.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="bg-muted/50 rounded-lg p-4 space-y-2">
        <h4 className="font-medium text-sm text-foreground flex items-center gap-2">
          <Video className="w-4 h-4" />
          What we analyze
        </h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• <strong>Visual:</strong> Body language, movement, use of space, visual aids</li>
          <li>• <strong>Audio:</strong> Questioning, explanations, feedback, pace</li>
          <li>• <strong>Engagement:</strong> Student attention signals and interactions</li>
        </ul>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!videoFile}
        className="w-full"
        size="lg"
      >
        Analyze My Teaching Video
    </Button>
    </div>
  );
});

VideoCapture.displayName = "VideoCapture";
