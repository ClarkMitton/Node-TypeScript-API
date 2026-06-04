import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetScan, getGetScanQueryKey, useDeleteScan, getListScansQueryKey, getGetScanStatsQueryKey } from "@workspace/api-client-react";
import { RiskBadge } from "@/components/risk-badge";
import { ScoreGauge } from "@/components/score-gauge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Trash2, Github, AlertCircle, CheckCircle2, ShieldAlert, ArrowRight, Info } from "lucide-react";
import { Link } from "wouter";

// ─── Local types for new fields ───────────────────────────────────────────────

type Finding = {
  type: string;
  category: string;
  file: string;
  line?: number | null;
  evidence: string;
  riskScore: number;
  confidence?: number;
  isVerifiedFlow?: boolean;
  flowDescription?: string;
  tags?: string[];
};

type Dep = { name: string; category: string; gdprRelevance: number };

type VerifiedFlow = {
  source: string;
  sink: string;
  file: string;
  line: number;
  evidence: string;
  dataType: string;
  confidence: number;
  tags: string[];
};

type AuditCard = {
  title: string;
  riskLevel: string;
  confidence: number;
  flow: string;
  evidence: { file: string; line: number; code: string };
  whyItMatters: string;
  whyThisWasFlagged: string[];
  whatIsNOTTrue: string[];
  tags: string[];
};

type AuditSummary = {
  repo: string;
  overallRisk: string;
  confidence: number;
  verifiedFlowCount: number;
  externalTransferCount: number;
  storageCount: number;
  loggingCount: number;
  potentialPatternCount: number;
  conclusion: string;
  nonFindings: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  HIGH: "#f97583",
  MEDIUM: "#e3b341",
  LOW: "#3fb950",
  INSUFFICIENT_EVIDENCE: "#8b949e",
};

const DATA_TYPE_COLORS: Record<string, string> = {
  IDENTIFIABLE: "#f97583",
  BEHAVIOURAL: "#e3b341",
  TECHNICAL: "#bc8cff",
  UNKNOWN: "#8b949e",
};

const CATEGORY_COLORS: Record<string, string> = {
  "external-transfer": "#58a6ff",
  persistence: "#e3b341",
  identity: "#f97583",
  logging: "#bc8cff",
  dependency: "#56d364",
  static: "#8b949e",
};

function confidencePct(c: number): string {
  return `${Math.round(c * 100)}%`;
}

// ─── Audit summary panel ──────────────────────────────────────────────────────

function AuditSummaryPanel({ summary }: { summary: AuditSummary }) {
  const isClean = summary.verifiedFlowCount === 0;
  const riskColor = RISK_COLORS[summary.overallRisk] ?? "#8b949e";

  return (
    <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-[#21262d] flex items-center justify-between">
        <h3 className="text-xs text-[#8b949e] uppercase tracking-widest font-medium">
          Audit Summary
        </h3>
        <span className="text-xs font-medium" style={{ color: riskColor }}>
          {summary.overallRisk.replace("_", " ")}
        </span>
      </div>

      {/* Conclusion */}
      <div className="px-5 py-4 border-b border-[#21262d]">
        <div className="flex items-start gap-2.5">
          {isClean ? (
            <CheckCircle2 className="h-4 w-4 text-[#3fb950] shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" style={{ color: riskColor }} />
          )}
          <p className="text-sm text-[#c9d1d9] leading-relaxed">{summary.conclusion}</p>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-4 divide-x divide-[#21262d]">
        {[
          { label: "Verified Flows", value: summary.verifiedFlowCount, highlight: summary.verifiedFlowCount > 0 },
          { label: "External Transfers", value: summary.externalTransferCount, highlight: summary.externalTransferCount > 0 },
          { label: "Storage Flows", value: summary.storageCount, highlight: summary.storageCount > 0 },
          { label: "Potential Patterns", value: summary.potentialPatternCount, highlight: false },
        ].map(({ label, value, highlight }) => (
          <div key={label} className="px-4 py-3 text-center">
            <p
              className="text-xl font-semibold"
              style={{ color: highlight ? riskColor : "#e6edf3" }}
            >
              {value}
            </p>
            <p className="text-[10px] text-[#484f58] uppercase tracking-wider mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Non-findings */}
      {summary.nonFindings.length > 0 && (
        <div className="px-5 py-4 border-t border-[#21262d]">
          <p className="text-[10px] text-[#484f58] uppercase tracking-widest mb-2 font-medium">
            Explicit Non-Findings
          </p>
          <ul className="space-y-1">
            {summary.nonFindings.map((nf, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-[#8b949e]">
                <span className="h-1 w-1 rounded-full bg-[#3fb950] shrink-0" />
                {nf}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Audit card ───────────────────────────────────────────────────────────────

function AuditCardPanel({ card }: { card: AuditCard }) {
  const riskColor = RISK_COLORS[card.riskLevel] ?? "#8b949e";

  return (
    <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#21262d] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" style={{ color: riskColor }} />
          <span className="text-sm font-medium text-[#e6edf3] truncate">{card.title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-[#484f58]">
            {confidencePct(card.confidence)} conf.
          </span>
          <span className="text-[10px] font-medium uppercase" style={{ color: riskColor }}>
            {card.riskLevel}
          </span>
        </div>
      </div>

      {/* Flow chain */}
      <div className="px-4 py-3 border-b border-[#21262d] bg-[#0d1117]">
        <div className="flex items-center gap-2 font-mono text-xs flex-wrap">
          {card.flow.split(" → ").map((part, i, arr) => (
            <span key={i} className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-[#161b22] text-[#c9d1d9] border border-[#30363d]">
                {part}
              </span>
              {i < arr.length - 1 && (
                <ArrowRight className="h-3 w-3 text-[#484f58]" />
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Evidence */}
      <div className="px-4 py-3 border-b border-[#21262d]">
        <p className="text-[10px] text-[#484f58] uppercase tracking-widest mb-1.5">Evidence</p>
        <p className="text-xs text-[#6e7681] font-mono mb-1">
          {card.evidence.file}:{card.evidence.line}
        </p>
        <p className="text-xs font-mono bg-[#0d1117] text-[#e6edf3] px-3 py-2 rounded border border-[#21262d] truncate">
          {card.evidence.code}
        </p>
      </div>

      {/* Why it matters */}
      <div className="px-4 py-3 border-b border-[#21262d]">
        <p className="text-[10px] text-[#484f58] uppercase tracking-widest mb-1.5">Why it matters</p>
        <p className="text-xs text-[#8b949e] leading-relaxed">{card.whyItMatters}</p>
      </div>

      {/* Two-column: flagged reasons + not true */}
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#21262d]">
        <div className="px-4 py-3">
          <p className="text-[10px] text-[#484f58] uppercase tracking-widest mb-1.5">Why flagged</p>
          <ul className="space-y-1">
            {card.whyThisWasFlagged.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-[#8b949e]">
                <span className="h-1 w-1 rounded-full bg-[#e3b341] mt-1.5 shrink-0" />
                {r}
              </li>
            ))}
          </ul>
        </div>
        <div className="px-4 py-3">
          <p className="text-[10px] text-[#484f58] uppercase tracking-widest mb-1.5">What is NOT true</p>
          <ul className="space-y-1">
            {card.whatIsNOTTrue.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-[#8b949e]">
                <span className="h-1 w-1 rounded-full bg-[#3fb950] mt-1.5 shrink-0" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Potential patterns (old-style findings, not verified flows) ───────────────

function PotentialPatterns({ findings }: { findings: Finding[] }) {
  const potential = findings.filter((f) => !f.isVerifiedFlow);
  if (potential.length === 0) return null;

  return (
    <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-[#21262d] flex items-center gap-2">
        <Info className="h-3.5 w-3.5 text-[#484f58]" />
        <h3 className="text-xs text-[#8b949e] uppercase tracking-widest font-medium">
          Capability Patterns ({potential.length}) — Not Verified Flows
        </h3>
      </div>
      <div className="px-4 py-2.5 bg-[#0d1117] border-b border-[#21262d]">
        <p className="text-xs text-[#484f58]">
          These patterns indicate capability (a library or API is present) but no direct user input → sink flow was proven. They do not contribute to the GDPR risk score.
        </p>
      </div>
      <div className="divide-y divide-[#21262d] max-h-72 overflow-auto">
        {potential.sort((a, b) => b.riskScore - a.riskScore).map((f, i) => (
          <div key={i} className="px-4 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="text-[10px] font-medium uppercase tracking-wider shrink-0"
                  style={{ color: CATEGORY_COLORS[f.category] ?? "#8b949e" }}
                >
                  {f.category}
                </span>
                <span className="text-xs text-[#6e7681] font-mono truncate">{f.type}</span>
              </div>
              <span className="text-[10px] text-[#484f58] shrink-0">
                {f.confidence != null ? `${confidencePct(f.confidence)} conf.` : "capability"}
              </span>
            </div>
            <p className="text-xs text-[#484f58] font-mono mt-0.5">
              {f.file}{f.line != null ? `:${f.line}` : ""}
            </p>
            <p className="text-xs font-mono bg-[#0d1117] text-[#6e7681] px-2 py-1 rounded mt-1 truncate">
              {f.evidence}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ScanDetail() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0", 10);
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const { data: scanBase, isLoading, refetch } = useGetScan(id, {
    query: { enabled: !!id, queryKey: getGetScanQueryKey(id) },
  });

  // The API returns extra fields beyond the Zod schema — cast to access them
  const scan = scanBase as (typeof scanBase & {
    verifiedFlows?: VerifiedFlow[];
    auditCards?: AuditCard[];
    auditSummary?: AuditSummary;
  }) | undefined;

  const deleteScan = useDeleteScan();

  // Poll while pending/running
  useEffect(() => {
    if (!scan || scan.status === "done" || scan.status === "failed") return;
    const interval = setInterval(() => { void refetch(); }, 2000);
    return () => clearInterval(interval);
  }, [scan?.status, refetch]);

  function handleDelete() {
    if (!confirm("Delete this scan?")) return;
    deleteScan.mutate({ id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListScansQueryKey() });
        qc.invalidateQueries({ queryKey: getGetScanStatsQueryKey() });
        setLocation("/");
      },
    });
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48 bg-[#161b22]" />
        <Skeleton className="h-40 bg-[#161b22]" />
        <Skeleton className="h-64 bg-[#161b22]" />
      </div>
    );
  }

  if (!scan) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-20">
        <AlertCircle className="h-8 w-8 text-[#f97583] mx-auto mb-3" />
        <p className="text-[#8b949e]">Scan not found.</p>
        <Link href="/" className="text-[#58a6ff] text-sm mt-2 inline-block hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const findings = (scan.findings ?? []) as Finding[];
  const deps = (scan.dependencies ?? []) as Dep[];
  const verifiedFlows = scan.verifiedFlows ?? [];
  const auditCards = scan.auditCards ?? [];
  const auditSummary = scan.auditSummary ?? null;
  const isPending = scan.status === "pending" || scan.status === "running";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-[#8b949e] hover:text-[#c9d1d9] transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Github className="h-4 w-4 text-[#484f58]" />
              <h1 className="text-base font-semibold text-[#e6edf3]">{scan.repoName}</h1>
            </div>
            <a
              href={scan.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#484f58] hover:text-[#58a6ff] transition-colors"
            >
              {scan.githubUrl}
            </a>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={deleteScan.isPending}
          className="text-[#8b949e] hover:text-[#f97583] hover:bg-[#3d1a1a]/50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Pending state */}
      {isPending && (
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg px-5 py-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#58a6ff] mx-auto mb-3" />
          <p className="text-sm text-[#c9d1d9] font-medium">Scanning repository…</p>
          <p className="text-xs text-[#8b949e] mt-1">
            Downloading, flow-matching, and scoring. This may take up to 60 seconds.
          </p>
        </div>
      )}

      {/* Failed state */}
      {scan.status === "failed" && (
        <div className="bg-[#3d1a1a] border border-[#f97583]/30 rounded-lg px-5 py-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-[#f97583] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-[#f97583] font-medium">Scan failed</p>
              {scan.error && (
                <p className="text-xs text-[#f97583]/70 mt-1 font-mono">{scan.error}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {scan.status === "done" && (
        <>
          {/* Score + metadata */}
          <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-5 flex flex-col sm:flex-row items-center gap-6">
            <ScoreGauge score={scan.gdprScore ?? 0} />
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[#484f58] uppercase tracking-widest">Risk Level</p>
                <div className="mt-1.5">
                  <RiskBadge level={scan.riskLevel} />
                </div>
              </div>
              <div>
                <p className="text-xs text-[#484f58] uppercase tracking-widest">Verified Flows</p>
                <p className="text-lg font-semibold mt-1" style={{ color: verifiedFlows.length > 0 ? "#f97583" : "#3fb950" }}>
                  {verifiedFlows.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#484f58] uppercase tracking-widest">Scanned</p>
                <p className="text-sm text-[#8b949e] mt-1">
                  {scan.completedAt ? new Date(scan.completedAt).toLocaleString() : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#484f58] uppercase tracking-widest">Dependencies</p>
                <p className="text-lg font-semibold text-[#e6edf3] mt-1">{deps.length}</p>
              </div>
            </div>
          </div>

          {/* Audit summary */}
          {auditSummary && <AuditSummaryPanel summary={auditSummary} />}

          {/* Verified flow audit cards */}
          {auditCards.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xs text-[#8b949e] uppercase tracking-widest font-medium px-1">
                Verified Data Flows ({auditCards.length})
              </h3>
              {auditCards.map((card, i) => (
                <AuditCardPanel key={i} card={card} />
              ))}
            </div>
          )}

          {/* Verified flow quick list (if no audit cards but flows exist — shouldn't happen) */}
          {verifiedFlows.length > 0 && auditCards.length === 0 && (
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-[#21262d]">
                <h3 className="text-xs text-[#8b949e] uppercase tracking-widest font-medium">
                  Verified Data Flows
                </h3>
              </div>
              <div className="divide-y divide-[#21262d]">
                {verifiedFlows.map((flow, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-mono mb-1">
                      <span className="text-[#c9d1d9]">{flow.source}</span>
                      <ArrowRight className="h-3 w-3 text-[#484f58]" />
                      <span className="text-[#c9d1d9]">{flow.sink}</span>
                      <span
                        className="ml-auto text-[10px] font-medium uppercase"
                        style={{ color: DATA_TYPE_COLORS[flow.dataType] ?? "#8b949e" }}
                      >
                        {flow.dataType}
                      </span>
                    </div>
                    <p className="text-xs text-[#484f58] font-mono">{flow.file}:{flow.line}</p>
                    <p className="text-xs text-[#484f58]">Confidence: {confidencePct(flow.confidence)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GDPR-relevant dependencies */}
          {deps.length > 0 && (
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-[#21262d]">
                <h3 className="text-xs text-[#8b949e] uppercase tracking-widest font-medium">
                  GDPR-Relevant Dependencies
                </h3>
              </div>
              <div className="divide-y divide-[#21262d] max-h-48 overflow-auto">
                {deps.map((d, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <span className="text-sm font-mono text-[#c9d1d9]">{d.name}</span>
                      <span className="ml-2 text-xs text-[#484f58]">{d.category}</span>
                    </div>
                    <span
                      className="text-xs font-medium"
                      style={{ color: d.gdprRelevance >= 15 ? "#f97583" : d.gdprRelevance >= 10 ? "#e3b341" : "#3fb950" }}
                    >
                      {d.gdprRelevance}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Capability patterns (not verified flows) */}
          <PotentialPatterns findings={findings} />

          {/* All clean */}
          {auditCards.length === 0 && findings.length === 0 && (
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg px-6 py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-[#3fb950] mx-auto mb-3" />
              <p className="text-sm text-[#3fb950] font-medium">No verified GDPR data flows detected.</p>
              <p className="text-xs text-[#484f58] mt-1">
                No confirmed user input → data sink flows were found in this repository.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
