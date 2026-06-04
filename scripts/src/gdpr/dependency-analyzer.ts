import fs from "fs/promises";
import path from "path";
import type { DependencyFinding } from "./types.js";

interface DepRule {
  pattern: RegExp;
  category: string;
  gdprRelevance: number;
}

const DEP_RULES: DepRule[] = [
  // AI / LLM
  { pattern: /^openai$|^@openai\//,           category: "AI/LLM provider",     gdprRelevance: 20 },
  { pattern: /^@anthropic-ai\//,               category: "AI/LLM provider",     gdprRelevance: 20 },
  { pattern: /^cohere-ai$|^@cohere-ai\//,      category: "AI/LLM provider",     gdprRelevance: 18 },
  { pattern: /^langchain/,                      category: "AI/LLM provider",     gdprRelevance: 18 },
  { pattern: /^replicate$/,                     category: "AI/LLM provider",     gdprRelevance: 15 },

  // Analytics
  { pattern: /^analytics$/,                    category: "Analytics",            gdprRelevance: 20 },
  { pattern: /^@segment\//,                    category: "Analytics",            gdprRelevance: 20 },
  { pattern: /^mixpanel-browser$|^mixpanel$/,  category: "Analytics",            gdprRelevance: 18 },
  { pattern: /^ga-4$|^react-ga|^gtag/,         category: "Analytics",            gdprRelevance: 15 },
  { pattern: /^posthog-js$|^posthog-node$/,    category: "Analytics",            gdprRelevance: 15 },
  { pattern: /^amplitude-js$|^@amplitude\//,   category: "Analytics",            gdprRelevance: 15 },

  // Backend / data
  { pattern: /^prisma$|^@prisma\//,            category: "Backend/data",         gdprRelevance: 15 },
  { pattern: /^@supabase\//,                   category: "Backend/data",         gdprRelevance: 15 },
  { pattern: /^firebase$|^firebase-admin$/,    category: "Backend/data",         gdprRelevance: 15 },
  { pattern: /^mongoose$|^mongodb$/,           category: "Backend/data",         gdprRelevance: 12 },
  { pattern: /^pg$|^postgres$/,                category: "Backend/data",         gdprRelevance: 10 },
  { pattern: /^drizzle-orm$/,                  category: "Backend/data",         gdprRelevance: 10 },
  { pattern: /^typeorm$/,                       category: "Backend/data",         gdprRelevance: 10 },

  // Logging
  { pattern: /^winston$/,                      category: "Logging",              gdprRelevance: 10 },
  { pattern: /^pino$|^pino-http$/,             category: "Logging",              gdprRelevance: 10 },
  { pattern: /^bunyan$/,                        category: "Logging",              gdprRelevance: 10 },
  { pattern: /^@sentry\//,                     category: "Logging/Monitoring",   gdprRelevance: 15 },
  { pattern: /^datadog-lambda|^dd-trace$/,     category: "Logging/Monitoring",   gdprRelevance: 15 },

  // Auth
  { pattern: /^auth0$/,                        category: "Auth",                 gdprRelevance: 15 },
  { pattern: /^next-auth$|^@auth\//,           category: "Auth",                 gdprRelevance: 12 },
  { pattern: /^@clerk\//,                      category: "Auth",                 gdprRelevance: 12 },
  { pattern: /^passport$/,                     category: "Auth",                 gdprRelevance: 10 },
  { pattern: /^jsonwebtoken$|^jose$/,          category: "Auth/JWT",             gdprRelevance: 10 },
  { pattern: /^bcrypt$|^bcryptjs$/,            category: "Auth/Crypto",          gdprRelevance: 5  },
];

export async function analyzeDependencies(repoPath: string): Promise<DependencyFinding[]> {
  const findings: DependencyFinding[] = [];
  const pkgPath = path.join(repoPath, "package.json");

  let pkg: Record<string, unknown>;
  try {
    const raw = await fs.readFile(pkgPath, "utf-8");
    pkg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return findings;
  }

  const allDeps: string[] = [
    ...Object.keys((pkg.dependencies as Record<string, string>) ?? {}),
    ...Object.keys((pkg.devDependencies as Record<string, string>) ?? {}),
  ];

  for (const dep of allDeps) {
    for (const rule of DEP_RULES) {
      if (rule.pattern.test(dep)) {
        findings.push({
          name: dep,
          category: rule.category,
          gdprRelevance: rule.gdprRelevance,
        });
        break;
      }
    }
  }

  return findings;
}
