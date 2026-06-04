import { useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Download, RotateCcw, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComparisonData, ITTECFEvidence } from "./SessionCompare";

interface ComparisonReportProps {
  result: ComparisonData;
  onReset: () => void;
}

interface Section {
  key: keyof ComparisonData;
  icon: string;
  title: string;
  color: string;
  borderColor: string;
  bgColor: string;
  iconBg: string;
}

const SECTIONS: Section[] = [
  {
    key: "embedding",
    icon: "🔒",
    title: "Becoming Part of Your Practice",
    color: "text-emerald-700",
    borderColor: "border-emerald-500/30",
    bgColor: "bg-emerald-500/5",
    iconBg: "bg-emerald-500/10",
  },
  {
    key: "growth",
    icon: "↑",
    title: "New Growth Since Your Last Session",
    color: "text-blue-700",
    borderColor: "border-blue-500/30",
    bgColor: "bg-blue-500/5",
    iconBg: "bg-blue-500/10",
  },
  {
    key: "resolved",
    icon: "✓",
    title: "Patterns That Appear to Have Shifted",
    color: "text-purple-700",
    borderColor: "border-purple-500/30",
    bgColor: "bg-purple-500/5",
    iconBg: "bg-purple-500/10",
  },
  {
    key: "persistent",
    icon: "🔄",
    title: "Your Continued Development Focus",
    color: "text-amber-700",
    borderColor: "border-amber-500/30",
    bgColor: "bg-amber-500/5",
    iconBg: "bg-amber-500/10",
  },
  {
    key: "standardEnglishTrajectory",
    icon: "📖",
    title: "Standard English Trajectory",
    color: "text-indigo-700",
    borderColor: "border-indigo-500/30",
    bgColor: "bg-indigo-500/5",
    iconBg: "bg-indigo-500/10",
  },
];

function ITTECFTable({ evidence }: { evidence: ITTECFEvidence[] }) {
  if (!evidence || evidence.length === 0) return null;

  return (
    <div className="card-elevated p-6 border border-border space-y-4">
      <div className="space-y-1">
        <h3 className="font-semibold text-lg text-foreground">ITTECF Standards Evidenced</h3>
        <p className="text-sm text-muted-foreground">Standards observed across your two sessions</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Standard</th>
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Indicator</th>
              <th className="text-center py-2 px-3 font-medium text-muted-foreground">Session 1</th>
              <th className="text-center py-2 px-3 font-medium text-muted-foreground">Session 2</th>
            </tr>
          </thead>
          <tbody>
            {evidence.map((row, i) => (
              <tr key={i} className="border-b border-border/50 last:border-0">
                <td className="py-2.5 pr-4 font-mono text-xs font-semibold text-foreground whitespace-nowrap">
                  {row.standard}
                </td>
                <td className="py-2.5 pr-4 text-foreground">{row.title}</td>
                <td className="py-2.5 px-3 text-center">
                  {row.sessionA ? (
                    <span className="text-emerald-600 font-bold">✓</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-center">
                  {row.sessionB ? (
                    <span className="text-emerald-600 font-bold">✓</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground italic">
        Standards shown as evidenced were observed in your transcript. Absence does not mean a standard wasn't met — it may simply not have been captured in this recording.
      </p>
    </div>
  );
}

function FocusCallout({ text }: { text: string }) {
  return (
    <div className="border-l-4 border-primary bg-primary/5 rounded-r-xl p-5 space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-lg">🎯</span>
        <h3 className="font-semibold text-foreground">Focus for Next Session</h3>
      </div>
      <p className="text-foreground text-sm sm:text-base leading-relaxed">{text}</p>
    </div>
  );
}

export function ComparisonReport({ result, onReset }: ComparisonReportProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const getSectionContent = (key: keyof ComparisonData): string | null => {
    if (key === "sessionA" || key === "sessionB" || key === "ittecfEvidence" || key === "focusForNextSession") return null;
    const value = result[key];
    if (!value || typeof value !== "string") return null;
    return value;
  };

  const visibleSections = SECTIONS.filter((s) => getSectionContent(s.key) !== null);

  const handleDownloadHtml = useCallback(async () => {
    if (!containerRef.current) return;

    const timestamp = Date.now();
    const safeJson = JSON.stringify({ ...result, _generatedAt: timestamp }).replace(/<\/script>/gi, "<\\/script>");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>PowerED Teaching Journey Report</title>
  <script type="application/json" id="powered-comparison-data">${safeJson}<\/script>
</head>
<body>
${containerRef.current.innerHTML}
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `powered-journey-${timestamp}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const handleDownloadPdf = useCallback(async () => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const timestamp = Date.now();
    const prevBg = container.style.backgroundColor;
    const prevOpacity = container.style.opacity;
    const prevAnimation = container.style.animation;
    const prevTransform = container.style.transform;
    container.style.backgroundColor = "#ffffff";
    // Neutralise the fade-in animation so the capture isn't translucent
    container.style.animation = "none";
    container.style.opacity = "1";
    container.style.transform = "none";
    // Allow a frame so styles apply before html2canvas snapshots
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const html2pdf = ((await import("html2pdf.js")) as any).default;
      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: `powered-journey-${timestamp}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"], avoid: [".card-elevated", ".pdf-avoid-break"] },
        })
        .from(container)
        .save();
    } finally {
      container.style.backgroundColor = prevBg;
      container.style.opacity = prevOpacity;
      container.style.animation = prevAnimation;
      container.style.transform = prevTransform;
    }
  }, []);

  return (
    <div ref={containerRef} className="section-fade-in space-y-8">
      {/* Header */}
      <div className="text-center space-y-4 py-4">
        <div className="inline-flex items-center gap-2 text-success bg-success/10 px-4 py-2 rounded-full">
          <span className="text-lg">↑</span>
          <span className="font-medium">Journey Analysis Complete</span>
        </div>
        <h2 className="text-3xl font-heading font-semibold text-foreground">
          Your Teaching Journey
        </h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          A reflection across two sessions
        </p>
      </div>

      {/* Session MVP side-by-side intro */}
      <div className="card-elevated p-6 bg-gradient-to-r from-primary/5 via-background to-accent/5 border-primary/20">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center mb-4">
          Your sessions at a glance
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-background rounded-xl border border-border space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Session 1 (Earlier)</p>
            <p className="text-sm font-semibold text-foreground">{result.sessionA.mvpMoment}</p>
          </div>
          <div className="flex items-center justify-center sm:hidden">
            <span className="text-muted-foreground text-xl">↓</span>
          </div>
          <div className="p-4 bg-primary/5 rounded-xl border border-primary/20 space-y-1">
            <p className="text-xs text-primary font-medium">Session 2 (Later)</p>
            <p className="text-sm font-semibold text-foreground">{result.sessionB.mvpMoment}</p>
          </div>
        </div>
      </div>

      {/* ITTECF Evidence Table */}
      {result.ittecfEvidence && result.ittecfEvidence.length > 0 && (
        <ITTECFTable evidence={result.ittecfEvidence} />
      )}

      {/* Comparison sections */}
      {visibleSections.length > 0 ? (
        <div className="space-y-4">
          {visibleSections.map((section) => {
            const content = getSectionContent(section.key);
            if (!content) return null;
            return (
              <div
                key={section.key}
                className={cn(
                  "card-elevated p-6 border",
                  section.bgColor,
                  section.borderColor
                )}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-lg",
                      section.iconBg
                    )}
                  >
                    {section.icon}
                  </div>
                  <div className="flex-1 space-y-2">
                    <h3 className={cn("font-semibold text-base", section.color)}>
                      {section.title}
                    </h3>
                    <p className="text-foreground leading-relaxed text-sm sm:text-base">
                      {content}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card-elevated p-8 text-center space-y-2">
          <p className="text-foreground font-medium">Comparison generated</p>
          <p className="text-muted-foreground text-sm">
            The AI found limited direct comparisons between these two sessions. This can happen when the sessions cover very different content or learner groups.
          </p>
        </div>
      )}

      {/* Focus for Next Session */}
      {result.focusForNextSession && (
        <FocusCallout text={result.focusForNextSession} />
      )}

      {/* Closing line */}
      <div className="bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 rounded-xl p-6 text-center space-y-2">
        <p className="text-foreground font-medium text-lg">
          Remember: progress in teaching is rarely linear. Every session is data.
        </p>
        <p className="text-muted-foreground text-sm">
          Use this reflection to inform your next steps — and then record another session to see how you continue to grow.
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
        <Button onClick={handleDownloadPdf} size="lg" className="gap-2">
          <FileDown className="w-5 h-5" />
          Download PDF
        </Button>
        <Button onClick={handleDownloadHtml} size="lg" variant="secondary" className="gap-2">
          <Download className="w-5 h-5" />
          Download HTML
        </Button>
        <Button onClick={onReset} variant="outline" size="lg" className="gap-2">
          <RotateCcw className="w-5 h-5" />
          Start New Analysis
        </Button>
      </div>

      {/* Privacy reminder */}
      <div className="bg-muted/50 rounded-lg p-4 text-center">
        <p className="text-sm text-muted-foreground">
          <strong>Privacy Note:</strong> No data has been stored. All session data will be cleared when you close this browser tab.
        </p>
      </div>
    </div>
  );
}
