import React, { useState, useRef, useCallback, forwardRef } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Download,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Loader2,
  Target,
  Star,
  Sparkles,
  Heart,
  TrendingUp,
  BookOpen,
  AlertTriangle,
  Trophy,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  MessageSquareQuote,
  FileDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SelectedPhase } from "./PhaseSelector";
import { PedagogicalTooltip, PEDAGOGICAL_TERMS } from "./PedagogicalTooltip";

interface ResearchSuggestion {
  technique: string;
  howToImplement: string;
  whyItWorks: string;
  example: string;
}

interface TranscriptExample {
  timestamp: string;
  quote: string;
  explanation: string;
}

interface CategoryFeedback {
  name: string;
  rating: number | string;
  summary?: string;
  whatsWorking: string;
  whatsWorkingExamples?: TranscriptExample[];
  evidenceStrengths?: string[]; // Legacy support
  toMakeStronger?: string;
  toMakeStrongerExamples?: TranscriptExample[];
  growthEdge?: string; // Legacy support
  areasForDevelopment?: string[];
  missedOpportunities?: string[];
  tryThisNext?: string;
  tryThisNextExamples?: TranscriptExample[];
  tryThis?: string; // Legacy support
  researchSuggestion?: ResearchSuggestion;
}

interface SessionMvp {
  moment: string;
  pedagogyHighlight: string;
}

interface ComparativeData {
  previousRating: number;
  ratingChange: number;
  improvementNotes: string;
  focusAreas: string[];
}

interface LEADPhaseFeedback {
  phase: string;
  rating: "exemplary" | "solid" | "developing" | "emerging";
  observations: string[];
  suggestions: string[];
}

type OfstedGradeType = "exceptional" | "strong_standard" | "expected_standard" | "needs_attention" | "urgent_improvement";

interface OfstedGrade {
  grade: OfstedGradeType;
  summary: string;
  strengths: string[];
  areasForDevelopment?: string[];
  caveat?: string;
}

interface StandardEnglishData {
  stars?: number;
  feedback?: string;
}

interface ITTECFIndicator {
  standard: string;
  subCode: string;
  statement: string;
  status: "demonstrated" | "not_yet_evidenced";
  evidence: string;
}

interface FeedbackData {
  sessionMvp?: SessionMvp;
  categories: CategoryFeedback[];
  leadPhases?: LEADPhaseFeedback[];
  lessonPhases?: LEADPhaseFeedback[];
  ofstedGrade?: OfstedGrade;
  standardEnglish?: StandardEnglishData;
  ittecfIndicators?: ITTECFIndicator[];
  overallSummary: string;
  topStrength: string;
  priorityGrowthArea: string;
  [key: string]: unknown;
}

type AnalysisMode = "quick" | "deep-dive" | "full-review" | "video-analysis";
type UserRole = "trainee" | "staff";

interface FeedbackReportProps {
  feedback: FeedbackData | null;
  userRole?: UserRole | null;
  transcript: string;
  isLoading: boolean;
  onReset: () => void;
  onRetry?: () => void;
  error?: string | null;
  mode: AnalysisMode;
  selectedPhases: SelectedPhase[];
}

const ratingLabels: Record<string, string> = {
  exemplary: "Exemplary Practice",
  solid: "Solid Foundation",
  developing: "Developing Practice",
  emerging: "Emerging Practice",
};

const ratingColors: Record<string, string> = {
  exemplary: "bg-success/10 text-success border-success/30",
  solid: "bg-primary/10 text-primary border-primary/30",
  developing: "bg-warning/10 text-warning border-warning/30",
  emerging: "bg-accent/10 text-accent border-accent/30",
};

const starRatingLabels: Record<number | string, string> = {
  4: "Exemplary Practice",
  3: "Solid Foundation",
  2: "Developing Practice",
  1: "Emerging Practice",
};

const starRatingColors: Record<number | string, string> = {
  4: "text-success",
  3: "text-primary",
  2: "text-warning",
  1: "text-accent",
};

const progressionStageLabels: Record<string, string> = {
  developing: "Developing",
  establishing: "Establishing",
  embedding: "Embedding",
};

const progressionStageColors: Record<string, string> = {
  developing: "bg-amber-500/20 text-amber-700 border-amber-500/40",
  establishing: "bg-blue-500/20 text-blue-700 border-blue-500/40",
  embedding: "bg-emerald-500/20 text-emerald-700 border-emerald-500/40",
};

// Helper to highlight quotes in text (non-pedagogical formatting)
const formatQuotesOnly = (text: string) => {
  const quoteRegex = /"([^"]+)"/g;
  return text.replace(quoteRegex, '<span class="quote-text">"$1"</span>');
};

// Strip inline bracket explanations after pedagogical terms OR any italic phrase.
// This ensures tooltips carry the meaning instead of inline brackets.
// Examples we remove:
// - cold calling (randomly selecting students)
// - *wait time* (the pause after asking a question)
// - *diagnostic questioning* (probing to understand thinking)
// - retrieval practice [brief explanation]
const stripPedagogicalExplanations = (text: string, terms: string[]) => {
  if (!text) return text;

  let result = text;

  // First: Strip brackets after ANY italic phrase *something* (...) or *something* [...]
  // This catches ALL pedagogical terms the AI might italicise, even ones not in our dictionary
  const italicBracketPattern = /(\*[^*]+\*)\s*(?:\([^)]+\)|\[[^\]]+\])/g;
  result = result.replace(italicBracketPattern, '$1');

  // Second: Strip brackets after known terms (non-italicised)
  const sortedTerms = [...terms].sort((a, b) => b.length - a.length);
  const escaped = sortedTerms
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  const termPattern = new RegExp(
    `\\b(${escaped})\\b\\s*(?:\\([^)]+\\)|\\[[^\\]]+\\])`,
    "gi"
  );
  result = result.replace(termPattern, '$1');

  return result;
};

// Render text with pedagogical tooltips for both standalone terms and *italic* wrapped terms
const renderWithTooltips = (text: string): React.ReactNode => {
  const terms = Object.keys(PEDAGOGICAL_TERMS);
  const cleaned = stripPedagogicalExplanations(text, terms);

  const parts: React.ReactNode[] = [];
  let key = 0;

  // First, split by italic markers *term* which often contain pedagogical terms
  // Pattern matches: *any text* (italic markers from AI)
  const italicPattern = /\*([^*]+)\*/g;

  // Create pattern for known pedagogical terms (for non-italic matches)
  const termPattern = new RegExp(
    `\\b(${terms
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")})\\b`,
    "gi"
  );

  let lastIndex = 0;
  let match;

  // Process italic-wrapped terms first
  while ((match = italicPattern.exec(cleaned)) !== null) {
    // Add text before the match (check for pedagogical terms in it)
    if (match.index > lastIndex) {
      const beforeText = cleaned.slice(lastIndex, match.index);
      parts.push(...processTextForTerms(beforeText, termPattern, key));
      key += 100; // Increment to avoid key collisions
    }

    const italicContent = match[1];
    const termLower = italicContent.toLowerCase();

    // Check if this italic text is a known pedagogical term
    const matchedTerm = terms.find((t) => termLower.includes(t.toLowerCase()));

    if (matchedTerm) {
      // It's a known pedagogical term - wrap in tooltip
      parts.push(
        <PedagogicalTooltip key={`italic-${key++}`} term={matchedTerm}>
          {italicContent}
        </PedagogicalTooltip>
      );
    } else {
      // Unknown italic term - render as plain text, no special styling
      // This prevents terms from looking highlighted/clickable without being hoverable
      parts.push(
        <span key={`italic-plain-${key++}`}>
          {italicContent}
        </span>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text (check for pedagogical terms in it)
  if (lastIndex < cleaned.length) {
    const remainingText = cleaned.slice(lastIndex);
    parts.push(...processTextForTerms(remainingText, termPattern, key));
  }

  return parts.length > 0 ? (
    <>{parts}</>
  ) : (
    <span dangerouslySetInnerHTML={{ __html: formatQuotesOnly(cleaned) }} />
  );
};

// Helper to process text segments for pedagogical terms
const processTextForTerms = (text: string, termPattern: RegExp, startKey: number): React.ReactNode[] => {
  const parts: React.ReactNode[] = [];
  let key = startKey;
  let lastIndex = 0;
  
  // Reset regex
  termPattern.lastIndex = 0;
  
  let match;
  while ((match = termPattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      const beforeText = text.slice(lastIndex, match.index);
      parts.push(
        <span key={`text-${key++}`} dangerouslySetInnerHTML={{ __html: formatQuotesOnly(beforeText) }} />
      );
    }
    
    // Add tooltip for the matched term
    parts.push(
      <PedagogicalTooltip key={`term-${key++}`} term={match[1]}>
        {match[0]}
      </PedagogicalTooltip>
    );
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(
      <span key={`text-end-${key++}`} dangerouslySetInnerHTML={{ __html: formatQuotesOnly(text.slice(lastIndex)) }} />
    );
  }
  
  return parts;
};

// For evidence lists - format quotes only (terms should be in main text)
const renderFormattedText = (text: string) => {
  return renderWithTooltips(text);
};

export const FeedbackReport = forwardRef<HTMLDivElement, FeedbackReportProps>(({
  feedback,
  transcript,
  isLoading,
  onReset,
  onRetry,
  error,
  mode,
  selectedPhases,
  userRole,
}, ref) => {
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [expandedPhases, setExpandedPhases] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Combine the forwarded ref with our local containerRef so we can access
  // the DOM node for PDF capture while still exposing the ref to the parent.
  const combinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [ref]
  );

  const toggleCategory = (name: string) => {
    setExpandedCategories((prev) =>
      prev.includes(name)
        ? prev.filter((n) => n !== name)
        : [...prev, name]
    );
  };

  const togglePhase = (phase: string) => {
    setExpandedPhases((prev) =>
      prev.includes(phase)
        ? prev.filter((p) => p !== phase)
        : [...prev, phase]
    );
  };

  const renderStars = (count: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4].map((i) => (
          <Star
            key={i}
            className={cn(
              "w-5 h-5",
              i <= count ? "text-yellow-500" : "text-muted-foreground/30"
            )}
            fill={i <= count ? "currentColor" : "none"}
          />
        ))}
      </div>
    );
  };

  const getLoadingMessage = () => {
    return `The AI is carefully reviewing your session. This usually takes about 30 seconds...`;
  };

  const handleDownload = async () => {
    if (!feedback || !containerRef.current) return;

    const container = containerRef.current;
    const timestamp = Date.now();

    // â”€â”€ Step 1: Save current open/closed states â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const prevCategories = [...expandedCategories];
    const prevPhases = [...expandedPhases];
    const detailsElements = Array.from(container.querySelectorAll<HTMLDetailsElement>("details"));
    const detailsStates = detailsElements.map((d) => d.open);

    // â”€â”€ Step 2: Expand all React-controlled sections synchronously â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    flushSync(() => {
      setExpandedCategories(feedback.categories.map((c) => c.name));
      setExpandedPhases(
        (feedback.lessonPhases || feedback.leadPhases || []).map((p) => p.phase)
      );
    });

    // â”€â”€ Step 3: Open all <details> elements (now in DOM after flushSync) â”€â”€â”€â”€â”€
    const expandedDetails = Array.from(
      container.querySelectorAll<HTMLDetailsElement>("details")
    );
    expandedDetails.forEach((d) => (d.open = true));

    // Allow one animation frame for any CSS transitions to settle
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    // Force solid white background so PDF export is not translucent
    const prevBg = container.style.backgroundColor;
    container.style.backgroundColor = "#ffffff";
    // â”€â”€ Step 4: Capture PDF with html2pdf.js â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const html2pdf = ((await import("html2pdf.js")) as any).default;
      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: `powered-report-${timestamp}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(container)
        .save();
    } finally {
      container.style.backgroundColor = prevBg;
      // â”€â”€ Step 5: Restore previous open/closed states â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      flushSync(() => {
        setExpandedCategories(prevCategories);
        setExpandedPhases(prevPhases);
      });
      // Restore <details> states (re-query in case the DOM changed during PDF gen)
      const currentDetails = Array.from(
        container.querySelectorAll<HTMLDetailsElement>("details")
      );
      currentDetails.forEach((d, i) => {
        d.open = detailsStates[i] ?? false;
      });
    }

  };

  const handleDownloadHtml = async () => {
    if (!feedback || !containerRef.current) return;

    const timestamp = Date.now();

    // Expand all sections before capturing HTML
    const prevCategories = [...expandedCategories];
    const prevPhases = [...expandedPhases];
    const detailsElements = Array.from(containerRef.current.querySelectorAll<HTMLDetailsElement>("details"));
    const detailsStates = detailsElements.map((d) => d.open);

    flushSync(() => {
      setExpandedCategories(feedback.categories.map((c) => c.name));
      setExpandedPhases((feedback.lessonPhases || feedback.leadPhases || []).map((p) => p.phase));
    });

    const expandedDetails = Array.from(containerRef.current.querySelectorAll<HTMLDetailsElement>("details"));
    expandedDetails.forEach((d) => (d.open = true));

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    // Embed the raw feedback JSON so SessionCompare can parse it back
    const reportPayload = { ...feedback, _generatedAt: timestamp };
    const safeJson = JSON.stringify(reportPayload).replace(/<\/script>/gi, "<\\/script>");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>PowerED Report</title>
  <script type="application/json" id="powered-report-data">${safeJson}<\/script>
</head>
<body>
${containerRef.current.innerHTML}
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `powered-report-${timestamp}.html`;
    a.click();
    URL.revokeObjectURL(url);

    // Restore previous states
    flushSync(() => {
      setExpandedCategories(prevCategories);
      setExpandedPhases(prevPhases);
    });
    const currentDetails = Array.from(containerRef.current.querySelectorAll<HTMLDetailsElement>("details"));
    currentDetails.forEach((d, i) => { d.open = detailsStates[i] ?? false; });
  };

  if (isLoading) {
    return (
      <div ref={ref} className="section-fade-in flex flex-col items-center justify-center py-16 space-y-6">
        <div className="relative">
          <Loader2 className="w-16 h-16 text-primary animate-spin" />
          <Sparkles className="w-6 h-6 text-yellow-500 absolute -top-1 -right-1 animate-pulse" />
        </div>
        <div className="text-center space-y-3">
          <h3 className="text-2xl font-heading font-semibold text-foreground">
            Analysing Your Session
          </h3>
          <p className="text-muted-foreground max-w-md">
            {getLoadingMessage()}
          </p>
          <p className="text-sm text-muted-foreground/70">
            Looking for specific moments and quotes to give you targeted feedback...
          </p>
        </div>
      </div>
    );
  }

  if (!feedback) {
    return (
      <div ref={ref} className="section-fade-in flex flex-col items-center justify-center py-16 space-y-6">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>
        <div className="text-center space-y-3">
          <h3 className="text-2xl font-heading font-semibold text-foreground">
            Analysis Couldn't Complete
          </h3>
          <p className="text-muted-foreground max-w-md">
            {error || "Something went wrong during the analysis. Your transcript is safe - you can try again."}
          </p>
        </div>
        <div className="flex gap-3">
          {onRetry && (
            <Button onClick={onRetry} className="gap-2">
              <RotateCcw className="w-4 h-4" />
              Try Again
            </Button>
          )}
          <Button variant="outline" onClick={onReset} className="gap-2">
            Start Over
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={combinedRef} className="section-fade-in space-y-8">
      {/* Celebration Header */}
      <div className="text-center space-y-4 py-4">
        <div className="inline-flex items-center gap-2 text-success bg-success/10 px-4 py-2 rounded-full">
          <Sparkles className="w-5 h-5" />
          <span className="font-medium">Analysis Complete!</span>
        </div>
        <h2 className="text-3xl font-heading font-semibold text-foreground">
          Great Work Reflecting on Your Practice
        </h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Here's your personalised feedback with specific moments from your session
        </p>
      </div>

      {/* Session MVP - The Star Moment */}
      {feedback.sessionMvp && (
        <div className="card-elevated p-6 bg-gradient-to-r from-yellow-500/10 via-amber-500/10 to-yellow-500/10 border-2 border-yellow-500/30 relative overflow-hidden">
          <div className="absolute top-3 right-3 flex gap-1">
            <Star className="w-5 h-5 text-yellow-500" fill="currentColor" />
            <Star className="w-6 h-6 text-yellow-500" fill="currentColor" />
            <Star className="w-5 h-5 text-yellow-500" fill="currentColor" />
          </div>
          <details className="group">
            <summary className="flex items-center gap-4 cursor-pointer list-none">
              <div className="w-14 h-14 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-7 h-7 text-yellow-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-yellow-700 flex items-center gap-2">
                  â­ Session MVP Moment â­
                </h3>
                <p className="text-sm text-yellow-600/80 font-medium">{feedback.sessionMvp.pedagogyHighlight}</p>
              </div>
              <ChevronDown className="w-5 h-5 text-yellow-600 group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-4 pt-4 border-t border-yellow-500/20">
              <p className="text-foreground leading-relaxed text-lg">
                {renderWithTooltips(feedback.sessionMvp.moment)}
              </p>
            </div>
          </details>
        </div>
      )}

      {/* Overall Summary - Warm Card */}
      <div className="card-elevated p-8 bg-gradient-to-br from-primary/5 via-background to-accent/5 border-primary/20">
        {/* Ofsted Grade Badge - staff only */}
        {userRole !== "trainee" && feedback.ofstedGrade && (
          <div className="flex items-center justify-center mb-6">
            <div className={cn(
              "px-5 py-2.5 rounded-full text-base font-bold border-2",
              feedback.ofstedGrade.grade === "exceptional" && "bg-emerald-500/20 text-emerald-700 border-emerald-500/40",
              feedback.ofstedGrade.grade === "strong_standard" && "bg-blue-500/20 text-blue-700 border-blue-500/40",
              feedback.ofstedGrade.grade === "expected_standard" && "bg-amber-500/20 text-amber-700 border-amber-500/40",
              feedback.ofstedGrade.grade === "needs_attention" && "bg-orange-500/20 text-orange-700 border-orange-500/40",
              feedback.ofstedGrade.grade === "urgent_improvement" && "bg-red-500/20 text-red-700 border-red-500/40"
            )}>
              {feedback.ofstedGrade.grade === "exceptional" && "âœ¨ Exceptional"}
              {feedback.ofstedGrade.grade === "strong_standard" && "â­ Strong Standard"}
              {feedback.ofstedGrade.grade === "expected_standard" && "✓ Expected Standard"}
              {feedback.ofstedGrade.grade === "needs_attention" && "âš  Needs Attention"}
              {feedback.ofstedGrade.grade === "urgent_improvement" && "ðŸš¨ Urgent Improvement"}
            </div>
          </div>
        )}
        <p className="text-lg text-foreground leading-relaxed mb-6">{feedback.overallSummary}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="p-5 bg-success/10 rounded-xl border border-success/20">
            <div className="flex items-center gap-2 mb-2">
              <Heart className="w-5 h-5 text-success" />
              <p className="text-sm font-semibold text-success">Your Top Strength</p>
            </div>
            <p className="text-foreground">{feedback.topStrength}</p>
          </div>
          <div className="p-5 bg-amber-500/10 rounded-xl border border-amber-500/20">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-amber-600" />
              <p className="text-sm font-semibold text-amber-600">Priority Growth Area</p>
            </div>
            <p className="text-foreground">{feedback.priorityGrowthArea}</p>
          </div>
        </div>
      </div>

      {/* Category Analysis */}
      <div className="card-elevated overflow-hidden">
        <div className="p-5 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Star className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-lg">Your Teaching Practice Analysis</h3>
              <p className="text-sm text-muted-foreground">Click each domain to see detailed feedback with specific moments</p>
            </div>
          </div>
        </div>
        <div className="divide-y divide-border">
          {feedback.categories.map((category, idx) => (
            <div key={`${category.name}-${idx}`}>
              <button
                onClick={() => toggleCategory(category.name)}
                className="w-full flex items-center justify-between p-5 hover:bg-secondary/30 transition-colors"
              >
                <div className="flex flex-col items-start gap-2">
                  <div className="flex items-center gap-4">
                    <span className="font-semibold text-foreground text-left">{category.name}</span>
                    <div className="flex items-center gap-2">
                      {typeof category.rating === 'number' ? (
                        <>
                          {renderStars(category.rating)}
                          <span className={cn("text-sm font-medium", starRatingColors[category.rating])}>
                            {starRatingLabels[category.rating]}
                          </span>
                        </>
                      ) : (
                        <span className={cn(
                          "text-sm px-3 py-1 rounded-full border-2 font-semibold",
                          progressionStageColors[category.rating as string] || ""
                        )}>
                          {progressionStageLabels[category.rating as string] || category.rating}
                        </span>
                      )}
                    </div>
                  </div>
                  {category.summary && (
                    <p className="text-sm text-muted-foreground text-left italic">{category.summary}</p>
                  )}
                </div>
                {expandedCategories.includes(category.name) ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                )}
              </button>
              {expandedCategories.includes(category.name) && (
                <div className="px-5 pb-6 space-y-4 animate-fade-in">
                  {/* What's Working Well */}
                  <div className="p-4 bg-success/5 rounded-xl border border-success/15">
                    <h4 className="text-sm font-semibold text-success mb-3 flex items-center gap-2">
                      <span className="text-base">✓</span> What's Working Well
                    </h4>
                    <p className="text-foreground leading-relaxed mb-3">
                      {renderWithTooltips(category.whatsWorking)}
                    </p>
                    {/* Want an example? button */}
                    {(category.whatsWorkingExamples && category.whatsWorkingExamples.length > 0) || (category.evidenceStrengths && category.evidenceStrengths.length > 0) ? (
                      <details className="mt-3 border-t border-success/10 pt-3 group">
                        <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-success hover:text-success/80 transition-colors">
                          <MessageSquareQuote className="w-4 h-4" />
                          Want an example?
                          <ChevronDown className="w-4 h-4 group-open:rotate-180 transition-transform ml-auto" />
                        </summary>
                        <div className="mt-3 space-y-3">
                          {category.whatsWorkingExamples && category.whatsWorkingExamples.map((example, i) => (
                            <div key={i} className="p-3 bg-success/10 rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-mono px-2 py-0.5 bg-success/20 rounded text-success">{example.timestamp}</span>
                              </div>
                              <p className="text-sm text-foreground italic mb-2">"{example.quote}"</p>
                              <p className="text-sm text-muted-foreground">{example.explanation}</p>
                            </div>
                          ))}
                          {/* Legacy support for evidenceStrengths */}
                          {category.evidenceStrengths && category.evidenceStrengths.map((evidence, i) => (
                            <div key={`legacy-${i}`} className="text-sm text-foreground flex items-start gap-2">
                              <span className="text-success mt-0.5">â€¢</span>
                              {renderFormattedText(evidence)}
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </div>

                  {/* To Make It Even Stronger */}
                  <div className="p-4 bg-amber-500/5 rounded-xl border border-amber-500/15">
                    <h4 className="text-sm font-semibold text-amber-600 mb-3 flex items-center gap-2">
                      <span className="text-base">→</span> To Make It Even Stronger
                    </h4>
                    <p className="text-foreground leading-relaxed mb-3">
                      {renderWithTooltips(category.toMakeStronger || category.growthEdge || "")}
                    </p>
                    {/* Want an example? button */}
                    {(category.toMakeStrongerExamples && category.toMakeStrongerExamples.length > 0) || (category.areasForDevelopment && category.areasForDevelopment.length > 0) ? (
                      <details className="mt-3 border-t border-amber-500/10 pt-3 group">
                        <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-amber-600 hover:text-amber-500 transition-colors">
                          <MessageSquareQuote className="w-4 h-4" />
                          Want an example?
                          <ChevronDown className="w-4 h-4 group-open:rotate-180 transition-transform ml-auto" />
                        </summary>
                        <div className="mt-3 space-y-3">
                          {category.toMakeStrongerExamples && category.toMakeStrongerExamples.map((example, i) => (
                            <div key={i} className="p-3 bg-amber-500/10 rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-mono px-2 py-0.5 bg-amber-500/20 rounded text-amber-700">{example.timestamp}</span>
                              </div>
                              <p className="text-sm text-foreground italic mb-2">"{example.quote}"</p>
                              <p className="text-sm text-muted-foreground">{example.explanation}</p>
                            </div>
                          ))}
                          {/* Legacy/additional support for areasForDevelopment */}
                          {category.areasForDevelopment && category.areasForDevelopment.map((area, i) => (
                            <div key={`area-${i}`} className="text-sm text-foreground flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                              {renderFormattedText(area)}
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                    {category.missedOpportunities && category.missedOpportunities.length > 0 && (
                      <div className="mt-3 border-t border-amber-500/10 pt-3">
                        <p className="text-xs font-semibold text-amber-700 mb-2">Missed Opportunities:</p>
                        <ul className="space-y-1">
                          {category.missedOpportunities.map((missed, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                              <span className="text-amber-400">â€“</span>
                              {missed}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Try This Next Time */}
                  <div className="p-4 bg-primary/5 rounded-xl border border-primary/15">
                    <h4 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
                      <span className="text-base">ðŸ’¡</span> Try This Next Time
                    </h4>
                    <p className="text-foreground leading-relaxed">
                      {renderWithTooltips(category.tryThisNext || category.tryThis || "")}
                    </p>
                    {/* Want an example? button */}
                    {category.tryThisNextExamples && category.tryThisNextExamples.length > 0 && (
                      <details className="mt-3 border-t border-primary/10 pt-3 group">
                        <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-primary hover:text-primary/80 transition-colors">
                          <MessageSquareQuote className="w-4 h-4" />
                          Want an example?
                          <ChevronDown className="w-4 h-4 group-open:rotate-180 transition-transform ml-auto" />
                        </summary>
                        <div className="mt-3 space-y-3">
                          {category.tryThisNextExamples.map((example, i) => (
                            <div key={i} className="p-3 bg-primary/10 rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-mono px-2 py-0.5 bg-primary/20 rounded text-primary">{example.timestamp}</span>
                              </div>
                              <p className="text-sm text-foreground italic mb-2">"{example.quote}"</p>
                              <p className="text-sm text-muted-foreground">{example.explanation}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>

                  {/* Research-Informed Suggestion - COLLAPSED BY DEFAULT */}
                  {category.researchSuggestion && (
                    <details className="group">
                      <summary className="p-4 bg-purple-500/5 rounded-xl border border-purple-500/15 cursor-pointer hover:bg-purple-500/10 transition-colors">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-purple-600 flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            ðŸ“š Research-Informed Suggestion: {category.researchSuggestion.technique}
                          </h4>
                          <ChevronDown className="w-4 h-4 text-purple-600 group-open:rotate-180 transition-transform" />
                        </div>
                      </summary>
                      <div className="p-4 bg-purple-500/5 rounded-b-xl border border-t-0 border-purple-500/15 -mt-2 pt-4">
                        <div className="space-y-2 text-sm">
                          <p className="text-foreground">
                            <span className="font-medium text-purple-700">How to implement:</span>{" "}
                            {category.researchSuggestion.howToImplement}
                          </p>
                          <p className="text-foreground">
                            <span className="font-medium text-purple-700">Why it works:</span>{" "}
                            {category.researchSuggestion.whyItWorks}
                          </p>
                          <p className="text-foreground italic">
                            <span className="font-medium text-purple-700 not-italic">Example:</span>{" "}
                            "{category.researchSuggestion.example}"
                          </p>
                        </div>
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Lesson Phase Feedback - staff only */}
      {userRole !== "trainee" && (feedback.lessonPhases || feedback.leadPhases || []).length > 0 && (
        <div className="card-elevated overflow-hidden">
          <div className="p-5 bg-gradient-to-r from-accent/10 to-accent/5 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                <Target className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-lg">Lesson Phase Feedback</h3>
                <p className="text-sm text-muted-foreground">How you performed in each lesson phase</p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-border">
            {(feedback.lessonPhases || feedback.leadPhases || []).map((phase) => (
              <div key={phase.phase}>
                <button
                  onClick={() => togglePhase(phase.phase)}
                  className="w-full flex items-center justify-between p-5 hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <span className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                      {phase.phase[0]}
                    </span>
                    <span className="font-semibold text-foreground text-lg">{phase.phase}</span>
                    <span
                      className={cn(
                        "text-sm px-3 py-1.5 rounded-full border font-medium",
                        ratingColors[phase.rating] || "bg-muted text-muted-foreground border-border"
                      )}
                    >
                      {ratingLabels[phase.rating] || phase.rating}
                    </span>
                  </div>
                  {expandedPhases.includes(phase.phase) ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
                {expandedPhases.includes(phase.phase) && (
                  <div className="px-5 pb-6 pl-20 space-y-4 animate-fade-in">
                    <div className="p-4 bg-secondary/30 rounded-xl">
                      <h4 className="text-sm font-semibold text-muted-foreground mb-3">
                        Observations
                      </h4>
                      <ul className="space-y-2">
                        {phase.observations.map((obs, i) => (
                          <li 
                            key={i} 
                            className="text-foreground flex items-start gap-3"
                          >
                            <span className="text-primary mt-1">{"\u2022"}</span>
                            {renderFormattedText(obs)}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {phase.suggestions.length > 0 && (
                      <div className="p-4 bg-accent/5 rounded-xl border border-accent/15">
                        <h4 className="text-sm font-semibold text-accent mb-3">
                          Suggestions for Next Time
                        </h4>
                        <ul className="space-y-2">
                          {phase.suggestions.map((sug, i) => (
                            <li 
                              key={i} 
                              className="text-foreground flex items-start gap-3"
                            >
                              <span className="text-accent mt-1">→</span>
                              {renderFormattedText(sug)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ofsted Grade Section - removed, grade badge now shown in summary */}

      {/* Standard English Usage - trainee only */}
      {userRole === "trainee" && feedback.standardEnglish && (
        <div className="card-elevated overflow-hidden">
          <div className="p-5 bg-gradient-to-r from-blue-500/10 to-blue-500/5 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground text-lg">Standard English Usage</h3>
                <p className="text-sm text-muted-foreground">Language modelling in your session</p>
              </div>
              {(() => {
                const seStars = Math.max(0, Math.min(5, Number(feedback.standardEnglish?.stars) || 0));
                return (
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        className={cn(
                          "w-5 h-5",
                          i <= seStars ? "text-yellow-500" : "text-muted-foreground/30"
                        )}
                        fill={i <= seStars ? "currentColor" : "none"}
                      />
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
          <div className="p-5">
            {feedback.standardEnglish.feedback ? (
              <p className="text-foreground leading-relaxed">
                {feedback.standardEnglish.feedback}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Re-run analysis to generate Standard English feedback.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ITTECF Indicators - trainee only */}
      {userRole === "trainee" && feedback.ittecfIndicators && feedback.ittecfIndicators.length > 0 && (
        <div className="card-elevated overflow-hidden">
          <div className="p-5 bg-gradient-to-r from-purple-500/10 to-purple-500/5 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Target className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-lg">ITT & Early Career Framework</h3>
                <p className="text-sm text-muted-foreground">"Learn How To..." Indicators evidenced in your session</p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-border">
            {feedback.ittecfIndicators.map((indicator, i) => (
              <div key={i} className="p-4 flex items-start gap-4">
                <div className={cn(
                  "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                  indicator.status === "demonstrated" 
                    ? "bg-emerald-500/20 text-emerald-700" 
                    : "bg-muted text-muted-foreground"
                )}>
                  {indicator.status === "demonstrated" ? "✓" : "○"}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono px-2 py-0.5 bg-purple-500/20 rounded text-purple-700">
                      {indicator.standard} {indicator.subCode}
                    </span>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      indicator.status === "demonstrated" 
                        ? "bg-emerald-500/10 text-emerald-700" 
                        : "bg-muted text-muted-foreground"
                    )}>
                      {indicator.status === "demonstrated" ? "Demonstrated" : "Not yet evidenced"}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground">{indicator.statement}</p>
                  <p className="text-xs text-muted-foreground">{indicator.evidence}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
        <Button onClick={handleDownload} size="lg" className="gap-2">
          <Download className="w-5 h-5" />
          Download Report
        </Button>
        <Button onClick={handleDownloadHtml} variant="outline" size="lg" className="gap-2">
          <FileDown className="w-5 h-5" />
          Save for Comparison
        </Button>
        <Button onClick={onReset} variant="outline" size="lg" className="gap-2">
          <RotateCcw className="w-5 h-5" />
          Start New Analysis
        </Button>
      </div>

      {/* Encouragement Footer */}
      <div className="bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 rounded-xl p-6 text-center space-y-2">
        <p className="text-foreground font-medium">
          Remember: Great teaching is a journey, not a destination. 
        </p>
        <p className="text-muted-foreground text-sm">
          Every lesson is an opportunity to grow. Keep up the fantastic work! 
        </p>
      </div>

      {/* Privacy Reminder */}
      <div className="bg-muted/50 rounded-lg p-4 text-center">
        <p className="text-sm text-muted-foreground">
          <strong>Privacy Note:</strong> No data has been stored. All analysis data will be 
          cleared when you close this browser tab.
        </p>
      </div>
    </div>
  );
});

FeedbackReport.displayName = "FeedbackReport";
