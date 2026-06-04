import { useState, useEffect, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectedPhase = "full" | "launch" | "establish" | "apply" | "demonstrate";

interface PhaseSelectorProps {
  onConfirm: (selectedPhases: SelectedPhase[]) => void;
  isLoading: boolean;
}

const phases = [
  {
    id: "full" as const,
    label: "Full Lesson",
    description: "Get feedback on all phases of your lesson",
    icon: "🎯",
  },
  {
    id: "launch" as const,
    label: "Launch Phase",
    description: "Opening hook, learning intentions, prior knowledge",
    icon: "🚀",
  },
  {
    id: "establish" as const,
    label: "Establish Phase",
    description: "Direct instruction, modeling, guided practice",
    icon: "📚",
  },
  {
    id: "apply" as const,
    label: "Apply Phase",
    description: "Independent practice, differentiated tasks",
    icon: "✏️",
  },
  {
    id: "demonstrate" as const,
    label: "Demonstrate Phase",
    description: "Assessment, student demonstrations, plenaries",
    icon: "🎤",
  },
];

export const PhaseSelector = forwardRef<HTMLDivElement, PhaseSelectorProps>(({ onConfirm, isLoading }, ref) => {
  const [selected, setSelected] = useState<SelectedPhase[]>([]);

  const handleToggle = (phaseId: SelectedPhase) => {
    if (phaseId === "full") {
      // If clicking full, toggle between all selected and none
      if (selected.includes("full")) {
        setSelected([]);
      } else {
        setSelected(["full"]);
      }
    } else {
      // If clicking individual phase
      setSelected((prev) => {
        // Remove "full" if it was selected
        const withoutFull = prev.filter((p) => p !== "full");
        
        if (withoutFull.includes(phaseId)) {
          return withoutFull.filter((p) => p !== phaseId);
        } else {
          return [...withoutFull, phaseId];
        }
      });
    }
  };

  // Check if all individual phases are selected
  useEffect(() => {
    const individualPhases: SelectedPhase[] = ["launch", "establish", "apply", "demonstrate"];
    const allIndividualSelected = individualPhases.every((p) => selected.includes(p));
    
    if (allIndividualSelected && !selected.includes("full")) {
      setSelected(["full"]);
    }
  }, [selected]);

  const isSelected = (phaseId: SelectedPhase) => {
    if (phaseId === "full") {
      return selected.includes("full");
    }
    return selected.includes(phaseId) || selected.includes("full");
  };

  const canConfirm = selected.length > 0;

  if (isLoading) {
    return (
      <div className="section-fade-in flex flex-col items-center justify-center py-16 space-y-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <div className="text-center space-y-2">
          <h3 className="text-xl font-semibold text-foreground">
            Analyzing Your Session
          </h3>
          <p className="text-muted-foreground max-w-md">
            The AI is reviewing your transcript using the STAR framework...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="section-fade-in space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-heading font-semibold text-foreground">
          Select Lesson Phases
        </h2>
        <p className="text-muted-foreground">
          Choose which phases you want feedback on, or select "Full Lesson" for complete feedback
        </p>
      </div>

      <div className="space-y-3">
        {phases.map((phase) => (
          <button
            key={phase.id}
            onClick={() => handleToggle(phase.id)}
            className={cn(
              "w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-all text-left",
              isSelected(phase.id)
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-secondary/50"
            )}
          >
            <span className="text-2xl">{phase.icon}</span>
            <div className="flex-1">
              <p className="font-medium text-foreground">{phase.label}</p>
              <p className="text-sm text-muted-foreground">{phase.description}</p>
            </div>
            <div
              className={cn(
                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                isSelected(phase.id)
                  ? "bg-primary border-primary"
                  : "border-muted-foreground"
              )}
            >
              {isSelected(phase.id) && (
                <Check className="w-4 h-4 text-primary-foreground" />
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="flex justify-center pt-4">
        <Button
          onClick={() => onConfirm(selected)}
          size="lg"
          disabled={!canConfirm}
          className="group"
        >
          Generate Feedback
          <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
        </Button>
      </div>
    </div>
  );
});

PhaseSelector.displayName = "PhaseSelector";
