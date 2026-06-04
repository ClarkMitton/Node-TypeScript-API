import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListScans,
  useGetScanStats,
  useCreateScan,
  getListScansQueryKey,
  getGetScanStatsQueryKey,
} from "@workspace/api-client-react";
import { RiskBadge } from "@/components/risk-badge";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Github, Scan, TrendingUp, AlertTriangle, Shield, Loader2 } from "lucide-react";

const scanSchema = z.object({
  githubUrl: z.string().url("Enter a valid GitHub URL"),
});
type ScanForm = z.infer<typeof scanSchema>;

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-[#161b22] border border-[#21262d] rounded-lg px-5 py-4 flex items-center gap-4">
      <div className={`p-2 rounded-md ${color} bg-opacity-10`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-[#e6edf3]">{value}</p>
        <p className="text-xs text-[#8b949e] mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { data: stats, isLoading: statsLoading } = useGetScanStats();
  const { data: scans, isLoading: scansLoading } = useListScans();
  const createScan = useCreateScan();
  const [pendingId, setPendingId] = useState<number | null>(null);

  const form = useForm<ScanForm>({
    resolver: zodResolver(scanSchema),
    defaultValues: { githubUrl: "" },
  });

  async function onSubmit(values: ScanForm) {
    createScan.mutate(
      { data: { githubUrl: values.githubUrl } },
      {
        onSuccess: (scan) => {
          qc.invalidateQueries({ queryKey: getListScansQueryKey() });
          qc.invalidateQueries({ queryKey: getGetScanStatsQueryKey() });
          setPendingId(scan.id);
          form.reset();
          setLocation(`/scans/${scan.id}`);
        },
      },
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-[#e6edf3]">Dashboard</h1>
        <p className="text-sm text-[#8b949e] mt-1">
          Scan any public GitHub repository for GDPR-relevant behaviours.
        </p>
      </div>

      {/* Scan input */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          <Github className="h-4 w-4 text-[#58a6ff]" />
          <span className="text-sm font-medium text-[#c9d1d9]">Scan a Repository</span>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-3">
            <FormField
              control={form.control}
              name="githubUrl"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="https://github.com/owner/repo"
                      className="bg-[#0d1117] border-[#30363d] text-[#c9d1d9] placeholder:text-[#484f58] focus-visible:ring-[#388bfd] h-9"
                    />
                  </FormControl>
                  <FormMessage className="text-[#f97583] text-xs" />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              disabled={createScan.isPending}
              className="bg-[#1f6feb] hover:bg-[#388bfd] text-white h-9 px-4 text-sm"
            >
              {createScan.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Scan className="h-3.5 w-3.5 mr-1.5" />
                  Scan
                </>
              )}
            </Button>
          </form>
        </Form>
      </div>

      {/* Stats */}
      {statsLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 bg-[#161b22]" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Total Scans"
            value={stats.totalScans}
            icon={Scan}
            color="text-[#58a6ff]"
          />
          <StatCard
            label="Avg Risk Score"
            value={Math.round(stats.avgScore)}
            icon={TrendingUp}
            color="text-[#e3b341]"
          />
          <StatCard
            label="High Risk"
            value={stats.highRiskCount}
            icon={AlertTriangle}
            color="text-[#f97583]"
          />
          <StatCard
            label="Low Risk"
            value={stats.lowRiskCount}
            icon={Shield}
            color="text-[#3fb950]"
          />
        </div>
      ) : null}

      {/* Recent scans */}
      <div>
        <h2 className="text-sm font-medium text-[#8b949e] uppercase tracking-widest mb-3">
          Recent Scans
        </h2>
        {scansLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 bg-[#161b22]" />
            ))}
          </div>
        ) : scans && scans.length > 0 ? (
          <div className="bg-[#161b22] border border-[#21262d] rounded-lg divide-y divide-[#21262d]">
            {scans.map((scan) => (
              <Link
                key={scan.id}
                href={`/scans/${scan.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-[#1c2128] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Github className="h-4 w-4 text-[#484f58] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-[#c9d1d9] truncate">{scan.repoName}</p>
                    <p className="text-xs text-[#484f58] truncate">{scan.githubUrl}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  {scan.status === "pending" || scan.status === "running" ? (
                    <span className="flex items-center gap-1.5 text-xs text-[#e3b341]">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {scan.status}
                    </span>
                  ) : scan.status === "failed" ? (
                    <span className="text-xs text-[#f97583]">Failed</span>
                  ) : (
                    <>
                      <span className="text-sm font-mono text-[#e6edf3]">
                        {scan.gdprScore ?? "—"}
                      </span>
                      <RiskBadge level={scan.riskLevel} />
                    </>
                  )}
                  <span className="text-xs text-[#484f58] hidden sm:block">
                    {new Date(scan.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-[#161b22] border border-[#21262d] rounded-lg px-6 py-10 text-center">
            <Scan className="h-8 w-8 text-[#30363d] mx-auto mb-3" />
            <p className="text-sm text-[#8b949e]">No scans yet. Paste a GitHub URL above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
