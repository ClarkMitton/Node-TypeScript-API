#!/usr/bin/env node
import chalk from "chalk";
import path from "path";
import fs from "fs/promises";
import { runFullScan, type RepoIndex, type RiskLevel } from "@workspace/gdpr-scanner";

const LEVEL_COLOR: Record<string, (s: string) => string> = {
  LOW: chalk.green,
  MEDIUM: chalk.yellow,
  HIGH: chalk.red,
  NEEDS_REVIEW: chalk.magenta,
  INSUFFICIENT_EVIDENCE: chalk.gray,
};

function levelColor(level: string): (s: string) => string {
  return LEVEL_COLOR[level] ?? chalk.white;
}

function levelLabel(level: RiskLevel): string {
  if (level === "NEEDS_REVIEW") return "NEEDS REVIEW";
  if (level === "INSUFFICIENT_EVIDENCE") return "NOT ENOUGH EVIDENCE";
  return level;
}

async function saveIndex(index: RepoIndex): Promise<string> {
  const dir = path.resolve(process.cwd(), "output");
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, "index.json");
  await fs.writeFile(filePath, JSON.stringify(index, null, 2), "utf-8");
  return filePath;
}

async function main() {
  const githubUrl = process.argv[2];

  if (!githubUrl) {
    console.error(chalk.red("Usage: node scan.js <github-url>"));
    console.error(chalk.gray("  e.g. node scan.js https://github.com/user/repo"));
    process.exit(1);
  }

  console.log(chalk.bold.cyan("\n🔍 GDPR Repo Intelligence Scanner"));
  console.log(chalk.gray("─".repeat(50)));

  const reposDir = path.resolve(process.cwd(), "repos");
  const index = await runFullScan(githubUrl, reposDir, (p) => {
    console.log(chalk.gray(`  • ${p.message}`));
  });

  const outputPath = await saveIndex(index);
  console.log(chalk.green(`  ✓ Index saved → ${outputPath}`));

  const { summary, verifiedFlows, dependencies, auditSummary } = index;
  const levelFn = levelColor(summary.riskLevel);

  console.log(chalk.bold.cyan("\n╔══════════════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("║              GDPR RISK REPORT                ║"));
  console.log(chalk.bold.cyan("╚══════════════════════════════════════════════╝"));

  console.log(`\n  ${chalk.bold("Repository:")}     ${summary ? index.repo : "?"}`);
  console.log(`  ${chalk.bold("GDPR Score:")}     ${levelFn(String(summary.gdprScore) + "/100")}`);
  console.log(`  ${chalk.bold("Risk Level:")}     ${chalk.bold(levelFn(levelLabel(summary.riskLevel)))}`);
  console.log(`  ${chalk.bold("Verified flows:")} ${verifiedFlows.length}  ${chalk.gray(`(${auditSummary.aiFlowCount} via AI services)`)}`);

  // Score breakdown
  console.log(chalk.bold("\n  Score Breakdown:"));
  const bd = summary.breakdown;
  const rows: [string, number][] = [
    ["AI services", bd["ai"] ?? 0],
    ["External Transfer", bd["externalTransfer"] ?? 0],
    ["Persistence/Storage", bd["persistence"] ?? 0],
    ["Identity Handling", bd["identity"] ?? 0],
    ["Logging", bd["logging"] ?? 0],
    ["Dependencies", bd["dependencies"] ?? 0],
  ];
  for (const [label, score] of rows) {
    const bar = score > 0 ? chalk.yellow("█".repeat(Math.ceil(score / 5))) : chalk.gray("░");
    console.log(`    ${label.padEnd(22)} ${String(score).padStart(3)} pts  ${bar}`);
  }

  // Verified flows (AI highlighted)
  if (verifiedFlows.length > 0) {
    console.log(chalk.bold("\n  Confirmed Data Flows:"));
    for (const f of verifiedFlows) {
      const aiBadge = f.isAI ? chalk.magenta(` [AI: ${f.aiProvider ?? "provider"}]`) : "";
      const sens = [
        f.tags.includes("SPECIAL_CATEGORY_DATA") ? chalk.red(" [SPECIAL CATEGORY]") : "",
        f.tags.includes("CHILDREN_DATA") ? chalk.yellow(" [CHILDREN/STUDENTS]") : "",
      ].join("");
      const review = f.needsReview ? chalk.magenta(" ⟳ needs review") : "";
      console.log(`    ${chalk.cyan("→")} ${f.source} → ${f.sink}${aiBadge}${sens}${review}`);
      console.log(`      ${chalk.gray(`${f.file}:${f.line}`)}`);
    }
  }

  // Flagged dependencies
  if (dependencies.length > 0) {
    console.log(chalk.bold("\n  Flagged Dependencies:"));
    for (const dep of dependencies) {
      console.log(`    ${chalk.yellow("●")} ${dep.name.padEnd(28)} [${dep.category}]`);
    }
  }

  // DPO action items
  const actions = auditSummary.dpoSummary.actionItems;
  if (actions.length > 0) {
    console.log(chalk.bold("\n  What to do next:"));
    for (const a of actions) {
      const pri = a.priority === "HIGH" ? chalk.red("HIGH") : a.priority === "MEDIUM" ? chalk.yellow("MED ") : chalk.green("LOW ");
      console.log(`    [${pri}] ${a.action}`);
    }
  }

  // DPIA screening
  const screening = auditSummary.dpiaScreening;
  console.log(chalk.bold("\n  Do you need a DPIA?"));
  if (screening.dpiaRecommended) {
    console.log(`    ${chalk.red("⚠ A DPIA looks likely to be required.")} Detected:`);
    for (const t of screening.detectedTriggers) console.log(`      ${chalk.gray("•")} ${t}`);
  } else {
    console.log(chalk.gray("    No automatic DPIA triggers detected — confirm the questions below."));
  }
  console.log(chalk.gray("    Confirm against your DPIA screening questions:"));
  for (const q of screening.questions) {
    console.log(`      ${chalk.gray("?")} ${q.question}`);
  }

  console.log(chalk.gray("\n  Full findings: output/index.json"));
  console.log(chalk.bold.cyan("─".repeat(50) + "\n"));
}

main().catch((err) => {
  console.error(chalk.red("\n✗ Scanner failed:"), err);
  process.exit(1);
});
