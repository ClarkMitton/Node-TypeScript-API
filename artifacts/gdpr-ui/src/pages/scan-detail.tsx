import { useEffect, useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetScan, getGetScanQueryKey, useDeleteScan, getListScansQueryKey, getGetScanStatsQueryKey, useCreateOpenaiConversation, getListOpenaiConversationsQueryKey } from "@workspace/api-client-react";
import { RiskBadge } from "@/components/risk-badge";
import { ScoreGauge } from "@/components/score-gauge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Trash2, Github, AlertCircle, CheckCircle2, ShieldAlert, ArrowRight, Info, FileText, Bot, Send, User, ClipboardList, AlertTriangle, Plus, X, ChevronDown, ChevronUp, Shield } from "lucide-react";
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

type DPOBadge = "NO_DATA_FOUND" | "CAPABILITY_ONLY" | "VERIFIED_FLOW" | "INCOMPLETE_FLOW";
type DPOColour = "GREEN" | "AMBER" | "RED";
type DPOActionType = "DPIA" | "CODE_CHANGE" | "POLICY" | "REVIEW";

type DPOFinding = {
  description: string;
  badge: DPOBadge;
  colour: DPOColour;
};

type DPOAction = {
  action: string;
  type: DPOActionType;
  priority: "HIGH" | "MEDIUM" | "LOW";
};

type DPOSummary = {
  overview: string;
  problems: DPOFinding[];
  workingWell: string[];
  actionItems: DPOAction[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  riskReason: string;
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
  dpoSummary?: DPOSummary;
};

type MitigationType =
  | "DPIA_COMPLETED"
  | "CONSENT_ADDED"
  | "DPA_IN_PLACE"
  | "DELETION_MECHANISM"
  | "PSEUDONYMISATION"
  | "ACCESS_RESTRICTED"
  | "OTHER";

type Mitigation = {
  id: number;
  scanId: number;
  flowKey: string;
  type: MitigationType;
  description: string;
  createdAt: string;
};

const MITIGATION_LABELS: Record<MitigationType, string> = {
  DPIA_COMPLETED:     "DPIA completed",
  CONSENT_ADDED:      "User consent added",
  DPA_IN_PLACE:       "Data Processing Agreement in place",
  DELETION_MECHANISM: "Right to erasure implemented",
  PSEUDONYMISATION:   "Data pseudonymised",
  ACCESS_RESTRICTED:  "Access controls added",
  OTHER:              "Other mitigation",
};

const MITIGATION_OPTIONS: { value: MitigationType; label: string; hint: string; reduction: number }[] = [
  { value: "DPIA_COMPLETED",     label: "DPIA completed",                       hint: "A formal Data Protection Impact Assessment has been completed for this flow",   reduction: 60 },
  { value: "CONSENT_ADDED",      label: "User consent added",                   hint: "Users explicitly agree before their data is collected or stored",               reduction: 50 },
  { value: "PSEUDONYMISATION",   label: "Data pseudonymised",                   hint: "Personal identifiers are replaced with anonymous codes before storage",         reduction: 50 },
  { value: "DPA_IN_PLACE",       label: "Data Processing Agreement in place",   hint: "A legal DPA with the data processor (e.g. Supabase) exists and is signed",     reduction: 40 },
  { value: "DELETION_MECHANISM", label: "Right to erasure implemented",         hint: "Users can request deletion of their personal data from within the app",         reduction: 30 },
  { value: "ACCESS_RESTRICTED",  label: "Access controls added",                hint: "Only authorised staff can access this data (role-based access, row security)",  reduction: 25 },
  { value: "OTHER",              label: "Other mitigation",                     hint: "Describe another control or safeguard you have applied",                        reduction: 20 },
];

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

// ─── DPO summary panel ────────────────────────────────────────────────────────

const BADGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  NO_DATA_FOUND:   { bg: "bg-[#1a2d1a]", text: "text-[#3fb950]", label: "NO DATA FOUND" },
  CAPABILITY_ONLY: { bg: "bg-[#2d2a1a]", text: "text-[#e3b341]", label: "CAPABILITY ONLY" },
  VERIFIED_FLOW:   { bg: "bg-[#2d1a1a]", text: "text-[#f97583]", label: "VERIFIED FLOW" },
  INCOMPLETE_FLOW: { bg: "bg-[#1a1f2d]", text: "text-[#58a6ff]", label: "INCOMPLETE FLOW" },
};

const DPO_COLOUR_ACCENT: Record<string, string> = {
  GREEN: "border-l-[#3fb950]",
  AMBER: "border-l-[#e3b341]",
  RED:   "border-l-[#f97583]",
};

const DPO_RISK_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  LOW:    { bg: "bg-[#1a2d1a]", text: "text-[#3fb950]",  border: "border-[#3fb950]/30" },
  MEDIUM: { bg: "bg-[#2d2a1a]", text: "text-[#e3b341]",  border: "border-[#e3b341]/30" },
  HIGH:   { bg: "bg-[#2d1a1a]", text: "text-[#f97583]",  border: "border-[#f97583]/30" },
};

const ACTION_STYLES: Record<DPOActionType, { bg: string; text: string; border: string; label: string; icon: string }> = {
  DPIA:        { bg: "bg-[#1a1f2d]", text: "text-[#58a6ff]", border: "border-[#58a6ff]/30", label: "DPIA NEEDED", icon: "📋" },
  CODE_CHANGE: { bg: "bg-[#2d2a1a]", text: "text-[#e3b341]", border: "border-[#e3b341]/30", label: "CODE CHANGE", icon: "🛠" },
  POLICY:      { bg: "bg-[#1a1a2d]", text: "text-[#bc8cff]", border: "border-[#bc8cff]/30", label: "POLICY",      icon: "📝" },
  REVIEW:      { bg: "bg-[#1a2828]", text: "text-[#56d364]", border: "border-[#56d364]/30", label: "REVIEW",      icon: "🔍" },
};

const PRIORITY_DOT: Record<string, string> = {
  HIGH:   "bg-[#f97583]",
  MEDIUM: "bg-[#e3b341]",
  LOW:    "bg-[#3fb950]",
};

function DPOSummaryPanel({ dpo }: { dpo: DPOSummary }) {
  const riskStyle = DPO_RISK_STYLES[dpo.riskLevel] ?? DPO_RISK_STYLES["LOW"]!;
  const hasProblems = dpo.problems.some((p) => p.colour !== "GREEN");

  return (
    <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-[#21262d] flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-[#484f58]" />
        <h3 className="text-xs text-[#8b949e] uppercase tracking-widest font-medium">
          GDPR Summary
        </h3>
        <span className="ml-auto text-[10px] text-[#484f58]">plain English</span>
      </div>

      {/* Overview */}
      <div className="px-5 py-4 border-b border-[#21262d]">
        <p className="text-sm text-[#c9d1d9] leading-relaxed">{dpo.overview}</p>
      </div>

      {/* Section 1 — Problems */}
      <div className="px-5 py-4 border-b border-[#21262d]">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-3.5 w-3.5 text-[#f97583]" />
          <p className="text-xs text-[#e6edf3] font-semibold uppercase tracking-wider">
            {hasProblems ? "What's the problem" : "What was found"}
          </p>
        </div>
        <div className="space-y-2">
          {dpo.problems.map((item, i) => {
            const badge = BADGE_STYLES[item.badge] ?? BADGE_STYLES["CAPABILITY_ONLY"]!;
            const accent = DPO_COLOUR_ACCENT[item.colour] ?? "";
            return (
              <div
                key={i}
                className={`flex items-start gap-3 bg-[#0d1117] rounded border-l-2 px-3 py-2.5 ${accent}`}
              >
                <span className={`shrink-0 mt-0.5 text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded ${badge.bg} ${badge.text}`}>
                  {badge.label}
                </span>
                <p className="text-xs text-[#c9d1d9] leading-relaxed">{item.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2 — What's working well */}
      {dpo.workingWell.length > 0 && (
        <div className="px-5 py-4 border-b border-[#21262d]">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#3fb950]" />
            <p className="text-xs text-[#e6edf3] font-semibold uppercase tracking-wider">
              What's working well
            </p>
          </div>
          <ul className="space-y-1.5">
            {dpo.workingWell.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[#8b949e]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#3fb950] shrink-0 mt-1.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Section 3 — What you need to do */}
      {dpo.actionItems.length > 0 && (
        <div className="px-5 py-4 border-b border-[#21262d]">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="h-3.5 w-3.5 text-[#58a6ff]" />
            <p className="text-xs text-[#e6edf3] font-semibold uppercase tracking-wider">
              What you need to do
            </p>
          </div>
          <div className="space-y-2.5">
            {dpo.actionItems.map((item, i) => {
              const style = ACTION_STYLES[item.type];
              return (
                <div key={i} className={`rounded border px-3.5 py-3 ${style.bg} ${style.border}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded border ${style.border} ${style.text}`}>
                      {style.label}
                    </span>
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${PRIORITY_DOT[item.priority]}`} title={`${item.priority} priority`} />
                  </div>
                  <p className="text-xs text-[#c9d1d9] leading-relaxed">{item.action}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom line risk */}
      <div className={`px-5 py-4 ${riskStyle.bg} border-t ${riskStyle.border}`}>
        <div className="flex items-start gap-3">
          <div className={`shrink-0 text-[10px] font-bold tracking-widest px-2 py-1 rounded border ${riskStyle.border} ${riskStyle.text}`}>
            {dpo.riskLevel} RISK
          </div>
          <p className="text-xs text-[#8b949e] leading-relaxed">{dpo.riskReason}</p>
        </div>
      </div>
    </div>
  );
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

interface AuditCardPanelProps {
  card: AuditCard;
  scanId: number;
  mitigations: Mitigation[];
  onRefresh: () => void;
}

function AuditCardPanel({ card, scanId, mitigations = [], onRefresh }: AuditCardPanelProps) {
  const flowKey = `${card.evidence.file}:${card.evidence.line}`;
  const riskColor = RISK_COLORS[card.riskLevel] ?? "#8b949e";
  const isMitigated = mitigations.length > 0;

  const [formOpen, setFormOpen] = useState(false);
  const [selType, setSelType] = useState<MitigationType>("DPIA_COMPLETED");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const selectedOption = MITIGATION_OPTIONS.find((o) => o.value === selType);

  async function saveMitigation() {
    if (!description.trim() || saving) return;
    setSaving(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      await fetch(`${base}/api/scans/${scanId}/mitigations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowKey, type: selType, description: description.trim() }),
      });
      setDescription("");
      setFormOpen(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function deleteMitigation(id: number) {
    setDeleting(id);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      await fetch(`${base}/api/scans/${scanId}/mitigations/${id}`, { method: "DELETE" });
      onRefresh();
    } finally {
      setDeleting(null);
    }
  }

  const borderColor = isMitigated ? "border-[#3fb950]/40" : "border-[#21262d]";

  return (
    <div className={`bg-[#161b22] border rounded-lg overflow-hidden ${borderColor}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#21262d] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {isMitigated
            ? <Shield className="h-3.5 w-3.5 shrink-0 text-[#3fb950]" />
            : <ShieldAlert className="h-3.5 w-3.5 shrink-0" style={{ color: riskColor }} />
          }
          <span className="text-sm font-medium text-[#e6edf3] truncate">{card.title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isMitigated && (
            <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#1a2d1a] text-[#3fb950] border border-[#3fb950]/30">
              MITIGATED
            </span>
          )}
          <span className="text-[10px] text-[#484f58]">{confidencePct(card.confidence)} conf.</span>
          <span className="text-[10px] font-medium uppercase" style={{ color: isMitigated ? "#3fb950" : riskColor }}>
            {card.riskLevel}
          </span>
        </div>
      </div>

      {/* Flow chain */}
      <div className="px-4 py-3 border-b border-[#21262d] bg-[#0d1117]">
        <div className="flex items-center gap-2 font-mono text-xs flex-wrap">
          {card.flow.split(" → ").map((part, i, arr) => (
            <span key={i} className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-[#161b22] text-[#c9d1d9] border border-[#30363d]">{part}</span>
              {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-[#484f58]" />}
            </span>
          ))}
        </div>
      </div>

      {/* Evidence */}
      <div className="px-4 py-3 border-b border-[#21262d]">
        <p className="text-[10px] text-[#484f58] uppercase tracking-widest mb-1.5">Evidence</p>
        <p className="text-xs text-[#6e7681] font-mono mb-1">{card.evidence.file}:{card.evidence.line}</p>
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

      {/* ── Mitigations section ── */}
      <div className="border-t border-[#21262d]">
        {/* Existing mitigations */}
        {isMitigated && (
          <div className="px-4 py-3 space-y-2 border-b border-[#21262d]">
            <p className="text-[10px] text-[#3fb950] uppercase tracking-widest font-medium mb-2">
              Controls applied — reduces risk score
            </p>
            {mitigations.map((m) => (
              <div key={m.id} className="flex items-start gap-2 bg-[#1a2d1a] border border-[#3fb950]/20 rounded px-3 py-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#3fb950] shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-[#3fb950] uppercase tracking-wider">
                    {MITIGATION_LABELS[m.type]}
                  </p>
                  <p className="text-xs text-[#8b949e] mt-0.5 leading-relaxed">{m.description}</p>
                </div>
                <button
                  onClick={() => void deleteMitigation(m.id)}
                  disabled={deleting === m.id}
                  className="shrink-0 text-[#484f58] hover:text-[#f97583] transition-colors"
                  title="Remove this mitigation"
                >
                  {deleting === m.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <X className="h-3 w-3" />
                  }
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add mitigation button / form */}
        {!formOpen ? (
          <button
            onClick={() => setFormOpen(true)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-[#484f58] hover:text-[#3fb950] hover:bg-[#1a2d1a]/50 transition-colors group"
          >
            <Plus className="h-3.5 w-3.5 group-hover:text-[#3fb950]" />
            <span>How will you reduce this risk?</span>
            <ChevronDown className="h-3 w-3 ml-auto" />
          </button>
        ) : (
          <div className="px-4 py-3 bg-[#0d1117] space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-[#e6edf3]">Add a control or safeguard</p>
              <button onClick={() => { setFormOpen(false); setDescription(""); }} className="text-[#484f58] hover:text-[#c9d1d9]">
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Type selector */}
            <div className="space-y-1">
              <label className="text-[10px] text-[#484f58] uppercase tracking-widest">Type of control</label>
              <select
                value={selType}
                onChange={(e) => setSelType(e.target.value as MitigationType)}
                className="w-full bg-[#161b22] border border-[#30363d] text-[#c9d1d9] text-xs rounded px-2 py-1.5 focus:outline-none focus:border-[#58a6ff]"
              >
                {MITIGATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label} (−{o.reduction}% risk)
                  </option>
                ))}
              </select>
              {selectedOption && (
                <p className="text-[10px] text-[#484f58] leading-relaxed">{selectedOption.hint}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="text-[10px] text-[#484f58] uppercase tracking-widest">
                Details — what specifically have you done?
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. DPIA completed on 1 June 2026, stored in our compliance folder. Reviewed by DPO."
                rows={3}
                className="w-full resize-none bg-[#161b22] border border-[#30363d] text-xs text-[#c9d1d9] rounded px-3 py-2 placeholder:text-[#484f58] focus:outline-none focus:border-[#3fb950]"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => void saveMitigation()}
                disabled={!description.trim() || saving}
                className="bg-[#1a4d1a] hover:bg-[#2d6b2d] border border-[#3fb950]/40 text-[#3fb950] text-xs h-7 px-3"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                Save control
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setFormOpen(false); setDescription(""); }}
                className="text-[#484f58] hover:text-[#c9d1d9] text-xs h-7 px-3"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Inline chat panel ────────────────────────────────────────────────────────

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface ScanChatPanelProps {
  scanId: number;
  repoName: string;
  riskLevel: string | null | undefined;
  verifiedFlowCount: number;
}

function ScanChatPanel({ scanId, repoName, riskLevel, verifiedFlowCount }: ScanChatPanelProps) {
  const qc = useQueryClient();
  const createConv = useCreateOpenaiConversation();
  const storageKey = `scan-chat-conv-${scanId}`;

  const [convId, setConvId] = useState<number | null>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? parseInt(saved, 10) : null;
  });
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const riskWord = riskLevel === "HIGH" ? "high" : riskLevel === "MEDIUM" ? "medium" : "low";
  const flowWord = verifiedFlowCount === 0
    ? "No confirmed personal data flows were detected."
    : `${verifiedFlowCount} confirmed personal data flow${verifiedFlowCount > 1 ? "s were" : " was"} detected.`;

  const welcomeText = `I've read through **${repoName}**. Risk level is **${riskWord.toUpperCase()}** — ${flowWord}\n\nAsk me anything: what these findings mean, whether you need a DPIA, what code changes to make, or how to explain this to your team.`;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function ensureConv(): Promise<number> {
    if (convId) return convId;
    return new Promise((resolve, reject) => {
      createConv.mutate(
        { data: { title: `${repoName} — GDPR chat` } },
        {
          onSuccess: (conv) => {
            localStorage.setItem(storageKey, String(conv.id));
            setConvId(conv.id);
            qc.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
            resolve(conv.id);
          },
          onError: reject,
        },
      );
    });
  }

  async function sendMessage() {
    if (!input.trim() || isStreaming) return;
    const userContent = input.trim();
    setInput("");

    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", content: userContent };
    const asstMsg: ChatMsg = { id: `a-${Date.now()}`, role: "assistant", content: "", streaming: true };
    setMessages((prev) => [...prev, userMsg, asstMsg]);
    setIsStreaming(true);

    try {
      const cid = await ensureConv();
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/openai/conversations/${cid}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userContent, scanId, documentIds: [] }),
      });
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as { content?: string };
            if (parsed.content) {
              setMessages((prev) =>
                prev.map((m) => m.id === asstMsg.id ? { ...m, content: m.content + parsed.content! } : m),
              );
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => m.id === asstMsg.id ? { ...m, content: `Error: ${String(err)}`, streaming: false } : m),
      );
    } finally {
      setMessages((prev) => prev.map((m) => m.id === asstMsg.id ? { ...m, streaming: false } : m));
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); }
  }

  return (
    <div className="bg-[#161b22] border border-[#1f6feb]/40 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-[#21262d] flex items-center gap-2.5 bg-[#1f6feb]/10">
        <Bot className="h-4 w-4 text-[#58a6ff]" />
        <div>
          <p className="text-sm font-medium text-[#e6edf3]">Ask about this scan</p>
          <p className="text-[10px] text-[#484f58]">Ask what findings mean, what to change, or whether you need a DPIA</p>
        </div>
      </div>

      {/* Welcome message (always shown) */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex gap-3">
          <div className="shrink-0 w-6 h-6 rounded-full bg-[#21262d] flex items-center justify-center">
            <Bot className="h-3 w-3 text-[#58a6ff]" />
          </div>
          <div className="bg-[#0d1117] border border-[#21262d] rounded-lg px-3 py-2.5 text-sm text-[#c9d1d9] leading-relaxed max-w-[85%]">
            {welcomeText.split("\n").map((line, i) =>
              line.startsWith("**") ? (
                <p key={i} className={i > 0 ? "mt-2" : ""}>
                  {line.replace(/\*\*([^*]+)\*\*/g, "$1").split(/(\*\*[^*]+\*\*)/).map((part, j) =>
                    /^\*\*/.test(part) ? <strong key={j} className="text-[#e6edf3]">{part.replace(/\*\*/g, "")}</strong> : part
                  )}
                </p>
              ) : line === "" ? <br key={i} /> : (
                <p key={i} className={i > 0 ? "mt-1" : ""}>
                  {line.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
                    part.startsWith("**") && part.endsWith("**")
                      ? <strong key={j} className="text-[#e6edf3]">{part.replace(/\*\*/g, "")}</strong>
                      : part
                  )}
                </p>
              )
            )}
          </div>
        </div>
      </div>

      {/* Conversation messages */}
      {messages.length > 0 && (
        <div className="px-5 py-2 space-y-3 max-h-96 overflow-y-auto">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${msg.role === "user" ? "bg-[#1f6feb]" : "bg-[#21262d]"}`}>
                {msg.role === "user"
                  ? <User className="h-3 w-3 text-white" />
                  : <Bot className="h-3 w-3 text-[#58a6ff]" />
                }
              </div>
              <div className={`max-w-[80%] rounded-lg px-3 py-2.5 text-sm leading-relaxed ${msg.role === "user" ? "bg-[#1f6feb]/20 text-[#c9d1d9]" : "bg-[#0d1117] border border-[#21262d] text-[#c9d1d9]"}`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.streaming && <span className="inline-block w-1 h-4 bg-[#58a6ff] animate-pulse ml-0.5 align-middle" />}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <div className="px-5 py-3 border-t border-[#21262d] mt-2">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder="e.g. Do I need a DPIA? What should I tell my lawyer? How do I fix the student_id issue?"
            rows={1}
            className="flex-1 resize-none bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#c9d1d9] placeholder:text-[#484f58] focus:outline-none focus:border-[#58a6ff] min-h-[38px] max-h-32 overflow-y-auto"
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
            }}
          />
          <Button
            onClick={() => void sendMessage()}
            disabled={!input.trim() || isStreaming}
            className="bg-[#1f6feb] hover:bg-[#388bfd] text-white h-9 w-9 p-0 shrink-0"
          >
            {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-[10px] text-[#484f58] mt-1.5">Enter to send · Shift+Enter for new line</p>
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
    mitigations?: Mitigation[];
    mitigatedScore?: number;
    mitigatedRiskLevel?: string;
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
  const mitigations = scan.mitigations ?? [];
  const mitigatedScore = scan.mitigatedScore ?? scan.gdprScore ?? 0;
  const mitigatedRiskLevel = scan.mitigatedRiskLevel ?? scan.riskLevel ?? "LOW";
  const hasMitigations = mitigations.length > 0;
  const scoreReduced = hasMitigations && mitigatedScore < (scan.gdprScore ?? 0);
  const isPending = scan.status === "pending" || scan.status === "running";

  function getMitigationsForCard(card: AuditCard): Mitigation[] {
    const key = `${card.evidence.file}:${card.evidence.line}`;
    return mitigations.filter((m) => m.flowKey === key);
  }

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
            {/* Gauge — shows mitigated score when reduced */}
            <div className="relative shrink-0">
              <ScoreGauge score={scoreReduced ? mitigatedScore : (scan.gdprScore ?? 0)} />
              {scoreReduced && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-[#3fb950] font-medium whitespace-nowrap">
                  mitigated
                </div>
              )}
            </div>
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[#484f58] uppercase tracking-widest">Risk Level</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <RiskBadge level={scoreReduced ? mitigatedRiskLevel : scan.riskLevel} />
                  {scoreReduced && scan.riskLevel !== mitigatedRiskLevel && (
                    <span className="text-[10px] text-[#484f58] line-through">{scan.riskLevel}</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-[#484f58] uppercase tracking-widest">Risk Score</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-lg font-semibold" style={{ color: scoreReduced ? "#3fb950" : (scan.gdprScore ?? 0) >= 50 ? "#f97583" : "#e3b341" }}>
                    {scoreReduced ? mitigatedScore : (scan.gdprScore ?? 0)}
                  </p>
                  {scoreReduced && (
                    <p className="text-sm text-[#484f58] line-through">{scan.gdprScore}</p>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-[#484f58] uppercase tracking-widest">Verified Flows</p>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <p className="text-lg font-semibold" style={{ color: verifiedFlows.length > 0 ? "#f97583" : "#3fb950" }}>
                    {verifiedFlows.length}
                  </p>
                  {hasMitigations && (
                    <p className="text-[10px] text-[#3fb950]">{mitigations.length} control{mitigations.length > 1 ? "s" : ""} applied</p>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-[#484f58] uppercase tracking-widest">Scanned</p>
                <p className="text-sm text-[#8b949e] mt-1">
                  {scan.completedAt ? new Date(scan.completedAt).toLocaleString() : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Mitigation progress banner */}
          {scoreReduced && (
            <div className="bg-[#1a2d1a] border border-[#3fb950]/30 rounded-lg px-5 py-3 flex items-center gap-3">
              <Shield className="h-4 w-4 text-[#3fb950] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#3fb950]">
                  Risk reduced by controls — score {scan.gdprScore} → {mitigatedScore}
                </p>
                <p className="text-xs text-[#3fb950]/70 mt-0.5">
                  {mitigations.length} control{mitigations.length > 1 ? "s" : ""} applied across {new Set(mitigations.map((m) => m.flowKey)).size} flow{new Set(mitigations.map((m) => m.flowKey)).size > 1 ? "s" : ""}. Add more controls to individual flows below to reduce the score further.
                </p>
              </div>
            </div>
          )}

          {/* DPO plain-English summary */}
          {auditSummary?.dpoSummary && (
            <DPOSummaryPanel dpo={auditSummary.dpoSummary} />
          )}

          {/* Audit summary */}
          {auditSummary && <AuditSummaryPanel summary={auditSummary} />}

          {/* Verified flow audit cards */}
          {auditCards.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs text-[#8b949e] uppercase tracking-widest font-medium">
                  Verified Data Flows ({auditCards.length})
                </h3>
                <p className="text-[10px] text-[#484f58]">
                  Click "How will you reduce this risk?" on each flow to add controls
                </p>
              </div>
              {auditCards.map((card, i) => (
                <AuditCardPanel
                  key={i}
                  card={card}
                  scanId={id}
                  mitigations={getMitigationsForCard(card)}
                  onRefresh={() => void refetch()}
                />
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

          {/* Inline AI chat */}
          <ScanChatPanel
            scanId={id}
            repoName={scan.repoName ?? "this repo"}
            riskLevel={scan.riskLevel}
            verifiedFlowCount={verifiedFlows.length}
          />
        </>
      )}
    </div>
  );
}
