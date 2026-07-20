import { mkdir, writeFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { Adapter, BuildInput, BuildResult } from "../adapter.js";
import { registerAdapter } from "../adapter.js";
import { buildPluginTree } from "../plugin-core/build.js";
import { pluginMeta } from "../plugin-core/manifest.js";
import { pluginVars, renderPluginText } from "../plugin-core/render.js";

const PLUGIN_ROOT = "${CLAUDE_PLUGIN_ROOT}";

async function writeInto(outDir: string, rel: string, content: string): Promise<void> {
  const abs = join(outDir, rel);
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

export const claudePluginAdapter: Adapter = {
  target: "claude-plugin",
  async build(input: BuildInput, outDir: string): Promise<BuildResult> {
    const m = input.project.manifest;
    await buildPluginTree(input, outDir, PLUGIN_ROOT);

    await writeInto(outDir, ".claude-plugin/plugin.json",
      JSON.stringify(pluginMeta(m), null, 2) + "\n");

    // SOUL 语义完整迁移：agents/<id>.md + settings.json 激活为主线程默认行为
    const soulRaw = input.project.soulFiles.map((f) => f.content).join("\n\n---\n\n");
    const soul = renderPluginText(soulRaw, pluginVars(m, PLUGIN_ROOT)).text;
    await writeInto(outDir, `agents/${m.id}.md`,
      `---\nname: ${m.id}\ndescription: ${JSON.stringify(m.description)}\n---\n\n${soul}\n`);
    await writeInto(outDir, "settings.json", JSON.stringify({ agent: m.id }, null, 2) + "\n");

    return { outDir, files: await listFiles(outDir) };
  },
};

registerAdapter(claudePluginAdapter);
