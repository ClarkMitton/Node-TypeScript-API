import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: number;
  label: string;
  shortLabel: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

export function StepIndicator({ steps, currentStep, className }: StepIndicatorProps) {
  return (
    <nav aria-label="Progress" className={cn("w-full", className)}>
      <ol className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isComplete = step.id < currentStep;
          const isActive = step.id === currentStep;
          const isPending = step.id > currentStep;

          return (
            <li key={step.id} className="flex-1 flex items-center">
              <div className="flex flex-col items-center w-full">
                <div className="flex items-center w-full">
                  {index > 0 && (
                    <div
                      className={cn(
                        "flex-1 h-1 mx-2 rounded-full transition-colors duration-300",
                        isComplete || isActive ? "bg-success" : "bg-step-pending"
                      )}
                    />
                  )}
                  
                  <div
                    className={cn(
                      "step-indicator flex-shrink-0",
                      isComplete && "step-complete",
                      isActive && "step-active",
                      isPending && "step-pending"
                    )}
                    aria-current={isActive ? "step" : undefined}
                  >
                    {isComplete ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      step.id
                    )}
                  </div>

                  {index < steps.length - 1 && (
                    <div
                      className={cn(
                        "flex-1 h-1 mx-2 rounded-full transition-colors duration-300",
                        isComplete ? "bg-success" : "bg-step-pending"
                      )}
                    />
                  )}
                </div>

                <span
                  className={cn(
                    "mt-2 text-xs font-medium text-center transition-colors hidden sm:block",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
                <span
                  className={cn(
                    "mt-2 text-xs font-medium text-center transition-colors sm:hidden",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {step.shortLabel}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
