# GDPR Repo Intelligence Scanner

A Node.js + TypeScript CLI tool that clones GitHub repositories and performs hybrid static + AST analysis to detect GDPR-relevant behaviours, score risk, and expose findings through a queryable dataset.

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

- `scripts/src/scan.ts` — CLI entry point (`node scan.js <github-url>`)
- `scripts/src/gdpr/types.ts` — shared TypeScript types (`Finding`, `RepoIndex`, etc.)
- `scripts/src/gdpr/repo-ingestion.ts` — GitHub repo download (zip API) + git clone fallback
- `scripts/src/gdpr/static-scanner.ts` — regex-based file scanner (storage, backend, logging, config patterns)
- `scripts/src/gdpr/dependency-analyzer.ts` — package.json dep classifier (AI/LLM, analytics, auth, logging, backend)
- `scripts/src/gdpr/ast-analyzer.ts` — Babel AST walker detecting fetch/axios/fs/identity/logging patterns
- `scripts/src/gdpr/gdpr-rule-engine.ts` — GDPR risk scoring engine (0–100, LOW/MEDIUM/HIGH)
- `scripts/src/gdpr/index-store.ts` — saves/loads `output/index.json`
- `scripts/src/gdpr/query-engine.ts` — in-memory query API over findings
- `output/index.json` — generated findings index (gitignored in production)
- `repos/` — cloned/downloaded repositories (ephemeral)

## Architecture decisions

- **Zip download over git clone** — public repos are fetched via `github.com/{owner}/{repo}/archive/HEAD.zip` so no GitHub credentials are required. Git clone with GITHUB_TOKEN is used as a fast path for private repos.
- **Custom AST walker instead of @babel/traverse** — avoids ESM/CJS interop issues with babel traverse in a `"type": "module"` package; the recursive walker covers all needed node types.
- **Regex + AST hybrid** — static scanner catches patterns in non-JS files (README, config, .env); AST analyzer handles code semantics like `fetch()`, db inserts, and identity field access.
- **Score clamped 0–100** — mitigations (no external calls, no identity, no persistence) actively reduce the score so well-behaved repos aren't falsely flagged.
- **index.json as source of truth** — all downstream querying goes through `QueryEngine` which loads from `output/index.json`, keeping scan and query decoupled.

## Product

Scans any public GitHub repository and produces:
- A structured GDPR risk report with score (0–100) and level (LOW / MEDIUM / HIGH)
- Per-finding evidence: file, line number, AST node type, code snippet
- Dependency classification (AI/LLM, analytics, auth, backend, logging)
- `output/index.json` queryable via `QueryEngine` API
- CLI summary with top-10 risks sorted by severity

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run from `scripts/` dir or use `pnpm --filter @workspace/scripts` from root
- `repos/` and `output/` are created at runtime in the process working directory
- The AST analyzer skips `node_modules`, `.git`, `dist`, `build`, `.next`, `coverage` dirs
- `@types/babel__parser` is a stub (deprecated) — types come from `@babel/parser` directly; the warning is harmless

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
