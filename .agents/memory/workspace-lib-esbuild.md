---
name: Workspace lib exports for esbuild
description: How to configure lib package exports so esbuild can resolve them when bundling the api-server.
---

The api-server uses esbuild (`build.mjs`) to bundle all dependencies into a single mjs. When a `lib/*` workspace package exports `"./dist/index.js"` (compiled output), esbuild fails with "module not found on the file system" because the dist directory may not exist yet.

**Rule:** Any `lib/*` package that is imported by `artifacts/api-server` must set its `exports` entry to point at the TypeScript source: `"./src/index.ts"` — not the compiled output. esbuild resolves and compiles TypeScript directly.

**Why:** esbuild bundles workspace packages inline; it does not rely on tsc-emitted JS. The `dist/` folder is only used for TypeScript declaration references. Using `./src/index.ts` lets esbuild find and bundle the source while `tsc --build` still uses `composite` + `declarationMap` for type-checking.

**How to apply:** When creating a new `lib/*` package that the api-server will import, always use `"exports": { ".": "./src/index.ts" }` in package.json, regardless of the tsconfig `outDir` setting.

Reference packages that do this correctly: `lib/integrations-openai-ai-server`, `lib/gdpr-scanner`.
