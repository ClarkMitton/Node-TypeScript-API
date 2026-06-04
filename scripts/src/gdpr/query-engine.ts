import type { Finding, DependencyFinding, RepoIndex } from "./types.js";

type FilterTerm =
  | "external"
  | "storage"
  | "logging"
  | "identity"
  | "high risk"
  | "dependency"
  | string;

const FILTER_MAP: Record<string, string[]> = {
  external:    ["external-transfer"],
  storage:     ["persistence"],
  logging:     ["logging"],
  identity:    ["identity"],
  "high risk": [],
  dependency:  ["dependency"],
};

export class QueryEngine {
  private index: RepoIndex;

  constructor(index: RepoIndex) {
    this.index = index;
  }

  /** Return all findings */
  getAllFindings(): Finding[] {
    return [...this.index.findings];
  }

  /**
   * Query findings by a filter term.
   * Supported: "external", "storage", "logging", "identity", "high risk", "dependency"
   */
  queryFindings(filter: FilterTerm): Finding[] {
    const term = filter.toLowerCase().trim();

    if (term === "high risk") {
      return this.index.findings.filter((f) => f.riskScore >= 15);
    }

    const categories = FILTER_MAP[term];
    if (categories !== undefined) {
      if (categories.length === 0) return [];
      return this.index.findings.filter((f) => categories.includes(f.category));
    }

    // Fallback: search in type or evidence strings
    return this.index.findings.filter(
      (f) =>
        f.type.includes(term) ||
        f.evidence.toLowerCase().includes(term) ||
        f.category.includes(term)
    );
  }

  /** Return all findings for a given file path (exact or partial match) */
  getFindingsByFile(filePath: string): Finding[] {
    return this.index.findings.filter(
      (f) => f.file === filePath || f.file.includes(filePath)
    );
  }

  /** Return the GDPR summary + top risk breakdown */
  getGDPRSummary(): {
    repo: string;
    gdprScore: number;
    riskLevel: string;
    totalFindings: number;
    breakdown: Record<string, number>;
    topRisks: Finding[];
  } {
    const sorted = [...this.index.findings].sort((a, b) => b.riskScore - a.riskScore);
    return {
      repo: this.index.repo,
      gdprScore: this.index.summary.gdprScore,
      riskLevel: this.index.summary.riskLevel,
      totalFindings: this.index.summary.totalFindings,
      breakdown: this.index.summary.breakdown,
      topRisks: sorted.slice(0, 10),
    };
  }

  /** Return all flagged dependencies */
  getDependencies(): DependencyFinding[] {
    return [...this.index.dependencies];
  }

  /** Get findings grouped by category */
  groupByCategory(): Record<string, Finding[]> {
    const groups: Record<string, Finding[]> = {};
    for (const f of this.index.findings) {
      if (!groups[f.category]) groups[f.category] = [];
      groups[f.category]!.push(f);
    }
    return groups;
  }

  /** Get unique files that have findings */
  getAffectedFiles(): string[] {
    return [...new Set(this.index.findings.map((f) => f.file))].sort();
  }
}
