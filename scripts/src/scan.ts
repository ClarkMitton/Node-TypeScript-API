#!/usr/bin/env node
import chalk from "chalk";
import { cloneRepo, extractRepoName } from "./gdpr/repo-ingestion.js";
import { runStaticScanner } from "./gdpr/static-scanner.js";
import { analyzeDependencies } from "./gdpr/dependency-analyzer.js";
import { runASTAnalyzer } from "./gdpr/ast-analyzer.js";
import { buildRepoIndex } from "./gdpr/gdpr-rule-engine.js";
import { saveIndex } from "./gdpr/index-store.js";
import { QueryEngine } from "./gdpr/query-engine.js";

const LEVEL_COLOR = {
  LOW: chalk.green,
  MEDIUM: chalk.yellow,
  HIGH: chalk.red,
};

async function main() {
  const githubUrl = process.argv[2];

  if (!githubUrl) {
    console.error(chalk.red("Usage: node scan.js <github-url>"));
    console.error(chalk.gray("  e.g. node scan.js https://github.com/user/repo"));
    process.exit(1);
  }

  console.log(chalk.bold.cyan("\n🔍 GDPR Repo Intelligence Scanner"));
  console.log(chalk.gray("─".repeat(50)));

  // Step 1: Clone
  console.log(chalk.bold("\n📥 Step 1/4: Cloning repository..."));
  const repoPath = await cloneRepo(githubUrl);
  const repoName = extractRepoName(githubUrl);
  console.log(chalk.green(`  ✓ Ready at ${repoPath}`));

  // Step 2: Static scan
  console.log(chalk.bold("\n📄 Step 2/4: Running static file scanner..."));
  const staticFindings = await runStaticScanner(repoPath);
  console.log(chalk.green(`  ✓ ${staticFindings.length} static findings`));

  // Step 3: Dependency analysis + AST in parallel
  console.log(chalk.bold("\n🔬 Step 3/4: Analyzing dependencies & AST..."));
  const [deps, astFindings] = await Promise.all([
    analyzeDependencies(repoPath),
    runASTAnalyzer(repoPath),
  ]);
  console.log(chalk.green(`  ✓ ${deps.length} flagged dependencies`));
  console.log(chalk.green(`  ✓ ${astFindings.length} AST findings`));

  // Deduplicate: AST findings at same file+line+type as static findings get merged
  const allFindings = deduplicateFindings([...staticFindings, ...astFindings]);

  // Step 4: Build index + score
  console.log(chalk.bold("\n⚖️  Step 4/4: Computing GDPR risk score..."));
  const index = buildRepoIndex(repoName, allFindings, deps);
  const outputPath = await saveIndex(index);
  console.log(chalk.green(`  ✓ Index saved → ${outputPath}`));

  // Print report
  const qe = new QueryEngine(index);
  const summary = qe.getGDPRSummary();
  const levelFn = LEVEL_COLOR[summary.riskLevel as keyof typeof LEVEL_COLOR] ?? chalk.white;

  console.log(chalk.bold.cyan("\n╔══════════════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("║           GDPR RISK REPORT                   ║"));
  console.log(chalk.bold.cyan("╚══════════════════════════════════════════════╝"));

  console.log(`\n  ${chalk.bold("Repository:")}   ${repoName}`);
  console.log(`  ${chalk.bold("Total findings:")} ${chalk.white(summary.totalFindings)}`);
  console.log(`  ${chalk.bold("GDPR Score:")}   ${levelFn(String(summary.gdprScore) + "/100")}`);
  console.log(`  ${chalk.bold("Risk Level:")}   ${levelFn.bold(summary.riskLevel)}`);

  // Breakdown table
  console.log(chalk.bold("\n  Score Breakdown:"));
  const bd = summary.breakdown;
  const rows = [
    ["External Transfer",  bd["externalTransfer"] ?? 0],
    ["Persistence/Storage", bd["persistence"] ?? 0],
    ["Identity Handling",  bd["identity"] ?? 0],
    ["Logging",           bd["logging"] ?? 0],
    ["Dependencies",      bd["dependencies"] ?? 0],
  ] as [string, number][];
  for (const [label, score] of rows) {
    const bar = score > 0 ? chalk.yellow("█".repeat(Math.ceil(score / 5))) : chalk.gray("░");
    console.log(`    ${label.padEnd(22)} ${String(score).padStart(3)} pts  ${bar}`);
  }

  // Flagged dependencies
  if (deps.length > 0) {
    console.log(chalk.bold("\n  Flagged Dependencies:"));
    for (const dep of deps) {
      console.log(
        `    ${chalk.yellow("●")} ${dep.name.padEnd(30)} [${dep.category}]  relevance: ${dep.gdprRelevance}`
      );
    }
  }

  // Top 10 risks
  if (summary.topRisks.length > 0) {
    console.log(chalk.bold("\n  Top Risks (by severity):"));
    for (let i = 0; i < summary.topRisks.length; i++) {
      const r = summary.topRisks[i]!;
      const badge = r.riskScore >= 15 ? chalk.red("HIGH") : r.riskScore >= 10 ? chalk.yellow("MED ") : chalk.green("LOW ");
      console.log(
        `    ${String(i + 1).padStart(2)}. [${badge}] ${r.type.padEnd(28)} ${chalk.gray(r.file)}${r.line ? chalk.gray(":" + r.line) : ""}`
      );
      if (r.evidence) {
        console.log(`        ${chalk.gray("↳")} ${chalk.dim(r.evidence.slice(0, 80))}`);
      }
    }
  }

  // Category breakdown
  const grouped = qe.groupByCategory();
  console.log(chalk.bold("\n  Findings by Category:"));
  for (const [cat, items] of Object.entries(grouped).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`    ${chalk.cyan(cat.padEnd(20))} ${items.length} finding(s)`);
  }

  const affected = qe.getAffectedFiles();
  console.log(chalk.bold(`\n  Affected Files: ${affected.length}`));
  for (const f of affected.slice(0, 8)) {
    console.log(`    ${chalk.gray("•")} ${f}`);
  }
  if (affected.length > 8) {
    console.log(chalk.gray(`    ... and ${affected.length - 8} more (see output/index.json)`));
  }

  console.log(chalk.gray("\n  Full findings: output/index.json"));
  console.log(chalk.bold.cyan("─".repeat(50) + "\n"));
}

function deduplicateFindings(findings: ReturnType<typeof runStaticScanner> extends Promise<infer T> ? T : never[]) {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.file}:${f.line ?? 0}:${f.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

main().catch((err) => {
  console.error(chalk.red("\n✗ Scanner failed:"), err);
  process.exit(1);
});
