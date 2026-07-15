import { mkdir, writeFile, cp, readdir, readFile } from "node:fs/promises";
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

// 排除本地编译/系统垃圾,产物必须可复现
const junkRe = /(^|\/)(__pycache__(\/|$)|\.DS_Store$)|\.pyc$/;
const copyFilter = (src: string) => !junkRe.test(src);

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
  async build({ project, resolvedSkills, aisaModels }: BuildInput, outDir: string): Promise<BuildResult> {
    const { manifest } = project;

    const soul = project.soulFiles.map((f) => f.content).join("\n\n---\n\n");
    await writeInto(outDir, "profile/SOUL.template.md", soul);
    await writeInto(outDir, "profile/config.template.yaml", buildHermesConfig(manifest, aisaModels));
    if (project.cronJobs.length)
      await writeInto(outDir, "profile/cron/jobs.template.json",
        buildHermesCronJobs(project.cronJobs));

    for (const skillDir of project.inlineSkillDirs) {
      const rel = relative(join(project.root, "skills"), skillDir);
      await cp(skillDir, join(outDir, "skills", rel), { recursive: true, filter: copyFilter });
    }
    for (const s of resolvedSkills)
      for (const f of s.files)
        await writeInto(outDir, join("skills", s.skill, f.path), f.content);

    for (const entry of project.assetEntries)
      await cp(join(project.root, "assets", entry), join(outDir, entry), { recursive: true, filter: copyFilter });

    for (const s of manifest.setup.python)
      await writeInto(outDir, s.requirements,
        await readFile(join(project.root, s.requirements), "utf8"));

    await writeInto(outDir, "agent.json", JSON.stringify(manifest, null, 2) + "\n");
    await writeInto(outDir, "agent.lock.json",
      serializeLock(createLock(manifest, resolvedSkills)));
    await writeInto(outDir, ".env.example", buildEnvExample(manifest));

    return { outDir, files: await listFiles(outDir) };
  },
};

registerAdapter(hermesAdapter);
