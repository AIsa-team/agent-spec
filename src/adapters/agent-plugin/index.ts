import type { Adapter, BuildInput, BuildResult } from "../adapter.js";
import { registerAdapter } from "../adapter.js";
import { buildPluginTree } from "../plugin-core/build.js";
import { pluginMeta } from "../plugin-core/manifest.js";
import { pluginVars, renderPluginText } from "../plugin-core/render.js";
import { writeInto, listFiles } from "../plugin-core/fs.js";
import { AGENT_PLUGIN_SCHEMA_URL, validateAgentPluginDirectory } from "../../agent-plugins.js";
import { makePluginTreePortable, PORTABLE_ROOT_SENTINEL } from "./portable.js";

export const agentPluginAdapter: Adapter = {
  target: "agent-plugin",
  async build(input: BuildInput, outDir: string): Promise<BuildResult> {
    const m = input.project.manifest;
    await buildPluginTree(input, outDir, PORTABLE_ROOT_SENTINEL);

    const soulRaw = input.project.soulFiles.map((file) => file.content).join("\n\n---\n\n");
    const soul = renderPluginText(soulRaw, pluginVars(m, PORTABLE_ROOT_SENTINEL)).text;
    await writeInto(outDir, "skills/soul/SKILL.md", [
      "---",
      "name: soul",
      `description: ${JSON.stringify(`${m.name} core identity and operating rules. Load this skill at the start of every conversation when the client supports persistent agent identity.`)}`,
      `compatibility: ${JSON.stringify("Portable identity fallback; Agent Plugins v1 does not require clients to auto-load a soul or agent prompt.")}`,
      "---",
      "",
      soul,
      "",
    ].join("\n"));

    await makePluginTreePortable(outDir, m);

    const meta = pluginMeta(m);
    await writeInto(outDir, "plugin.json", JSON.stringify({
      $schema: AGENT_PLUGIN_SCHEMA_URL,
      ...meta,
      ...(m.branding?.websiteURL && !meta.homepage ? { homepage: m.branding.websiteURL } : {}),
    }, null, 2) + "\n");

    await validateAgentPluginDirectory(outDir);
    return { outDir, files: await listFiles(outDir) };
  },
};

registerAdapter(agentPluginAdapter);

