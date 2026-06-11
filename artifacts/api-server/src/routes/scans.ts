import { Router, type IRouter } from "express";
import { eq, desc, avg, count, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { scans, flowMitigations } from "@workspace/db/schema";
import {
  CreateScanBody,
  GetScanParams,
  DeleteScanParams,
  ListScansResponse,
  GetScanResponse,
  GetScanStatsResponse,
} from "@workspace/api-zod";
import { runFullScan } from "@workspace/gdpr-scanner";
import path from "path";
import { logger } from "../lib/logger.js";
import { z } from "zod";

const router: IRouter = Router();

const REPOS_DIR = path.resolve(process.cwd(), "repos");

// ─── Mitigation score reduction factors ───────────────────────────────────────

const MITIGATION_FACTORS: Record<string, number> = {
  DPIA_COMPLETED: 0.60,
  CONSENT_ADDED: 0.50,
  PSEUDONYMISATION: 0.50,
  DPA_IN_PLACE: 0.40,
  DELETION_MECHANISM: 0.30,
  ACCESS_RESTRICTED: 0.25,
  OTHER: 0.20,
};

function calcMitigatedScore(
  originalScore: number,
  flowCount: number,
  mitigationsByKey: Record<string, { type: string }[]>,
): { mitigatedScore: number; mitigatedRiskLevel: string } {
  if (flowCount === 0 || originalScore === 0) {
    return { mitigatedScore: originalScore, mitigatedRiskLevel: "LOW" };
  }

  // Each flow contributes originalScore/flowCount to the total
  const perFlowContribution = originalScore / flowCount;
  let totalContribution = 0;

  for (let i = 0; i < flowCount; i++) {
    // We can't easily identify flows by index here — use a rough approach:
    // calculate unmitigated contribution from flows that have no mitigations
    totalContribution += perFlowContribution;
  }

  // Apply mitigation reductions per flow key
  let totalReduction = 0;
  for (const mitigations of Object.values(mitigationsByKey)) {
    let flowReduction = mitigations.reduce(
      (acc, m) => acc + (MITIGATION_FACTORS[m.type] ?? 0.20),
      0,
    );
    flowReduction = Math.min(flowReduction, 0.80); // cap at 80% per flow
    totalReduction += flowReduction * perFlowContribution;
  }

  const mitigatedScore = Math.max(0, Math.round(originalScore - totalReduction));

  const mitigatedRiskLevel =
    mitigatedScore >= 50 ? "HIGH"
    : mitigatedScore >= 25 ? "MEDIUM"
    : "LOW";

  return { mitigatedScore, mitigatedRiskLevel };
}

// ─── Vibe checks (Lovable / Replit / vibe-coder patterns) ─────────────────────

interface VibeCheck {
  id: string;
  title: string;
  note: string;
}

function buildVibeChecks(
  deps: Array<{ name: string; category: string }>,
  findings: Array<{ type: string; evidence: string; file: string; category: string }>,
): VibeCheck[] {
  const checks: VibeCheck[] = [];

  const hasSupabase = deps.some((d) => /^@?supabase/.test(d.name));
  if (hasSupabase) {
    checks.push({
      id: "supabase-rls",
      title: "Supabase detected — check Row Level Security",
      note: "Supabase is in your dependencies. Make sure Row Level Security (RLS) is enabled on every database table that holds personal data. Without RLS, any authenticated user may be able to read all rows in those tables.",
    });
  }

  const aiDepPattern = /^openai$|^@openai\/|^@anthropic-ai\/|^elevenlabs|^@google\/generative-ai/;
  const aiEvidencePattern = /openai\.com|anthropic\.com|elevenlabs\.io|generativelanguage\.googleapis|OPENAI_API_KEY|ANTHROPIC_API_KEY|ELEVENLABS_API_KEY|GEMINI_API_KEY/i;
  const hasDirectAI = deps.some((d) => aiDepPattern.test(d.name)) || findings.some((f) => aiEvidencePattern.test(f.evidence));
  if (hasDirectAI) {
    checks.push({
      id: "direct-ai-api",
      title: "AI provider integration detected",
      note: "Your app sends data to an AI service (OpenAI, Anthropic, ElevenLabs, or Google Gemini). If you include any personal data in prompts or API calls, you need a Data Processing Agreement with that provider. Review exactly what data is being sent.",
    });
  }

  const hasEnvRefs = findings.some((f) => /process\.env\.|import\.meta\.env\./.test(f.evidence));
  const hasBrowserEnvRefs = findings.some((f) => /VITE_|NEXT_PUBLIC_/.test(f.evidence) && /key|secret|token|password/i.test(f.evidence));
  if (hasEnvRefs) {
    checks.push({
      id: "env-vars",
      title: "Environment variables detected",
      note: `Environment variables are used in this codebase. Make sure no personal data is stored in .env files, and that API keys are never exposed to the browser.${hasBrowserEnvRefs ? " Client-side environment variables (VITE_ or NEXT_PUBLIC_) were detected — verify these do not expose secret keys." : ""}`,
    });
  }

  const hasLocalStoragePII = findings.some((f) => {
    const isStorage = /localStorage|sessionStorage/.test(f.evidence ?? "");
    const hasIdentifiable = /email|user|student|name\b|\.id\b|auth|token|session/i.test(f.evidence ?? "");
    return isStorage && hasIdentifiable;
  });
  if (hasLocalStoragePII) {
    checks.push({
      id: "local-storage-pii",
      title: "Personal data may be stored in the browser",
      note: "Data with identifiable-looking field names is being stored in browser storage (localStorage or sessionStorage). This persists on the user's device even after they log out. Make sure this is intentional and disclosed in your privacy notice. Never store passwords, financial data, or sensitive health information this way.",
    });
  }

  return checks;
}

// ─── Stats ─────────────────────────────────────────────────────────────────────

router.get("/scans/stats", async (_req, res): Promise<void> => {
  const rows = await db.select().from(scans).orderBy(desc(scans.createdAt)).limit(5);

  const aggRows = await db
    .select({
      totalScans: count(),
      avgScore: avg(scans.gdprScore),
    })
    .from(scans);

  const agg = aggRows[0] ?? { totalScans: 0, avgScore: null };

  const highCount = await db.select({ c: count() }).from(scans).where(eq(scans.riskLevel, "HIGH"));
  const medCount = await db.select({ c: count() }).from(scans).where(eq(scans.riskLevel, "MEDIUM"));
  const lowCount = await db.select({ c: count() }).from(scans).where(eq(scans.riskLevel, "LOW"));

  const recentScans = rows.map((s) => ({
    id: s.id,
    githubUrl: s.githubUrl,
    repoName: s.repoName,
    status: s.status,
    gdprScore: s.gdprScore,
    riskLevel: s.riskLevel,
    totalFindings: s.totalFindings,
    error: s.error,
    createdAt: s.createdAt.toISOString(),
    completedAt: s.completedAt?.toISOString() ?? null,
  }));

  res.json(
    GetScanStatsResponse.parse({
      totalScans: Number(agg.totalScans ?? 0),
      avgScore: Number(agg.avgScore ?? 0),
      highRiskCount: Number(highCount[0]?.c ?? 0),
      mediumRiskCount: Number(medCount[0]?.c ?? 0),
      lowRiskCount: Number(lowCount[0]?.c ?? 0),
      recentScans,
    }),
  );
});

// ─── List ──────────────────────────────────────────────────────────────────────

router.get("/scans", async (_req, res): Promise<void> => {
  const rows = await db.select().from(scans).orderBy(desc(scans.createdAt));
  res.json(
    ListScansResponse.parse(
      rows.map((s) => ({
        id: s.id,
        githubUrl: s.githubUrl,
        repoName: s.repoName,
        status: s.status,
        gdprScore: s.gdprScore,
        riskLevel: s.riskLevel,
        totalFindings: s.totalFindings,
        error: s.error,
        createdAt: s.createdAt.toISOString(),
        completedAt: s.completedAt?.toISOString() ?? null,
      })),
    ),
  );
});

// ─── Create ────────────────────────────────────────────────────────────────────

router.post("/scans", async (req, res): Promise<void> => {
  const parsed = CreateScanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { githubUrl } = parsed.data;
  const cleaned = githubUrl.replace(/\.git$/, "").replace(/\/$/, "");
  const parts = cleaned.split("/");
  const repoName = `${parts[parts.length - 2] ?? "unknown"}/${parts[parts.length - 1] ?? "repo"}`;

  const [scan] = await db.insert(scans).values({ githubUrl, repoName, status: "running" }).returning();

  res.status(201).json({
    id: scan!.id,
    githubUrl: scan!.githubUrl,
    repoName: scan!.repoName,
    status: scan!.status,
    gdprScore: scan!.gdprScore,
    riskLevel: scan!.riskLevel,
    totalFindings: scan!.totalFindings,
    error: scan!.error,
    createdAt: scan!.createdAt.toISOString(),
    completedAt: scan!.completedAt?.toISOString() ?? null,
  });

  setImmediate(async () => {
    try {
      logger.info({ scanId: scan!.id, githubUrl }, "Starting GDPR scan");

      const index = await runFullScan(githubUrl, REPOS_DIR, (progress) => {
        logger.info({ scanId: scan!.id, stage: progress.stage }, progress.message);
      });

      await db
        .update(scans)
        .set({
          status: "done",
          gdprScore: index.summary.gdprScore,
          riskLevel: index.summary.riskLevel,
          totalFindings: index.summary.totalFindings,
          breakdown: index.summary.breakdown,
          findings: index.findings as unknown as Record<string, unknown>[],
          dependencies: index.dependencies as unknown as Record<string, unknown>[],
          verifiedFlows: index.verifiedFlows as unknown as Record<string, unknown>[],
          auditCards: index.auditCards as unknown as Record<string, unknown>[],
          auditSummary: index.auditSummary as unknown as Record<string, unknown>,
          completedAt: new Date(),
        })
        .where(eq(scans.id, scan!.id));

      logger.info({ scanId: scan!.id, score: index.summary.gdprScore }, "Scan complete");
    } catch (err) {
      logger.error({ err, scanId: scan!.id }, "Scan failed");
      await db
        .update(scans)
        .set({ status: "failed", error: String(err), completedAt: new Date() })
        .where(eq(scans.id, scan!.id));
    }
  });
});

// ─── Get single scan (with mitigations + mitigated score) ─────────────────────

router.get("/scans/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetScanParams.safeParse({ id: parseInt(raw!, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [scan] = await db.select().from(scans).where(eq(scans.id, params.data.id));
  if (!scan) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  const mitigationRows = await db
    .select()
    .from(flowMitigations)
    .where(eq(flowMitigations.scanId, params.data.id));

  const mitigations = mitigationRows.map((m) => ({
    id: m.id,
    scanId: m.scanId,
    flowKey: m.flowKey,
    type: m.type,
    description: m.description,
    createdAt: m.createdAt.toISOString(),
  }));

  const mitigationsByKey: Record<string, { type: string }[]> = {};
  for (const m of mitigations) {
    if (!mitigationsByKey[m.flowKey]) mitigationsByKey[m.flowKey] = [];
    mitigationsByKey[m.flowKey]!.push({ type: m.type });
  }

  const verifiedFlows = (scan.verifiedFlows as unknown[]) ?? [];
  const { mitigatedScore, mitigatedRiskLevel } = calcMitigatedScore(
    scan.gdprScore ?? 0,
    verifiedFlows.length,
    mitigationsByKey,
  );

  const base = GetScanResponse.parse({
    id: scan.id,
    githubUrl: scan.githubUrl,
    repoName: scan.repoName,
    status: scan.status,
    gdprScore: scan.gdprScore,
    riskLevel: scan.riskLevel,
    totalFindings: scan.totalFindings,
    breakdown: scan.breakdown,
    error: scan.error,
    createdAt: scan.createdAt.toISOString(),
    completedAt: scan.completedAt?.toISOString() ?? null,
    findings: (scan.findings as unknown[]) ?? [],
    dependencies: (scan.dependencies as unknown[]) ?? [],
  });

  const allFindings = (scan.findings as Array<{ type: string; evidence: string; file: string; category: string }>) ?? [];
  const allDeps = (scan.dependencies as Array<{ name: string; category: string; gdprRelevance: number }>) ?? [];
  const vibeChecks = buildVibeChecks(allDeps, allFindings);

  res.json({
    ...base,
    verifiedFlows,
    auditCards: (scan.auditCards as unknown[]) ?? [],
    auditSummary: scan.auditSummary ?? null,
    mitigations,
    mitigatedScore,
    mitigatedRiskLevel,
    vibeChecks,
  });
});

// ─── Add mitigation ────────────────────────────────────────────────────────────

const AddMitigationBody = z.object({
  flowKey: z.string().min(1),
  type: z.enum(["DPIA_COMPLETED", "CONSENT_ADDED", "DPA_IN_PLACE", "DELETION_MECHANISM", "PSEUDONYMISATION", "ACCESS_RESTRICTED", "OTHER"]),
  description: z.string().min(1).max(500),
});

router.post("/scans/:id/mitigations", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const scanId = parseInt(raw!, 10);
  if (isNaN(scanId)) { res.status(400).json({ error: "Invalid scan id" }); return; }

  const parsed = AddMitigationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [scan] = await db.select({ id: scans.id }).from(scans).where(eq(scans.id, scanId));
  if (!scan) { res.status(404).json({ error: "Scan not found" }); return; }

  const [row] = await db
    .insert(flowMitigations)
    .values({ scanId, flowKey: parsed.data.flowKey, type: parsed.data.type, description: parsed.data.description })
    .returning();

  res.status(201).json({
    id: row!.id,
    scanId: row!.scanId,
    flowKey: row!.flowKey,
    type: row!.type,
    description: row!.description,
    createdAt: row!.createdAt.toISOString(),
  });
});

// ─── Delete mitigation ─────────────────────────────────────────────────────────

router.delete("/scans/:id/mitigations/:mitigationId", async (req, res): Promise<void> => {
  const scanId = parseInt(req.params.id!, 10);
  const mitigationId = parseInt(req.params.mitigationId!, 10);
  if (isNaN(scanId) || isNaN(mitigationId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(flowMitigations)
    .where(and(eq(flowMitigations.id, mitigationId), eq(flowMitigations.scanId, scanId)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Mitigation not found" }); return; }
  res.sendStatus(204);
});

// ─── Delete scan ───────────────────────────────────────────────────────────────

router.delete("/scans/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteScanParams.safeParse({ id: parseInt(raw!, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [deleted] = await db.delete(scans).where(eq(scans.id, params.data.id)).returning();
  if (!deleted) { res.status(404).json({ error: "Scan not found" }); return; }
  res.sendStatus(204);
});

export default router;
