import { useEffect } from "react";
import { createPortal } from "react-dom";

// ─── Types (mirrored from scan-detail) ────────────────────────────────────────

interface ClarifyingQuestion {
  id: string;
  question: string;
  escalatesTo?: string;
  dpiaTrigger?: string;
}

interface AuditCard {
  title: string;
  riskLevel: string;
  confidence: number;
  flow: string;
  evidence: { file: string; line: number; code: string };
  whyItMatters: string;
  whyThisWasFlagged: string[];
  whatIsNOTTrue: string[];
  tags: string[];
  needsReview?: boolean;
  clarifyingQuestions?: ClarifyingQuestion[];
}

interface Finding {
  type: string;
  category: string;
  file: string;
  line?: number | null;
  evidence: string;
  riskScore: number;
  confidence?: number;
  isVerifiedFlow?: boolean;
}

interface Dep {
  name: string;
  category: string;
  gdprRelevance: number;
}

interface Mitigation {
  id: number;
  flowKey: string;
  type: string;
  description: string;
  createdAt: string;
}

interface VibeCheck {
  id: string;
  title: string;
  note: string;
}

interface DPOAction {
  action: string;
  type: string;
  priority: string;
}

interface DPOSummary {
  actionItems: DPOAction[];
}

interface DPIAScreening {
  dpiaRecommended: boolean;
  detectedTriggers: string[];
  questions: ClarifyingQuestion[];
}

interface ThirdPartyService {
  name: string;
  category: string;
  isAI: boolean;
  detectedVia: string[];
  evidence: { file: string; line: number; snippet: string }[];
  regionHint?: string;
  residencyKnown: boolean;
}

interface SecurityNote {
  area: string;
  status: "attention" | "info" | "cannot-check";
  detail: string;
  mapsTo: string;
}

interface AuditSummary {
  dpoSummary?: DPOSummary;
  dpiaScreening?: DPIAScreening;
  thirdPartyServices?: ThirdPartyService[];
  residencyNotes?: string[];
  security?: SecurityNote[];
}

interface ScanInfo {
  repoName: string | null | undefined;
  githubUrl: string;
  gdprScore: number | null | undefined;
  riskLevel: string | null | undefined;
  completedAt: string | null | undefined;
}

interface GDPRReportProps {
  scan: ScanInfo;
  auditCards: AuditCard[];
  findings: Finding[];
  deps: Dep[];
  mitigations: Mitigation[];
  vibeChecks: VibeCheck[];
  auditSummary: AuditSummary | null;
  mitigatedScore: number;
  mitigatedRiskLevel: string;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MITIGATION_LABELS: Record<string, string> = {
  DPIA_COMPLETED: "DPIA completed",
  CONSENT_ADDED: "User consent added",
  DPA_IN_PLACE: "Data Processing Agreement in place",
  DELETION_MECHANISM: "Right to erasure implemented",
  PSEUDONYMISATION: "Data pseudonymised",
  ACCESS_RESTRICTED: "Access controls added",
  OTHER: "Other mitigation",
};

const DPA_CATEGORIES = new Set(["AI/LLM provider", "Analytics", "Logging/Monitoring"]);

function riskColor(level: string | null | undefined): string {
  if (level === "HIGH") return "#c0392b";
  if (level === "MEDIUM") return "#d68910";
  if (level === "NEEDS_REVIEW") return "#8e44ad";
  if (level === "INSUFFICIENT_EVIDENCE") return "#5d6d7e";
  return "#1e8449";
}

function riskLabel(level: string | null | undefined): string {
  if (level === "NEEDS_REVIEW") return "NEEDS REVIEW";
  if (level === "INSUFFICIENT_EVIDENCE") return "NOT ENOUGH EVIDENCE";
  return level ?? "—";
}

function confidenceWord(c: number): string {
  return c >= 0.75 ? "Higher confidence" : "Lower confidence";
}

function depPlainCategory(cat: string): string {
  if (cat.startsWith("AI")) return "AI service";
  if (cat === "Analytics") return "Analytics / tracking";
  if (cat.startsWith("Auth")) return "Authentication";
  if (cat.startsWith("Logging")) return "Logging / monitoring";
  if (cat.startsWith("Backend")) return "Database / data storage";
  return cat;
}

function actionTypeLabel(type: string): string {
  if (type === "CODE_CHANGE") return "Fix needed in code";
  if (type === "POLICY") return "Policy or process needed";
  if (type === "DPIA") return "Formal assessment recommended";
  if (type === "REVIEW") return "Needs review";
  return type;
}

// ─── Styles (inline, print-safe) ─────────────────────────────────────────────

const S = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    background: "#fff",
    zIndex: 9999,
    overflowY: "auto" as const,
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    color: "#1a1a1a",
    WebkitPrintColorAdjust: "exact" as const,
    printColorAdjust: "exact" as const,
  },
  toolbar: {
    position: "sticky" as const,
    top: 0,
    background: "#f8f9fa",
    borderBottom: "1px solid #dee2e6",
    padding: "10px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
    gap: 12,
  },
  btnBack: {
    background: "none",
    border: "1px solid #ced4da",
    borderRadius: 6,
    padding: "6px 14px",
    cursor: "pointer",
    fontSize: 13,
    color: "#495057",
  },
  btnPrint: {
    background: "#1a1a1a",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "6px 16px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  body: {
    maxWidth: 760,
    margin: "0 auto",
    padding: "48px 32px 80px",
  },
  coverTitle: {
    fontSize: 32,
    fontWeight: 700,
    letterSpacing: "-0.5px",
    marginBottom: 8,
    color: "#1a1a1a",
  },
  coverMeta: { fontSize: 14, color: "#495057", marginBottom: 4, lineHeight: 1.5 },
  coverMetaLabel: { color: "#868e96", fontSize: 12, textTransform: "uppercase" as const, letterSpacing: 1 },
  riskBadge: (level: string | null | undefined) => ({
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 4,
    border: `2px solid ${riskColor(level)}`,
    color: riskColor(level),
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: 0.5,
  }),
  caveat: {
    background: "#f8f9fa",
    border: "1px solid #dee2e6",
    borderRadius: 6,
    padding: "12px 16px",
    fontSize: 12,
    color: "#6c757d",
    lineHeight: 1.6,
    marginTop: 24,
  },
  sectionRule: { border: "none", borderTop: "2px solid #dee2e6", margin: "36px 0 24px" },
  sectionHeading: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: 1.5,
    color: "#868e96",
    marginBottom: 16,
    marginTop: 0,
  },
  h2: {
    fontSize: 20,
    fontWeight: 700,
    color: "#1a1a1a",
    marginBottom: 16,
    marginTop: 0,
  },
  h3: {
    fontSize: 15,
    fontWeight: 700,
    color: "#1a1a1a",
    marginBottom: 8,
    marginTop: 0,
  },
  para: { fontSize: 14, color: "#343a40", lineHeight: 1.7, marginBottom: 12, marginTop: 0 },
  code: {
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
    background: "#f6f8fa",
    border: "1px solid #e9ecef",
    borderRadius: 4,
    padding: "8px 12px",
    fontSize: 12,
    display: "block",
    overflowX: "auto" as const,
    wordBreak: "break-all" as const,
    color: "#1a1a1a",
    marginBottom: 10,
    marginTop: 4,
  },
  label: {
    display: "inline-block",
    background: "#f1f3f5",
    borderRadius: 3,
    padding: "1px 7px",
    fontSize: 11,
    fontWeight: 600,
    color: "#495057",
    marginRight: 6,
    letterSpacing: 0.3,
  },
  bulletList: { paddingLeft: 20, margin: "8px 0 12px", lineHeight: 1.7, fontSize: 14, color: "#343a40" },
  card: {
    border: "1px solid #dee2e6",
    borderRadius: 8,
    padding: "16px 20px",
    marginBottom: 16,
    pageBreakInside: "avoid" as const,
  },
  flowNumber: {
    fontSize: 11,
    fontWeight: 700,
    color: "#868e96",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 4,
  },
  evidenceBlock: {
    background: "#f6f8fa",
    border: "1px solid #e9ecef",
    borderRadius: 4,
    padding: "10px 12px",
    marginBottom: 12,
    fontSize: 12,
  },
  mitBadge: {
    display: "inline-block",
    background: "#d1fae5",
    border: "1px solid #6ee7b7",
    borderRadius: 3,
    padding: "1px 7px",
    fontSize: 11,
    fontWeight: 600,
    color: "#065f46",
    marginBottom: 4,
  },
  warnBox: {
    border: "1px solid #fbbf24",
    borderLeft: "3px solid #f59e0b",
    background: "#fffbeb",
    borderRadius: 4,
    padding: "10px 14px",
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 1.6,
    color: "#78350f",
  },
  infoBox: {
    border: "1px solid #93c5fd",
    borderLeft: "3px solid #3b82f6",
    background: "#eff6ff",
    borderRadius: 4,
    padding: "10px 14px",
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 1.6,
    color: "#1e3a5f",
  },
  limitBox: {
    border: "1px solid #dee2e6",
    borderRadius: 6,
    padding: "14px 18px",
    fontSize: 13,
    lineHeight: 1.7,
    color: "#6c757d",
  },
};

// ─── Report component ─────────────────────────────────────────────────────────

export function GDPRReportModal({
  scan,
  auditCards,
  findings,
  deps,
  mitigations,
  vibeChecks,
  auditSummary,
  mitigatedScore,
  mitigatedRiskLevel,
  onClose,
}: GDPRReportProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const potentialSignals = findings.filter((f) => !f.isVerifiedFlow);
  const services = auditSummary?.thirdPartyServices ?? [];
  const residencyNotes = auditSummary?.residencyNotes ?? [];
  const securityNotes = auditSummary?.security ?? [];
  const hasServices = services.length > 0 || deps.length > 0;
  // Section numbers (sections 4/5 are conditional, so later headings shift).
  const securitySectionNum = (vibeChecks.length > 0 ? 6 : hasServices ? 5 : 4);
  const riskSectionNum = securityNotes.length > 0 ? securitySectionNum + 1 : securitySectionNum;
  const scoreReduced = mitigatedScore < (scan.gdprScore ?? 0);
  const scanDate = scan.completedAt
    ? new Date(scan.completedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "Unknown";

  function getMitigationsForCard(card: AuditCard): Mitigation[] {
    const key = `${card.evidence.file}:${card.evidence.line}`;
    return mitigations.filter((m) => m.flowKey === key);
  }

  const dpaFlaggedDeps = deps.filter((d) => DPA_CATEGORIES.has(d.category));
  const groupedDeps = deps.reduce<Record<string, Dep[]>>((acc, d) => {
    const cat = depPlainCategory(d.category);
    acc[cat] = acc[cat] ?? [];
    acc[cat].push(d);
    return acc;
  }, {});

  const actionItems = auditSummary?.dpoSummary?.actionItems ?? [];

  return createPortal(
    <div style={S.overlay} className="gdpr-print-modal">

      {/* ── Toolbar (non-printable) ── */}
      <div style={S.toolbar} className="no-print">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button style={S.btnBack} onClick={onClose}>← Back to scan</button>
          <span style={{ fontSize: 13, color: "#868e96" }}>
            GDPR Risk Report — {scan.repoName}
          </span>
        </div>
        <button style={S.btnPrint} onClick={() => window.print()}>
          🖨 Print / Save as PDF
        </button>
      </div>

      {/* ── Report body ── */}
      <div style={S.body}>

        {/* ── Cover ── */}
        <div style={{ marginBottom: 32 }}>
          <p style={{ ...S.coverMeta, ...S.coverMetaLabel, marginBottom: 12 }}>Automated GDPR Risk Report</p>
          <h1 style={S.coverTitle}>GDPR Risk Report</h1>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px", margin: "20px 0" }}>
            <div>
              <p style={{ ...S.coverMeta, ...S.coverMetaLabel }}>System scanned</p>
              <p style={{ ...S.coverMeta, fontWeight: 600 }}>{scan.repoName}</p>
            </div>
            <div>
              <p style={{ ...S.coverMeta, ...S.coverMetaLabel }}>Date of scan</p>
              <p style={{ ...S.coverMeta, fontWeight: 600 }}>{scanDate}</p>
            </div>
            <div>
              <p style={{ ...S.coverMeta, ...S.coverMetaLabel }}>Risk level</p>
              <div style={{ marginTop: 4 }}>
                <span style={S.riskBadge(scoreReduced ? mitigatedRiskLevel : scan.riskLevel)}>
                  {riskLabel(scoreReduced ? mitigatedRiskLevel : scan.riskLevel)}
                </span>
              </div>
            </div>
            <div>
              <p style={{ ...S.coverMeta, ...S.coverMetaLabel }}>Risk score</p>
              <p style={{ ...S.coverMeta, fontWeight: 600 }}>
                {scoreReduced
                  ? <>{mitigatedScore} / 100 <span style={{ color: "#868e96", fontWeight: 400, textDecoration: "line-through" }}>{scan.gdprScore}</span> (after controls recorded)</>
                  : <>{scan.gdprScore ?? 0} / 100</>
                }
              </p>
            </div>
          </div>

          <p style={{ ...S.coverMeta, marginBottom: 4, color: "#6c757d" }}>
            <a href={scan.githubUrl} style={{ color: "#6c757d" }}>{scan.githubUrl}</a>
          </p>

          <div style={S.caveat}>
            <strong>Note:</strong> This report was generated automatically. It covers JavaScript and TypeScript files only. It should be reviewed by someone responsible for data protection before being shared or acted upon. It does not constitute a completed DPIA.
          </div>
        </div>

        {/* ── Section 1: What we found ── */}
        <hr style={S.sectionRule} />
        <h2 style={S.h2}>1. What we found</h2>

        <p style={S.para}>
          We scanned the JavaScript and TypeScript files in <strong>{scan.repoName}</strong> and found:
        </p>

        <ul style={S.bulletList}>
          <li>
            <strong>{auditCards.length} confirmed data movement{auditCards.length !== 1 ? "s" : ""}</strong>
            {auditCards.length > 0
              ? " — we traced personal data from a form or API request to a database, file, or external service."
              : " — we could not confirm personal data flowing from a user input to a storage location or external service."}
          </li>
          <li>
            <strong>{potentialSignals.length} potential signal{potentialSignals.length !== 1 ? "s" : ""}</strong>
            {" — "}libraries or patterns that are present in the code, but we could not confirm personal data flowing through them. These are not scored risks.
          </li>
          {hasServices && (
            <li>
              <strong>{services.length || deps.length} external service{(services.length || deps.length) !== 1 ? "s" : ""} detected</strong>
              {" — "}places your app connects to that may receive personal data (some need a Data Processing Agreement).
            </li>
          )}
        </ul>

        {deps.length > 0 && (
          <>
            <p style={{ ...S.para, marginBottom: 8 }}><strong>Services detected by category:</strong></p>
            {Object.entries(groupedDeps).map(([cat, ds]) => (
              <div key={cat} style={{ marginBottom: 8 }}>
                <span style={S.label}>{cat}</span>
                <span style={{ fontSize: 13, color: "#495057" }}>
                  {ds.map((d) => d.name).join(", ")}
                  {ds.some((d) => DPA_CATEGORIES.has(d.category)) && (
                    <span style={{ color: "#e67e22", marginLeft: 8 }}>⚠ DPA may be required</span>
                  )}
                </span>
              </div>
            ))}
          </>
        )}

        <div style={{ ...S.infoBox, marginTop: 16 }}>
          <strong>Coverage:</strong> This scanner analyses JavaScript and TypeScript files. Coverage for JS/TS codebases is high. Other file types (.vue, .py, .rb, .php, .go) are not scanned — if your codebase includes these, a manual review of those files is recommended.
        </div>

        {/* ── Section 2: Confirmed data movements ── */}
        {auditCards.length > 0 && (
          <>
            <hr style={S.sectionRule} />
            <h2 style={S.h2}>2. Confirmed data movements</h2>
            <p style={S.para}>
              These are cases where we traced a clear path from personal data entering your system to where it is stored or sent.
            </p>

            {auditCards.map((card, i) => {
              const cardMitigations = getMitigationsForCard(card);
              return (
                <div key={i} style={S.card}>
                  <p style={S.flowNumber}>Data movement {i + 1} of {auditCards.length}</p>
                  <h3 style={S.h3}>{card.title}</h3>
                  <p style={{ ...S.para, marginBottom: 8 }}>
                    <span style={S.label}>{confidenceWord(card.confidence)}</span>
                    <span style={{ ...S.label, color: riskColor(card.riskLevel), background: "none", border: `1px solid ${riskColor(card.riskLevel)}`, padding: "1px 7px" }}>{riskLabel(card.riskLevel)}</span>
                    {card.tags?.includes("AI_PROCESSING") && (
                      <span style={{ ...S.label, color: "#8e44ad", background: "#f5eef8", border: "1px solid #d2b4de" }}>AI SERVICE</span>
                    )}
                    {card.tags?.includes("SPECIAL_CATEGORY_DATA") && (
                      <span style={{ ...S.label, color: "#c0392b", background: "#fdecea", border: "1px solid #f5b7b1" }}>SPECIAL CATEGORY</span>
                    )}
                    {card.tags?.includes("CHILDREN_DATA") && (
                      <span style={{ ...S.label, color: "#b9770e", background: "#fef9e7", border: "1px solid #f7dc6f" }}>CHILDREN / STUDENTS</span>
                    )}
                  </p>

                  <div style={S.evidenceBlock}>
                    <p style={{ margin: "0 0 4px 0", fontSize: 11, fontWeight: 700, color: "#868e96", textTransform: "uppercase", letterSpacing: 1 }}>Evidence</p>
                    <p style={{ margin: "0 0 4px 0", fontSize: 12, fontFamily: "monospace", color: "#495057" }}>
                      {card.evidence.file}:{card.evidence.line}
                    </p>
                    <code style={{ ...S.code, margin: 0 }}>{card.evidence.code}</code>
                  </div>

                  <p style={{ ...S.para, marginBottom: 6 }}><strong>Why this matters:</strong></p>
                  <p style={{ ...S.para, marginTop: 0 }}>{card.whyItMatters}</p>

                  {cardMitigations.length > 0 && (
                    <>
                      <p style={{ ...S.para, marginBottom: 6 }}><strong>Controls recorded:</strong></p>
                      {cardMitigations.map((m) => (
                        <div key={m.id} style={{ marginBottom: 8 }}>
                          <span style={S.mitBadge}>{MITIGATION_LABELS[m.type] ?? m.type}</span>
                          <p style={{ ...S.para, margin: "4px 0 0 0", fontSize: 13 }}>{m.description}</p>
                        </div>
                      ))}
                    </>
                  )}

                  {card.clarifyingQuestions && card.clarifyingQuestions.length > 0 && (
                    <div style={{ ...S.warnBox, marginTop: 10 }}>
                      <p style={{ margin: "0 0 6px 0", fontWeight: 700, fontSize: 13 }}>
                        Questions to confirm (these decide the final rating):
                      </p>
                      <ul style={{ ...S.bulletList, marginTop: 0, marginBottom: 0, color: "#78350f" }}>
                        {card.clarifyingQuestions.map((q) => (
                          <li key={q.id} style={{ fontSize: 13 }}>
                            {q.question}
                            {q.dpiaTrigger && (
                              <span style={{ display: "block", fontSize: 11, color: "#92732f", marginTop: 2 }}>
                                If yes → likely a DPIA trigger: {q.dpiaTrigger}.
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {card.whatIsNOTTrue.length > 0 && (
                    <>
                      <p style={{ ...S.para, marginBottom: 4, marginTop: 8 }}><strong>What we did not confirm:</strong></p>
                      <ul style={{ ...S.bulletList, marginTop: 0 }}>
                        {card.whatIsNOTTrue.map((s, j) => (
                          <li key={j} style={{ fontSize: 13, color: "#6c757d" }}>We did not confirm that {s.replace(/^We did not confirm that /, "").replace(/^This does not mean /, "")}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* ── Section 3: Potential signals ── */}
        {potentialSignals.length > 0 && (
          <>
            <hr style={S.sectionRule} />
            <h2 style={S.h2}>3. Potential signals</h2>
            <p style={S.para}>
              These are potential signals, not confirmed risks. We found evidence that certain libraries or features are present in the code, but we could not trace personal data flowing through them. They do not affect the risk score.
            </p>
            {potentialSignals.slice(0, 10).map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid #f1f3f5", fontSize: 13, color: "#495057" }}>
                <span style={{ ...S.label, flexShrink: 0, alignSelf: "flex-start", marginTop: 1 }}>{f.category}</span>
                <div>
                  <p style={{ margin: "0 0 2px 0", fontFamily: "monospace", fontSize: 12 }}>{f.file}{f.line != null ? `:${f.line}` : ""}</p>
                  <p style={{ margin: 0, color: "#6c757d", fontFamily: "monospace", fontSize: 11 }}>{f.evidence}</p>
                </div>
              </div>
            ))}
            {potentialSignals.length > 10 && (
              <p style={{ ...S.para, fontSize: 12, color: "#868e96", marginTop: 8 }}>
                … and {potentialSignals.length - 10} more potential signals.
              </p>
            )}
          </>
        )}

        {/* ── Section 4: Third-party services ── */}
        {hasServices && (
          <>
            <hr style={S.sectionRule} />
            <h2 style={S.h2}>4. Third-party services your app connects to</h2>
            <p style={S.para}>
              These are external services the code is wired to. Each is a place your app may send personal
              data to — and a likely transfer outside the UK/EEA. Confirm what is shared and where it is
              stored; some require a Data Processing Agreement (DPA).
            </p>

            {services.length > 0
              ? services.map((s, i) => (
                  <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid #f1f3f5" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{s.name}</span>
                      <span style={S.label}>{s.category}</span>
                      {s.isAI && <span style={{ ...S.label, background: "#ede9fe", color: "#6d28d9" }}>AI</span>}
                    </div>
                    <p style={{ margin: "3px 0 0 0", fontSize: 12, color: "#374151" }}>
                      Data residency:{" "}
                      {s.residencyKnown && s.regionHint
                        ? `a region "${s.regionHint}" was found in the code — confirm it is in the UK/EEA.`
                        : "cannot be determined from the code — confirm with the supplier (a non-UK/EEA location needs an international-transfer safeguard, GDPR Art. 44–49)."}
                    </p>
                    {s.evidence[0] && (
                      <p style={{ margin: "2px 0 0 0", fontSize: 11, color: "#9ca3af" }}>
                        Evidence: {s.evidence[0].file}
                        {s.evidence[0].line ? `:${s.evidence[0].line}` : ""}
                      </p>
                    )}
                  </div>
                ))
              : deps.map((d, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid #f1f3f5" }}>
                    <span style={{ ...S.label, flexShrink: 0, marginTop: 1 }}>{depPlainCategory(d.category)}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{d.name}</p>
                      {DPA_CATEGORIES.has(d.category) && (
                        <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "#b45309" }}>
                          ⚠ A Data Processing Agreement may be required with this provider.
                        </p>
                      )}
                    </div>
                  </div>
                ))}

            {residencyNotes.length > 0 && (
              <div style={{ ...S.infoBox, marginTop: 16 }}>
                For your DPIA's “international transfers” section and the IT System Requirements Assessment,
                record where each of these services stores and processes personal data.
              </div>
            )}
          </>
        )}

        {/* ── Section 5: Things to check manually ── */}
        {vibeChecks.length > 0 && (
          <>
            <hr style={S.sectionRule} />
            <h2 style={S.h2}>5. Things to check manually</h2>
            <p style={S.para}>
              These patterns were detected automatically but need your judgement to assess. They are not scored — they are reminders based on common issues in apps built on platforms like Supabase, Lovable, and Replit.
            </p>
            {vibeChecks.map((vc) => (
              <div key={vc.id} style={S.warnBox}>
                <p style={{ margin: "0 0 4px 0", fontWeight: 700, fontSize: 13 }}>{vc.title}</p>
                <p style={{ margin: 0, fontSize: 13 }}>{vc.note}</p>
              </div>
            ))}
          </>
        )}

        {/* ── Security & Cyber Essentials notes ── */}
        {securityNotes.length > 0 && (
          <>
            <hr style={S.sectionRule} />
            <h2 style={S.h2}>{securitySectionNum}. Security &amp; Cyber Essentials notes</h2>
            <p style={S.para}>
              Cyber Essentials is a UK security certification (firewalls, secure configuration, access
              control, patching, malware protection). This scan can't certify it, but the
              security-relevant signals it can see are mapped below to your IT System Requirements
              Assessment.
            </p>
            {securityNotes.map((n, i) => (
              <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid #f1f3f5" }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>
                  {n.area}
                  <span style={{ ...S.label, marginLeft: 8 }}>
                    {n.status === "attention" ? "CHECK" : n.status === "cannot-check" ? "NOT SEEN" : "INFO"}
                  </span>
                </p>
                <p style={{ margin: "3px 0 0 0", fontSize: 13, color: "#374151" }}>{n.detail}</p>
                <p style={{ margin: "2px 0 0 0", fontSize: 11, color: "#9ca3af" }}>Maps to: {n.mapsTo}</p>
              </div>
            ))}
          </>
        )}

        {/* ── Risk summary ── */}
        <hr style={S.sectionRule} />
        <h2 style={S.h2}>{riskSectionNum}. Risk summary</h2>

        <div style={{ borderLeft: `4px solid ${riskColor(scoreReduced ? mitigatedRiskLevel : scan.riskLevel)}`, paddingLeft: 16, marginBottom: 20 }}>
          <p style={{ ...S.para, margin: 0 }}>
            <strong>Overall risk: </strong>
            <span style={{ color: riskColor(scoreReduced ? mitigatedRiskLevel : scan.riskLevel), fontWeight: 700 }}>
              {riskLabel(scoreReduced ? mitigatedRiskLevel : scan.riskLevel)}
            </span>
            {" "}(score {scoreReduced ? mitigatedScore : (scan.gdprScore ?? 0)} / 100
            {scoreReduced ? `, reduced from ${scan.gdprScore} after controls recorded` : ""}).
          </p>
        </div>

        {scoreReduced && mitigations.length > 0 ? (
          <p style={S.para}>
            {mitigations.length} control{mitigations.length > 1 ? "s have" : " has"} been recorded against{" "}
            {new Set(mitigations.map((m) => m.flowKey)).size} data flow{new Set(mitigations.map((m) => m.flowKey)).size > 1 ? "s" : ""},
            reducing the score from {scan.gdprScore} to {mitigatedScore}.
            Continue adding controls to individual flows to reduce the score further.
          </p>
        ) : actionItems.length > 0 ? (
          <>
            <p style={{ ...S.para, marginBottom: 8 }}><strong>Suggested next steps:</strong></p>
            <ul style={S.bulletList}>
              {actionItems.map((a, i) => (
                <li key={i}>{actionTypeLabel(a.type)}: {a.action}</li>
              ))}
            </ul>
          </>
        ) : (
          <p style={S.para}>
            {auditCards.length === 0
              ? "No confirmed personal data movements were detected. Continue to check the potential signals listed above and re-scan if you add new features."
              : "To reduce your risk score, consider completing a Data Protection Impact Assessment (DPIA) for the highest-risk flows, adding user consent before data collection, and implementing a way for users to request deletion of their data."}
          </p>
        )}

        {/* ── Do you need a DPIA? ── */}
        {auditSummary?.dpiaScreening && (
          <>
            <h3 style={{ ...S.h3, marginTop: 28 }}>Do you need a DPIA?</h3>
            {auditSummary.dpiaScreening.dpiaRecommended ? (
              <div style={S.warnBox}>
                <strong>A Data Protection Impact Assessment (DPIA) looks likely to be required.</strong> The scan found:
                <ul style={{ ...S.bulletList, marginTop: 6, marginBottom: 0, color: "#78350f" }}>
                  {auditSummary.dpiaScreening.detectedTriggers.map((t, i) => (
                    <li key={i} style={{ fontSize: 13 }}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p style={S.para}>
                No automatic DPIA triggers were detected in the code. Still confirm the questions below — answering “yes” to any of them means a DPIA is required.
              </p>
            )}
            <p style={{ ...S.para, marginBottom: 6, marginTop: 12 }}>
              <strong>Confirm these against your DPIA screening questions:</strong>
            </p>
            <ul style={S.bulletList}>
              {auditSummary.dpiaScreening.questions.map((q) => (
                <li key={q.id} style={{ marginBottom: 6 }}>
                  {q.question}
                  {q.dpiaTrigger && (
                    <span style={{ display: "block", fontSize: 11, color: "#868e96", marginTop: 2 }}>
                      Maps to DPIA trigger: {q.dpiaTrigger}.
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div style={S.infoBox}>
              This screening mirrors the questions in your organisation’s DPIA template. It is a prompt for a human decision, not a completed DPIA. If in doubt, contact your Data Protection Officer.
            </div>
          </>
        )}

        {/* ── Section 7: Honest limitations ── */}
        <hr style={S.sectionRule} />
        <h2 style={S.h2}>Honest limitations</h2>

        <div style={S.limitBox}>
          <ul style={{ ...S.bulletList, marginBottom: 0 }}>
            <li>This scanner covers JavaScript and TypeScript files only. Python, Ruby, Go, PHP, Vue, and Svelte files are not scanned.</li>
            <li>Source detection covers common patterns (form fields, API request bodies). Custom hooks, GraphQL resolvers, and some ORM patterns may not be detected.</li>
            <li>Confidence levels are indicators based on code patterns, not precise measurements.</li>
            <li>Findings reflect the codebase at the time of scan. Re-scan after significant changes.</li>
            <li>This report does not constitute a completed Data Protection Impact Assessment (DPIA).</li>
            <li>Manual review by someone with data protection knowledge is recommended before sharing this report externally.</li>
          </ul>
        </div>

        <p style={{ ...S.para, marginTop: 24, fontSize: 12, color: "#868e96", borderTop: "1px solid #dee2e6", paddingTop: 16 }}>
          Generated by GDPR Scanner · {scanDate} · {scan.repoName}
        </p>

      </div>
    </div>,
    document.body,
  );
}
