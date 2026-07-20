import type { Adapter, BuildInput, BuildResult } from "../adapter.js";
import { registerAdapter } from "../adapter.js";
import { buildPluginTree } from "../plugin-core/build.js";
import { pluginMeta } from "../plugin-core/manifest.js";
import { pluginVars, renderPluginText } from "../plugin-core/render.js";
import { writeInto, listFiles } from "../plugin-core/fs.js";

// 已对照 https://learn.chatgpt.com/docs/build-plugins 核实：Codex 插件根目录
// 环境变量是 ${PLUGIN_ROOT}（文档同时兼容设置 ${CLAUDE_PLUGIN_ROOT}，但公开契约用前者）。
// Codex 无 agent 概念，SOUL 只能降级为 always-apply skill。
const PLUGIN_ROOT = "${PLUGIN_ROOT}";

export const codexPluginAdapter: Adapter = {
  target: "codex-plugin",
  async build(input: BuildInput, outDir: string): Promise<BuildResult> {
    const m = input.project.manifest;
    await buildPluginTree(input, outDir, PLUGIN_ROOT);

    await writeInto(outDir, ".codex-plugin/plugin.json",
      JSON.stringify(pluginMeta(m), null, 2) + "\n");

    // SOUL 降级承载：always-apply skill，description 引导宿主每轮加载
    const soulRaw = input.project.soulFiles.map((f) => f.content).join("\n\n---\n\n");
    const soul = renderPluginText(soulRaw, pluginVars(m, PLUGIN_ROOT)).text;
    await writeInto(outDir, "skills/soul/SKILL.md", [
      "---",
      "name: soul",
      // JSON.stringify escaping is a subset of YAML double-quoted scalar escaping,
      // so a raw m.name (containing " or \) can't corrupt the frontmatter — mirrors claude-plugin/index.ts.
      `description: ${JSON.stringify(`${m.name} core identity and operating rules. ALWAYS apply this skill: load it at the start of EVERY conversation before any other skill.`)}`,
      "---",
      "", soul, "",
    ].join("\n"));

    return { outDir, files: await listFiles(outDir) };
  },
};

registerAdapter(codexPluginAdapter);
