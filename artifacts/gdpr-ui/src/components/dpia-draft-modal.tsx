import { useEffect, useRef, useState } from "react";
import { Loader2, X, Copy, FileDown, CheckCircle2, ClipboardList, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMarkdown } from "@/components/chat-markdown";
import { API_BASE } from "@/lib/api-base";

interface DPIADraftModalProps {
  scanId: number;
  repoName: string;
  onClose: () => void;
}

export function DPIADraftModal({ scanId, repoName, onClose }: DPIADraftModalProps) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/scans/${scanId}/dpia-draft`, { method: "POST" });
        const body = (await res.json().catch(() => null)) as { markdown?: string; error?: string } | null;
        if (cancelled) return;
        if (!res.ok || !body?.markdown) {
          setError(body?.error ?? "The draft could not be generated. Please try again in a moment.");
          return;
        }
        setMarkdown(body.markdown);
      } catch {
        if (!cancelled) setError("Couldn't reach the server. Check your connection and try again.");
      }
    })();
    return () => { cancelled = true; };
  }, [scanId]);

  async function copyMarkdown() {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  }

  // Word opens HTML saved as .doc — reuse the rendered HTML so the downloaded
  // document matches what's on screen, with a print-friendly light theme.
  function downloadDoc() {
    const html = contentRef.current?.innerHTML;
    if (!html) return;
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>DPIA draft — ${repoName}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; color: #1a1a1a; line-height: 1.45; max-width: 800px; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
  th, td { border: 1px solid #888; padding: 4pt 6pt; text-align: left; vertical-align: top; font-size: 10pt; }
  th { background: #f0f0f0; }
  code, pre { font-family: Consolas, monospace; background: #f5f5f5; }
</style></head><body>${html}</body></html>`;
    const blob = new Blob([doc], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DPIA-draft-${repoName.replace(/[^a-z0-9-]/gi, "_")}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#0d1117] border border-[#30363d] rounded-lg w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-[#21262d] flex items-center gap-2.5 shrink-0">
          <ClipboardList className="h-4 w-4 text-[#bc8cff]" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#e6edf3]">DPIA draft — {repoName}</p>
            <p className="text-[10px] text-[#8b949e]">
              Pre-filled from the scan and your answers. Review every section with your DPO before sign-off.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {markdown && (
              <>
                <Button size="sm" variant="ghost" onClick={() => void copyMarkdown()} className="text-[#8b949e] hover:text-[#e6edf3] gap-1.5 h-8">
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-[#3fb950]" /> : <Copy className="h-3.5 w-3.5" />}
                  <span className="text-xs">{copied ? "Copied" : "Copy"}</span>
                </Button>
                <Button size="sm" onClick={downloadDoc} className="bg-[#1f6feb] hover:bg-[#388bfd] text-white gap-1.5 h-8">
                  <FileDown className="h-3.5 w-3.5" />
                  <span className="text-xs">Download for Word</span>
                </Button>
              </>
            )}
            <button onClick={onClose} className="text-[#8b949e] hover:text-[#e6edf3]">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!markdown && !error && (
            <div className="py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#bc8cff] mx-auto mb-3" />
              <p className="text-sm text-[#c9d1d9]">Drafting your DPIA…</p>
              <p className="text-xs text-[#8b949e] mt-1">
                Filling the screening questions and the seven ICO steps from your scan. This can take up to a minute.
              </p>
            </div>
          )}
          {error && (
            <div className="py-16 text-center">
              <AlertCircle className="h-8 w-8 text-[#f97583] mx-auto mb-3" />
              <p className="text-sm text-[#f97583]">{error}</p>
            </div>
          )}
          {markdown && (
            <div ref={contentRef}>
              <ChatMarkdown content={markdown} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
