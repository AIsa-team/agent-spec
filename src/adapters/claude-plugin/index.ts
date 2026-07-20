import type { Adapter, BuildInput, BuildResult } from "../adapter.js";
import { registerAdapter } from "../adapter.js";
import { buildPluginTree } from "../plugin-core/build.js";
import { pluginMeta } from "../plugin-core/manifest.js";
import { pluginVars, renderPluginText } from "../plugin-core/render.js";
import { writeInto, listFiles } from "../plugin-core/fs.js";

const PLUGIN_ROOT = "${CLAUDE_PLUGIN_ROOT}";

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
