import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetScan, getGetScanQueryKey, useDeleteScan, getListScansQueryKey, getGetScanStatsQueryKey } from "@workspace/api-client-react";
import { RiskBadge } from "@/components/risk-badge";
import { ScoreGauge } from "@/components/score-gauge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Trash2, Github, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";

type Finding = { type: string; category: string; file: string; line?: number | null; evidence: string; riskScore: number };
type Dep = { name: string; category: string; gdprRelevance: number };

const CATEGORY_COLORS: Record<string, string> = {
  "external-transfer": "#58a6ff",
  persistence: "#e3b341",
  identity: "#f97583",
  logging: "#bc8cff",
  dependency: "#56d364",
  static: "#8b949e",
};

function CategoryBar({ findings }: { findings: Finding[] }) {
  const counts: Record<string, number> = {};
  for (const f of findings) {
    counts[f.category] = (counts[f.category] ?? 0) + 1;
  }
  const data = Object.entries(counts).map(([cat, count]) => ({ cat, count }));
  if (data.length === 0) return null;

  return (
    <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
      <h3 className="text-xs text-[#8b949e] uppercase tracking-widest mb-3 font-medium">
        Findings by Category
      </h3>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ left: -10 }}>
          <XAxis dataKey="cat" tick={{ fill: "#8b949e", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#484f58", fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: "#1c2128", border: "1px solid #30363d", borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: "#c9d1d9" }}
            itemStyle={{ color: "#8b949e" }}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.cat} fill={CATEGORY_COLORS[d.cat] ?? "#58a6ff"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ScanDetail() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0", 10);
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const { data: scan, isLoading, refetch } = useGetScan(id, {
    query: { enabled: !!id, queryKey: getGetScanQueryKey(id) },
  });

  const deleteScan = useDeleteScan();

  // Poll while pending/running
  useEffect(() => {
    if (!scan || scan.status === "done" || scan.status === "failed") return;
    const interval = setInterval(() => {
      void refetch();
    }, 2000);
    return () => clearInterval(interval);
  }, [scan?.status, refetch]);

  function handleDelete() {
    if (!confirm("Delete this scan?")) return;
    deleteScan.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListScansQueryKey() });
          qc.invalidateQueries({ queryKey: getGetScanStatsQueryKey() });
          setLocation("/");
        },
      },
    );
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
            Downloading, analyzing, and scoring. This may take up to 60 seconds.
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
                <p className="text-xs text-[#484f58] uppercase tracking-widest">Total Findings</p>
                <p className="text-lg font-semibold text-[#e6edf3] mt-1">{scan.totalFindings ?? 0}</p>
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

          {/* Category bar chart */}
          {findings.length > 0 && <CategoryBar findings={findings} />}

          {/* Dependencies */}
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

          {/* Findings table */}
          {findings.length > 0 && (
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-[#21262d] flex items-center justify-between">
                <h3 className="text-xs text-[#8b949e] uppercase tracking-widest font-medium">
                  Findings ({findings.length})
                </h3>
              </div>
              <div className="divide-y divide-[#21262d] max-h-96 overflow-auto">
                {findings
                  .sort((a, b) => b.riskScore - a.riskScore)
                  .map((f, i) => (
                    <div key={i} className="px-4 py-3 space-y-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="text-[10px] font-medium uppercase tracking-wider shrink-0"
                            style={{ color: CATEGORY_COLORS[f.category] ?? "#8b949e" }}
                          >
                            {f.category}
                          </span>
                          <span className="text-xs text-[#8b949e] font-mono truncate">{f.type}</span>
                        </div>
                        <span
                          className="text-xs font-mono shrink-0"
                          style={{ color: f.riskScore >= 15 ? "#f97583" : f.riskScore >= 10 ? "#e3b341" : "#8b949e" }}
                        >
                          +{f.riskScore}
                        </span>
                      </div>
                      <p className="text-xs text-[#484f58] font-mono truncate">
                        {f.file}
                        {f.line != null ? `:${f.line}` : ""}
                      </p>
                      <p className="text-xs text-[#6e7681] font-mono bg-[#0d1117] px-2 py-1 rounded truncate">
                        {f.evidence}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {findings.length === 0 && (
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg px-6 py-8 text-center">
              <p className="text-sm text-[#3fb950]">No GDPR-relevant findings detected.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
