import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseManifest, AgentSpecError, type AgentManifest } from "./schema/manifest.js";
import { parseCronJobs, type CronJob } from "./schema/cron.js";

export interface AgentProject {
  root: string;
  manifest: AgentManifest;
  soulFiles: { relPath: string; content: string }[];
  cronJobs: CronJob[];
  inlineSkillDirs: string[];
  assetEntries: string[];
}

async function readMdTree(dir: string, base = ""): Promise<{ relPath: string; content: string }[]> {
  const out: { relPath: string; content: string }[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await readMdTree(join(dir, entry.name), rel));
    else if (entry.name.endsWith(".md"))
      out.push({ relPath: rel, content: await readFile(join(dir, entry.name), "utf8") });
  }
  return out.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

export async function loadAgentProject(dir: string): Promise<AgentProject> {
  const root = resolve(dir);
  const manifestPath = join(root, "agent.yaml");
  if (!existsSync(manifestPath))
    throw new AgentSpecError(`agent.yaml not found in ${root}`);
  const manifest = parseManifest(await readFile(manifestPath, "utf8"));

  const soulDir = join(root, "soul");
  const soulFiles = existsSync(soulDir) ? await readMdTree(soulDir) : [];

  let cronJobs: CronJob[] = [];
  if (manifest.cron) {
    const cronPath = join(root, manifest.cron);
    if (!existsSync(cronPath))
      throw new AgentSpecError(`manifest cron file not found: ${manifest.cron}`);
    cronJobs = parseCronJobs(await readFile(cronPath, "utf8"));
  }

  const inlineSkillDirs: string[] = [];
  for (const name of manifest.skills.inline) {
    const skillDir = join(root, "skills", name);
    if (!existsSync(join(skillDir, "SKILL.md")))
      throw new AgentSpecError(`inline skill "${name}" missing SKILL.md at skills/${name}/`);
    inlineSkillDirs.push(skillDir);
  }

  for (const s of manifest.setup.python) {
    if (!existsSync(join(root, s.requirements)))
      throw new AgentSpecError(`setup.python "${s.name}" requirements file not found: ${s.requirements}`);
  }

  const assetsDir = join(root, "assets");
  let assetEntries: string[] = [];
  if (existsSync(assetsDir) && (await stat(assetsDir)).isDirectory())
    assetEntries = (await readdir(assetsDir)).sort();

  return { root, manifest, soulFiles, cronJobs, inlineSkillDirs, assetEntries };
}
