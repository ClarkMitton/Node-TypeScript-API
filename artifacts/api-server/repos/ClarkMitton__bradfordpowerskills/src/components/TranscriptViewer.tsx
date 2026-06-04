import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { X, BookOpen, Highlighter } from "lucide-react";
import { cn } from "@/lib/utils";

interface CategoryFeedback {
  name: string;
  rating: number;
  whatsWorking: string;
  growthEdge: string;
  tryThis: string;
}

interface LessonPhaseFeedback {
  phase: string;
  rating: "exemplary" | "solid" | "developing" | "emerging";
  observations: string[];
  suggestions: string[];
}

interface FeedbackData {
  categories: CategoryFeedback[];
  lessonPhases: LessonPhaseFeedback[];
  overallSummary: string;
  topStrength: string;
  priorityGrowthArea: string;
}

interface TranscriptViewerProps {
  transcript: string;
  feedback: FeedbackData;
  isOpen: boolean;
  onClose: () => void;
}

interface HighlightMatch {
  quote: string;
  category: string;
  type: "strength" | "growth" | "phase";
  color: string;
}

// Extract quotes and timestamps from feedback text
const extractEvidence = (text: string): string[] => {
  const quotes: string[] = [];
  
  // Match quoted text
  const quoteRegex = /\"([^\"]+)\"/g;
  let match;
  while ((match = quoteRegex.exec(text)) !== null) {
    if (match[1].length > 8) { // Only meaningful quotes
      quotes.push(match[1]);
    }
  }
  
  return quotes;
};

// Build a list of all quotes from feedback with their categories
const buildHighlightMap = (feedback: FeedbackData): HighlightMatch[] => {
  const matches: HighlightMatch[] = [];
  
  // Category feedback
  feedback.categories.forEach((cat) => {
    extractEvidence(cat.whatsWorking).forEach((quote) => {
      matches.push({
        quote,
        category: cat.name,
        type: "strength",
        color: "bg-success/20 border-success/40",
      });
    });
    
    extractEvidence(cat.growthEdge).forEach((quote) => {
      matches.push({
        quote,
        category: cat.name,
        type: "growth",
        color: "bg-amber-500/20 border-amber-500/40",
      });
    });
  });
  
  // Lesson phase feedback
  (feedback.lessonPhases || []).forEach((phase) => {
    phase.observations.forEach((obs) => {
      extractEvidence(obs).forEach((quote) => {
        matches.push({
          quote,
          category: phase.phase,
          type: "phase",
          color: "bg-primary/20 border-primary/40",
        });
      });
    });
    
    phase.suggestions.forEach((sug) => {
      extractEvidence(sug).forEach((quote) => {
        matches.push({
          quote,
          category: phase.phase,
          type: "growth",
          color: "bg-amber-500/20 border-amber-500/40",
        });
      });
    });
  });
  
  return matches;
};

// Find the best match for a quote in the transcript (fuzzy matching)
const findQuoteInTranscript = (transcript: string, quote: string): { start: number; end: number } | null => {
  const normalizedTranscript = transcript.toLowerCase();
  const normalizedQuote = quote.toLowerCase();
  
  // Try exact match first
  const exactIndex = normalizedTranscript.indexOf(normalizedQuote);
  if (exactIndex !== -1) {
    return { start: exactIndex, end: exactIndex + quote.length };
  }
  
  // Try partial match (first 20 chars)
  if (quote.length > 20) {
    const partial = normalizedQuote.substring(0, 20);
    const partialIndex = normalizedTranscript.indexOf(partial);
    if (partialIndex !== -1) {
      // Find the end of the sentence or paragraph
      const endIndex = Math.min(partialIndex + quote.length + 20, transcript.length);
      return { start: partialIndex, end: endIndex };
    }
  }
  
  return null;
};

export function TranscriptViewer({ transcript, feedback, isOpen, onClose }: TranscriptViewerProps) {
  const [activeFilter, setActiveFilter] = useState<"all" | "strength" | "growth" | "phase">("all");
  
  const highlightMatches = useMemo(() => buildHighlightMap(feedback), [feedback]);
  
  // Build highlighted transcript
  const highlightedContent = useMemo(() => {
    if (!transcript || highlightMatches.length === 0) {
      return [{ text: transcript, highlight: null }];
    }
    
    // Find all positions to highlight
    type HighlightPosition = { start: number; end: number; match: HighlightMatch };
    const positions: HighlightPosition[] = [];
    
    highlightMatches.forEach((match) => {
      const pos = findQuoteInTranscript(transcript, match.quote);
      if (pos) {
        positions.push({ ...pos, match });
      }
    });
    
    // Sort by start position
    positions.sort((a, b) => a.start - b.start);
    
    // Remove overlapping positions (keep the first one)
    const filteredPositions: HighlightPosition[] = [];
    let lastEnd = 0;
    positions.forEach((pos) => {
      if (pos.start >= lastEnd) {
        filteredPositions.push(pos);
        lastEnd = pos.end;
      }
    });
    
    // Build segments
    interface Segment {
      text: string;
      highlight: HighlightMatch | null;
    }
    const segments: Segment[] = [];
    let currentIndex = 0;
    
    filteredPositions.forEach((pos) => {
      // Add non-highlighted text before this highlight
      if (pos.start > currentIndex) {
        segments.push({
          text: transcript.substring(currentIndex, pos.start),
          highlight: null,
        });
      }
      
      // Add highlighted text
      segments.push({
        text: transcript.substring(pos.start, pos.end),
        highlight: pos.match,
      });
      
      currentIndex = pos.end;
    });
    
    // Add remaining text
    if (currentIndex < transcript.length) {
      segments.push({
        text: transcript.substring(currentIndex),
        highlight: null,
      });
    }
    
    return segments;
  }, [transcript, highlightMatches]);
  
  // Filter based on active filter
  const visibleHighlights = useMemo(() => {
    if (activeFilter === "all") return highlightMatches;
    return highlightMatches.filter((m) => m.type === activeFilter);
  }, [highlightMatches, activeFilter]);
  
  const legendItems = [
    { type: "strength" as const, label: "Strength", color: "bg-success/30 border-success/50", icon: "✓" },
    { type: "growth" as const, label: "Growth Area", color: "bg-amber-500/30 border-amber-500/50", icon: "→" },
    { type: "phase" as const, label: "Lesson Phase", color: "bg-primary/30 border-primary/50", icon: "◆" },
  ];
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="fixed inset-4 md:inset-8 bg-background rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-border bg-gradient-to-r from-primary/5 to-accent/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-heading font-semibold text-foreground">
                Session Transcript
              </h2>
              <p className="text-sm text-muted-foreground">
                Highlighted sections correspond to feedback points
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        {/* Legend / Key */}
        <div className="p-4 md:px-6 border-b border-border bg-secondary/30">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Highlighter className="w-4 h-4" />
              <span>Highlight Key:</span>
            </div>
            {legendItems.map((item) => (
              <button
                key={item.type}
                onClick={() => setActiveFilter(activeFilter === item.type ? "all" : item.type)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all",
                  item.color,
                  activeFilter === item.type && "ring-2 ring-offset-2 ring-primary"
                )}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
                <span className="text-xs opacity-70">
                  ({highlightMatches.filter((m) => m.type === item.type).length})
                </span>
              </button>
            ))}
            {activeFilter !== "all" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveFilter("all")}
                className="text-xs"
              >
                Show All
              </Button>
            )}
          </div>
        </div>
        
        {/* Transcript Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-3xl mx-auto">
            <div className="prose prose-sm max-w-none">
              <div className="text-foreground leading-relaxed whitespace-pre-wrap text-base">
                {highlightedContent.map((segment, index) => {
                  if (!segment.highlight) {
                    return <span key={index}>{segment.text}</span>;
                  }
                  
                  // Check if this highlight should be visible based on filter
                  const isVisible = activeFilter === "all" || segment.highlight.type === activeFilter;
                  
                  if (!isVisible) {
                    return <span key={index}>{segment.text}</span>;
                  }
                  
                  return (
                    <span
                      key={index}
                      className={cn(
                        "relative inline px-1 py-0.5 rounded border-b-2 transition-all",
                        segment.highlight.color,
                        "hover:opacity-80 cursor-help"
                      )}
                      title={`${segment.highlight.category} - ${segment.highlight.type === "strength" ? "What's Working" : segment.highlight.type === "growth" ? "Growth Area" : "Lesson Phase Observation"}`}
                    >
                      {segment.text}
                      <span className="absolute -top-6 left-0 hidden group-hover:block bg-foreground text-background text-xs px-2 py-1 rounded whitespace-nowrap">
                        {segment.highlight.category}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 md:p-6 border-t border-border bg-muted/30">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              <strong>{visibleHighlights.length}</strong> highlighted sections found from your feedback
            </p>
            <Button onClick={onClose} variant="outline">
              Close Transcript
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
