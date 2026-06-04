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

export async function cloneRepo(
  githubUrl: string,
  reposBaseDir: string,
  onLog?: (msg: string) => void,
): Promise<string> {
  const repoName = extractRepoName(githubUrl);
  const reposDir = path.resolve(reposBaseDir);
  const repoPath = path.join(reposDir, repoName);

  await fs.mkdir(reposDir, { recursive: true });

  try {
    await fs.access(repoPath);
    onLog?.(`Repo already present at ${repoPath}, reusing.`);
    return repoPath;
  } catch {
    // not yet downloaded
  }

  const token = process.env["GITHUB_TOKEN"];

  if (token) {
    try {
      const authedUrl = githubUrl.replace("https://", `https://${token}@`);
      onLog?.(`Cloning (git) ${githubUrl}`);
      const git = simpleGit();
      await git.clone(authedUrl, repoPath, ["--depth", "1"]);
      return repoPath;
    } catch (err) {
      onLog?.(`Git clone failed, falling back to zip: ${String(err)}`);
    }
  }

  await downloadViaZip(githubUrl, repoPath, onLog);
  return repoPath;
}

async function downloadViaZip(
  githubUrl: string,
  repoPath: string,
  onLog?: (msg: string) => void,
): Promise<void> {
  const { owner, repo } = parseGithubUrl(githubUrl);
  const zipUrl = `https://github.com/${owner}/${repo}/archive/HEAD.zip`;
  const fallbackUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/main`;

  let zipBuffer: ArrayBuffer | undefined;
  for (const url of [zipUrl, fallbackUrl]) {
    onLog?.(`Downloading archive: ${url}`);
    const res = await fetch(url, {
      headers: { "User-Agent": "gdpr-scanner/1.0" },
      redirect: "follow",
    });
    if (res.ok) {
      zipBuffer = await res.arrayBuffer();
      break;
    }
    onLog?.(`HTTP ${res.status} for ${url}, trying next…`);
  }

  if (!zipBuffer) {
    throw new Error(
      `Could not download zip archive for ${githubUrl}. Check the URL and that the repo is public.`,
    );
  }

  const zip = new AdmZip(Buffer.from(zipBuffer));
  const entries = zip.getEntries();
  if (entries.length === 0) throw new Error("Empty zip archive received.");

  const topLevel = entries[0]!.entryName.split("/")[0] ?? "";
  const tmpDir = repoPath + "__tmp";
  zip.extractAllTo(tmpDir, true);

  const extractedRoot = path.join(tmpDir, topLevel);
  await fs.rename(extractedRoot, repoPath);
  await fs.rm(tmpDir, { recursive: true, force: true });

  onLog?.(`Extracted to ${repoPath}`);
}
