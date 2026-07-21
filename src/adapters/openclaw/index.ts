import { chmod } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter, BuildInput, BuildResult } from "../adapter.js";
import { registerAdapter } from "../adapter.js";
import { buildPluginTree } from "../plugin-core/build.js";
import { pluginVars, renderPluginText } from "../plugin-core/render.js";
import { writeInto, listFiles } from "../plugin-core/fs.js";
import { buildEnvExample } from "../../envfile.js";
import { createLock, serializeLock } from "../../lock.js";
import { buildOpenclawAgentsMd } from "./agents-md.js";
import { buildOpenclawCronSetup } from "./cron-setup.js";

export const openclawAdapter: Adapter = {
  target: "openclaw",
  async build(input: BuildInput, outDir: string): Promise<BuildResult> {
    const { project, resolvedSkills } = input;
    const m = project.manifest;
    // 安装位置固定（ADR-0008）：隔离 agent 的默认 workspace 路径
    const wsRoot = `$HOME/.openclaw/workspace-${m.id}`;
    const vars = pluginVars(m, wsRoot);

    await buildPluginTree(input, join(outDir, "workspace"), wsRoot);

    const soulRaw = project.soulFiles.map((f) => f.content).join("\n\n---\n\n");
    await writeInto(outDir, "workspace/SOUL.md", renderPluginText(soulRaw, vars).text);
    await writeInto(outDir, "workspace/AGENTS.md",
      renderPluginText(buildOpenclawAgentsMd(m), vars).text);

    if (project.cronJobs.length) {
      const sh = renderPluginText(buildOpenclawCronSetup(m, project.cronJobs), vars).text;
      await writeInto(outDir, "workspace/cron-setup.sh", sh);
      await chmod(join(outDir, "workspace/cron-setup.sh"), 0o755);
    }

    await writeInto(outDir, "agent.json", JSON.stringify(m, null, 2) + "\n");
    await writeInto(outDir, "agent.lock.json", serializeLock(createLock(m, resolvedSkills)));
    await writeInto(outDir, ".env.example", buildEnvExample(m));
    return { outDir, files: await listFiles(outDir) };
  },
};

registerAdapter(openclawAdapter);
