import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, X, ArrowRight, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface PreviousReportData {
  categories: Array<{
    name: string;
    rating: number;
    whatsWorking?: string;
    toMakeStronger?: string;
    tryThisNext?: string;
    mvpMoment?: string;
  }>;
  overallSummary?: string;
  topStrength?: string;
  priorityGrowthArea?: string;
}

interface PreviousReportUploaderProps {
  onReportUploaded: (reportData: PreviousReportData, rawContent: string) => void;
  onSkip?: () => void;
}

export function PreviousReportUploader({ onReportUploaded, onSkip }: PreviousReportUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const parseReportContent = async (content: string): Promise<PreviousReportData> => {
    // Try to extract structured data from HTML or text content
    const categories: PreviousReportData["categories"] = [];
    
    // Look for domain patterns in the content
    const domainPatterns = [
      "Questioning & Cognitive Challenge",
      "Explanation & Conceptual Clarity",
      "Responsive Teaching & Formative Assessment",
      "Classroom Culture & Learning Environment",
      "Participation & Voice Equity"
    ];

    domainPatterns.forEach(domain => {
      // Try to find rating (stars pattern)
      const starMatch = content.match(new RegExp(`${domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(★+☆*|⭐+)`, 'i'));
      let rating = 2; // default
      if (starMatch) {
        const stars = starMatch[1].replace(/☆/g, '').length;
        rating = Math.min(4, Math.max(1, stars));
      }

      categories.push({
        name: domain,
        rating,
        whatsWorking: "",
        toMakeStronger: "",
        tryThisNext: ""
      });
    });

    // Try to extract summary sections
    const summaryMatch = content.match(/Overall\s*Summary[:\s]*([^<\n]+)/i);
    const strengthMatch = content.match(/Top\s*Strength[:\s]*([^<\n]+)/i);
    const growthMatch = content.match(/Priority\s*Growth[:\s]*([^<\n]+)/i);

    return {
      categories: categories.length > 0 ? categories : [
        { name: "Questioning & Cognitive Challenge", rating: 2 },
        { name: "Explanation & Conceptual Clarity", rating: 2 },
        { name: "Responsive Teaching & Formative Assessment", rating: 2 },
        { name: "Classroom Culture & Learning Environment", rating: 2 },
        { name: "Participation & Voice Equity", rating: 2 }
      ],
      overallSummary: summaryMatch?.[1]?.trim() || "",
      topStrength: strengthMatch?.[1]?.trim() || "",
      priorityGrowthArea: growthMatch?.[1]?.trim() || ""
    };
  };

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setIsProcessing(true);

    // Validate file type
    const validTypes = ['application/pdf', 'text/html', 'text/plain'];
    const isValidType = validTypes.includes(file.type) || 
                        file.name.endsWith('.pdf') ||
                        file.name.endsWith('.html') || 
                        file.name.endsWith('.htm') ||
                        file.name.endsWith('.txt');

    if (!isValidType) {
      setError("Please upload your previous report as a PDF file.");
      setIsProcessing(false);
      return;
    }

    try {
      const content = await file.text();
      const reportData = await parseReportContent(content);
      setUploadedFile(file);
      onReportUploaded(reportData, content);
    } catch (err) {
      setError("Could not parse the report. Please ensure it's a valid report file.");
    } finally {
      setIsProcessing(false);
    }
  }, [onReportUploaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const removeFile = () => {
    setUploadedFile(null);
    setError(null);
  };

  return (
    <div className="section-fade-in space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-heading font-semibold text-foreground">
          Upload Your Previous Report
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Upload your last session analysis report so we can compare your progress and highlight improvements.
        </p>
      </div>

      {/* Upload Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-8 text-center transition-all",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-secondary/30",
          uploadedFile && "border-success bg-success/5"
        )}
      >
        {uploadedFile ? (
          <div className="flex items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center">
              <FileText className="w-6 h-6 text-success" />
            </div>
            <div className="text-left">
              <p className="font-medium text-foreground">{uploadedFile.name}</p>
              <p className="text-sm text-muted-foreground">Previous report loaded</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={removeFile}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        ) : (
          <>
            <input
              type="file"
              accept=".pdf,.html,.htm,.txt"
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isProcessing}
            />
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">
                  {isProcessing ? "Processing..." : "Drop your previous report here"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  or click to browse (PDF from "Download Report")
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Help Text */}
      <div className="bg-muted/50 rounded-lg p-4 text-center">
        <p className="text-sm text-muted-foreground">
          <strong>Don't have your previous report?</strong> No worries! You can skip this step 
          and get regular feedback instead.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
        {uploadedFile && (
          <Button size="lg" className="gap-2">
            Continue with Comparison
            <ArrowRight className="w-5 h-5" />
          </Button>
        )}
        {onSkip && (
          <Button variant="outline" size="lg" onClick={onSkip}>
            Skip - Get Fresh Feedback
          </Button>
        )}
      </div>
    </div>
  );
}
