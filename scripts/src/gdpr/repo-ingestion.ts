import { simpleGit } from "simple-git";
import AdmZip from "adm-zip";
import path from "path";
import fs from "fs/promises";

export function extractRepoName(githubUrl: string): string {
  const cleaned = githubUrl.replace(/\.git$/, "").replace(/\/$/, "");
  const parts = cleaned.split("/");
  const owner = parts[parts.length - 2] ?? "unknown";
  const repo = parts[parts.length - 1] ?? "repo";
  return `${owner}__${repo}`;
}

function parseGithubUrl(githubUrl: string): { owner: string; repo: string } {
  const cleaned = githubUrl.replace(/\.git$/, "").replace(/\/$/, "");
  const parts = cleaned.split("/");
  return {
    owner: parts[parts.length - 2] ?? "unknown",
    repo: parts[parts.length - 1] ?? "repo",
  };
}

export async function cloneRepo(githubUrl: string): Promise<string> {
  const repoName = extractRepoName(githubUrl);
  const reposDir = path.resolve(process.cwd(), "repos");
  const repoPath = path.join(reposDir, repoName);

  await fs.mkdir(reposDir, { recursive: true });

  // If already exists, skip download
  try {
    await fs.access(repoPath);
    console.log(`  Repo already present at ${repoPath}, reusing.`);
    return repoPath;
  } catch {
    // not yet downloaded
  }

  const token = process.env["GITHUB_TOKEN"];

  // Try git clone first when a token is available (handles private repos)
  if (token) {
    try {
      const authedUrl = githubUrl.replace("https://", `https://${token}@`);
      console.log(`  Cloning (git) ${githubUrl} → ${repoPath}`);
      const git = simpleGit();
      await git.clone(authedUrl, repoPath, ["--depth", "1"]);
      return repoPath;
    } catch (err) {
      console.warn(`  Git clone failed, falling back to zip download: ${String(err)}`);
    }
  }

  // Fall back to GitHub zip API (public repos, no auth required)
  await downloadViaZip(githubUrl, repoPath);
  return repoPath;
}

async function downloadViaZip(githubUrl: string, repoPath: string): Promise<void> {
  const { owner, repo } = parseGithubUrl(githubUrl);
  // HEAD always resolves to the default branch regardless of name
  const zipUrl = `https://github.com/${owner}/${repo}/archive/HEAD.zip`;
  const fallbackUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/main`;

  let zipBuffer: ArrayBuffer;
  for (const url of [zipUrl, fallbackUrl]) {
    console.log(`  Downloading archive: ${url}`);
    const res = await fetch(url, {
      headers: { "User-Agent": "gdpr-scanner/1.0" },
      redirect: "follow",
    });
    if (res.ok) {
      zipBuffer = await res.arrayBuffer();
      break;
    }
    console.warn(`  HTTP ${res.status} for ${url}, trying next…`);
  }

  // @ts-expect-error — assigned in loop above, guaranteed before use
  if (!zipBuffer) {
    throw new Error(`Could not download zip archive for ${githubUrl}. Check the URL and that the repo is public.`);
  }

  // Extract into a temp dir then move to final path
  const zip = new AdmZip(Buffer.from(zipBuffer));
  const entries = zip.getEntries();
  if (entries.length === 0) throw new Error("Empty zip archive received.");

  // GitHub zips have a top-level folder like "repo-main/" — detect it
  const topLevel = entries[0]!.entryName.split("/")[0] ?? "";
  const tmpDir = repoPath + "__tmp";
  zip.extractAllTo(tmpDir, true);

  const extractedRoot = path.join(tmpDir, topLevel);
  await fs.rename(extractedRoot, repoPath);
  await fs.rm(tmpDir, { recursive: true, force: true });

  console.log(`  Extracted to ${repoPath}`);
}
