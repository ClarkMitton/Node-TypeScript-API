# GDPR Repo Intelligence Scanner

A Node.js + TypeScript tool that clones GitHub repositories and performs hybrid static + AST analysis to detect GDPR-relevant behaviours, score risk, flag AI/LLM data flows, and tell the user whether a DPIA is likely needed. There is **one** scanner engine — `@workspace/gdpr-scanner` (`lib/gdpr-scanner`) — used by both the CLI (`scripts/`) and the web app/API (`artifacts/api-server` + `artifacts/gdpr-ui`).

## Run & Operate

- `pnpm --filter @workspace/scripts run scan <github-url>` — run the full GDPR scan
- `pnpm --filter @workspace/scripts run typecheck` — typecheck the scanner
- `pnpm run typecheck` — full typecheck across all packages

### Example
```bash
pnpm --filter @workspace/scripts run scan https://github.com/expressjs/serve-static
```

### Optional: GITHUB_TOKEN env var
Set `GITHUB_TOKEN` to scan private repositories (public repos work without it).

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (api-server artifact, unused by scanner)
- CLI: tsx (TypeScript runner)
- AST: @babel/parser + custom recursive walker
- Git: simple-git (with zip-download fallback for public repos)
- Zip extraction: adm-zip
- File search: glob
- Output: chalk + JSON

## Where things live

- `scripts/src/scan.ts` — CLI entry point (`node scan.js <github-url>`); thin wrapper over `@workspace/gdpr-scanner` that prints a report and writes `output/index.json`
- `lib/gdpr-scanner/src/index.ts` — `runFullScan()` orchestrator + package barrel
- `lib/gdpr-scanner/src/types.ts` — shared types (`Finding`, `VerifiedFlow`, `AuditCard`, `AuditSummary`, `DPIAScreening`, `RepoIndex`, etc.)
- `lib/gdpr-scanner/src/repo-ingestion.ts` — GitHub repo download (zip API) + git clone fallback
- `lib/gdpr-scanner/src/static-scanner.ts` — regex-based file scanner (storage, backend, logging, config patterns)
- `lib/gdpr-scanner/src/dependency-analyzer.ts` — package.json dep classifier (AI/LLM, analytics, auth, logging, backend)
- `lib/gdpr-scanner/src/ast-analyzer.ts` — Babel AST flow analyzer: traces user-input sources → sinks, detects AI/LLM provider sinks, and tags special-category / children's data
- `lib/gdpr-scanner/src/gdpr-rule-engine.ts` — scoring (0–100), audit cards, DPO summary, AI clarifying questions, and DPIA screening
- `output/index.json` — generated findings index (gitignored in production)
- `repos/` — cloned/downloaded repositories (ephemeral)

> Note: the older standalone engine that used to live in `scripts/src/gdpr/` has been removed. `scripts/` now depends on `@workspace/gdpr-scanner` so there is a single source of truth.

## Architecture decisions

- **Zip download over git clone** — public repos are fetched via `github.com/{owner}/{repo}/archive/HEAD.zip` so no GitHub credentials are required. Git clone with GITHUB_TOKEN is used as a fast path for private repos.
- **Custom AST walker instead of @babel/traverse** — avoids ESM/CJS interop issues with babel traverse in a `"type": "module"` package; the recursive walker covers all needed node types.
- **Regex + AST hybrid** — static scanner catches patterns in non-JS files (README, config, .env); AST analyzer handles code semantics like `fetch()`, db inserts, and identity field access.
- **Truth-only scoring** — only verified source→sink flows contribute to the score; capability patterns (a sink with no proven user-data source) score 0 and are reported as informational "potential signals". This keeps false positives low for a non-technical (DPO) audience.
- **AI as its own dimension** — AI provider sinks are matched before the generic rules (so `openai…create()` isn't mistaken for a DB write) and scored in a dedicated bucket that can't be diluted by other categories.

## Product

Scans any public GitHub repository and produces:
- A structured GDPR risk report with score (0–100) and level (LOW / MEDIUM / HIGH / NEEDS_REVIEW / INSUFFICIENT_EVIDENCE)
- **Verified flows only** are scored: a user-input source traced to a sink. Sinks without a proven source are listed as "potential signals" and score 0
- **AI/LLM data flows** are first-class: AI provider calls (SDK or endpoint) are detected as transfers, scored in their own bucket, and flagged NEEDS_REVIEW with clarifying questions (because code can't reveal what's in a prompt)
- **DPIA screening**: special-category and children's-data heuristics plus self-assessment questions mapped to the org's DPIA template; the report states whether a DPIA looks likely
- Plain-English audit cards + DPO summary (problems / working well / action items) with GDPR article references
- Per-finding evidence: file, line number, code snippet; dependency classification (AI/LLM, analytics, auth, backend, logging)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run from `scripts/` dir or use `pnpm --filter @workspace/scripts` from root
- `repos/` and `output/` are created at runtime in the process working directory
- The AST analyzer skips `node_modules`, `.git`, `dist`, `build`, `.next`, `coverage` dirs
- `@types/babel__parser` is a stub (deprecated) — types come from `@babel/parser` directly; the warning is harmless

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
