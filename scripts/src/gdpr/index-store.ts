import fs from "fs/promises";
import path from "path";
import type { RepoIndex } from "./types.js";

export async function saveIndex(index: RepoIndex, outputDir?: string): Promise<string> {
  const dir = outputDir ?? path.resolve(process.cwd(), "output");
  await fs.mkdir(dir, { recursive: true });

  const filePath = path.join(dir, "index.json");
  await fs.writeFile(filePath, JSON.stringify(index, null, 2), "utf-8");
  return filePath;
}

export async function loadIndex(outputDir?: string): Promise<RepoIndex | null> {
  const dir = outputDir ?? path.resolve(process.cwd(), "output");
  const filePath = path.join(dir, "index.json");

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as RepoIndex;
  } catch {
    return null;
  }
}
