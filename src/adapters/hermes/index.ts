import { mkdir, writeFile, cp, readdir } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import type { Adapter, BuildInput, BuildResult } from "../adapter.js";
import { registerAdapter } from "../adapter.js";
import { buildHermesConfig } from "./config.js";
import { buildHermesCronJobs } from "./cron.js";
import { buildEnvExample } from "../../envfile.js";
import { createLock, serializeLock } from "../../lock.js";

async function writeInto(outDir: string, relPath: string, content: string): Promise<void> {
  const abs = join(outDir, relPath);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content);
}

async function listFiles(dir: string, base = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...await listFiles(join(dir, e.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

export const hermesAdapter: Adapter = {
  target: "hermes",
  async build({ project, resolvedSkills }: BuildInput, outDir: string): Promise<BuildResult> {
    const { manifest } = project;

    const soul = project.soulFiles.map((f) => f.content).join("\n\n---\n\n");
    await writeInto(outDir, "profile/SOUL.template.md", soul);
    await writeInto(outDir, "profile/config.template.yaml", buildHermesConfig(manifest));
    if (project.cronJobs.length)
      await writeInto(outDir, "profile/cron/jobs.template.json",
        buildHermesCronJobs(project.cronJobs));

    for (const skillDir of project.inlineSkillDirs) {
      const rel = relative(join(project.root, "skills"), skillDir);
      await cp(skillDir, join(outDir, "skills", rel), { recursive: true });
    }
    for (const s of resolvedSkills)
      for (const f of s.files)
        await writeInto(outDir, join("skills", s.skill, f.path), f.content);

    for (const entry of project.assetEntries)
      await cp(join(project.root, "assets", entry), join(outDir, entry), { recursive: true });

    await writeInto(outDir, "agent.json", JSON.stringify(manifest, null, 2) + "\n");
    await writeInto(outDir, "agent.lock.json",
      serializeLock(createLock(manifest, resolvedSkills)));
    await writeInto(outDir, ".env.example", buildEnvExample(manifest));

    return { outDir, files: await listFiles(outDir) };
  },
};

registerAdapter(hermesAdapter);
