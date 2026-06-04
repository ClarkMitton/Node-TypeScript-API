import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight, Loader2, UserX } from "lucide-react";
import { cn } from "@/lib/utils";

interface HighlightedName {
  id: string;
  name: string;
  startIndex: number;
  endIndex: number;
  replaced: boolean;
}

interface TranscriptEditorProps {
  transcript: string;
  highlightedNames: HighlightedName[];
  isLoading: boolean;
  onConfirm: (anonymizedTranscript: string) => void;
}

export function TranscriptEditor({
  transcript,
  highlightedNames,
  isLoading,
  onConfirm,
}: TranscriptEditorProps) {
  const [names, setNames] = useState<HighlightedName[]>(highlightedNames);
  const [editedTranscript, setEditedTranscript] = useState(transcript);

  // Sync transcript when prop changes (e.g., after transcription completes)
  useEffect(() => {
    if (transcript && transcript !== editedTranscript) {
      setEditedTranscript(transcript);
    }
  }, [transcript]);

  // Sync highlighted names when prop changes
  useEffect(() => {
    if (highlightedNames.length > 0) {
      setNames(highlightedNames);
    }
  }, [highlightedNames]);

  const handleReplaceAll = useCallback(() => {
    let newTranscript = editedTranscript;
    const sortedNames = [...names]
      .filter((n) => !n.replaced)
      .sort((a, b) => b.startIndex - a.startIndex);

    sortedNames.forEach((name) => {
      newTranscript =
        newTranscript.slice(0, name.startIndex) +
        "Student" +
        newTranscript.slice(name.endIndex);
    });

    setEditedTranscript(newTranscript);
    setNames((prev) => prev.map((n) => ({ ...n, replaced: true })));
  }, [editedTranscript, names]);

  const handleReplaceSingle = useCallback((id: string) => {
    const name = names.find((n) => n.id === id);
    if (!name || name.replaced) return;

    // Calculate position adjustment based on previously replaced names
    let offset = 0;
    names.forEach((n) => {
      if (n.replaced && n.startIndex < name.startIndex) {
        offset += "Student".length - n.name.length;
      }
    });

    const adjustedStart = name.startIndex + offset;
    const adjustedEnd = name.endIndex + offset;

    const newTranscript =
      editedTranscript.slice(0, adjustedStart) +
      "Student" +
      editedTranscript.slice(adjustedEnd);

    setEditedTranscript(newTranscript);
    setNames((prev) =>
      prev.map((n) => (n.id === id ? { ...n, replaced: true } : n))
    );
  }, [editedTranscript, names]);

  const unreplacedCount = names.filter((n) => !n.replaced).length;

  const renderTranscriptWithHighlights = () => {
    if (names.length === 0 || names.every((n) => n.replaced)) {
      return <p className="whitespace-pre-wrap leading-relaxed">{editedTranscript}</p>;
    }

    const sortedNames = [...names]
      .filter((n) => !n.replaced)
      .sort((a, b) => a.startIndex - b.startIndex);

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    sortedNames.forEach((name, index) => {
      // Add text before this name
      if (name.startIndex > lastIndex) {
        parts.push(
          <span key={`text-${index}`}>
            {editedTranscript.slice(lastIndex, name.startIndex)}
          </span>
        );
      }

      // Add highlighted name
      parts.push(
        <button
          key={name.id}
          onClick={() => handleReplaceSingle(name.id)}
          className="highlight-name inline-flex items-center gap-1 group"
          title="Click to replace with 'Student'"
        >
          {name.name}
          <UserX className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      );

      lastIndex = name.endIndex;
    });

    // Add remaining text
    if (lastIndex < editedTranscript.length) {
      parts.push(
        <span key="text-end">{editedTranscript.slice(lastIndex)}</span>
      );
    }

    return <p className="whitespace-pre-wrap leading-relaxed">{parts}</p>;
  };

  if (isLoading) {
    return (
      <div className="section-fade-in flex flex-col items-center justify-center py-16 space-y-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <div className="text-center space-y-2">
          <h3 className="text-xl font-semibold text-foreground">
            Transcribing Your Session
          </h3>
          <p className="text-muted-foreground">
            This may take a few minutes depending on the audio length...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="section-fade-in space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-heading font-semibold text-foreground">
          Review & Anonymize Transcript
        </h2>
        <p className="text-muted-foreground">
          Click on highlighted names to replace them with "Student" for privacy
        </p>
      </div>

      {/* Action Bar */}
      {unreplacedCount > 0 && (
        <div className="bg-accent-soft border border-accent/20 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-foreground">
            <strong>{unreplacedCount}</strong> potential name{unreplacedCount > 1 ? "s" : ""} detected
          </p>
          <Button onClick={handleReplaceAll} variant="accent" size="sm">
            <UserX className="w-4 h-4" />
            Replace All Names
          </Button>
        </div>
      )}

      {/* Transcript Display */}
      <div className="card-elevated p-6 max-h-[400px] overflow-y-auto">
        <div className="prose prose-sm max-w-none text-foreground">
          {renderTranscriptWithHighlights()}
        </div>
      </div>

      {/* Confirm Button */}
      <div className="flex justify-center">
        <Button onClick={() => onConfirm(editedTranscript)} size="lg" className="group">
          <Check className="w-5 h-5" />
          Confirm Anonymized Transcript
          <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
        </Button>
      </div>

      {/* Info */}
      <div className="bg-muted rounded-lg p-4 text-center">
        <p className="text-sm text-muted-foreground">
          <strong>Note:</strong> The original audio file will be deleted after you confirm. 
          Only the anonymized transcript will be used for analysis.
        </p>
      </div>
    </div>
  );
}
