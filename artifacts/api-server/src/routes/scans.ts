import { Router, type IRouter } from "express";
import { eq, desc, avg, count, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { scans } from "@workspace/db/schema";
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

const router: IRouter = Router();

const REPOS_DIR = path.resolve(process.cwd(), "repos");

router.get("/scans/stats", async (_req, res): Promise<void> => {
  const rows = await db.select().from(scans).orderBy(desc(scans.createdAt)).limit(5);

  const aggRows = await db
    .select({
      totalScans: count(),
      avgScore: avg(scans.gdprScore),
    })
    .from(scans);

  const agg = aggRows[0] ?? { totalScans: 0, avgScore: null };

  const highCount = await db
    .select({ c: count() })
    .from(scans)
    .where(eq(scans.riskLevel, "HIGH"));
  const medCount = await db
    .select({ c: count() })
    .from(scans)
    .where(eq(scans.riskLevel, "MEDIUM"));
  const lowCount = await db
    .select({ c: count() })
    .from(scans)
    .where(eq(scans.riskLevel, "LOW"));

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

router.post("/scans", async (req, res): Promise<void> => {
  const parsed = CreateScanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { githubUrl } = parsed.data;

  // Derive repo name from URL
  const cleaned = githubUrl.replace(/\.git$/, "").replace(/\/$/, "");
  const parts = cleaned.split("/");
  const repoName = `${parts[parts.length - 2] ?? "unknown"}/${parts[parts.length - 1] ?? "repo"}`;

  const [scan] = await db
    .insert(scans)
    .values({ githubUrl, repoName, status: "running" })
    .returning();

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

  // Run scan in background (fire and forget)
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
          completedAt: new Date(),
        })
        .where(eq(scans.id, scan!.id));

      logger.info({ scanId: scan!.id, score: index.summary.gdprScore }, "Scan complete");
    } catch (err) {
      logger.error({ err, scanId: scan!.id }, "Scan failed");
      await db
        .update(scans)
        .set({
          status: "failed",
          error: String(err),
          completedAt: new Date(),
        })
        .where(eq(scans.id, scan!.id));
    }
  });
});

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

  res.json(
    GetScanResponse.parse({
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
    }),
  );
});

router.delete("/scans/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteScanParams.safeParse({ id: parseInt(raw!, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(scans)
    .where(eq(scans.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
