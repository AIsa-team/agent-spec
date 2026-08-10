import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { AgentSpecError } from "./schema/manifest.js";

export const AGENT_PLUGINS_VERSION = "1.0.0";
export const AGENT_PLUGIN_SCHEMA_URL =
  "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

const pluginName = z.string().min(1).max(64)
  .regex(/^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/);

/** Mirrors the closed Agent Plugins v1.0.0 plugin.schema.json. */
export const agentPluginManifestSchema = z.object({
  $schema: z.literal(AGENT_PLUGIN_SCHEMA_URL),
  name: pluginName,
  version: z.string().optional(),
  description: z.string().optional(),
  author: z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    url: z.string().optional(),
  }).strict().optional(),
  homepage: z.string().optional(),
  repository: z.string().optional(),
  license: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  extensions: z.record(z.record(z.unknown())).optional(),
}).strict();

export type AgentPluginManifest = z.infer<typeof agentPluginManifestSchema>;

const skillName = z.string().min(1).max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)
  .refine((value) => !value.includes("--"), "must not contain consecutive hyphens");

const skillFrontmatterSchema = z.object({
  name: skillName,
  description: z.string().min(1).max(1024),
  license: z.string().optional(),
  compatibility: z.string().min(1).max(500).optional(),
  metadata: z.record(z.string()).optional(),
  "allowed-tools": z.string().optional(),
}).passthrough();

function fail(label: string, error: z.ZodError): never {
  const detail = error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  throw new AgentSpecError(`${label} invalid: ${detail}`);
}

export function parseAgentPluginManifest(text: string): AgentPluginManifest {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch (error) {
    throw new AgentSpecError(`plugin.json is not valid JSON: ${(error as Error).message}`);
  }
  const parsed = agentPluginManifestSchema.safeParse(value);
  if (!parsed.success) fail("plugin.json", parsed.error);
  return parsed.data;
}

export function parseAgentSkillFrontmatter(text: string, directoryName: string): void {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new AgentSpecError(`skills/${directoryName}/SKILL.md lacks YAML frontmatter`);
  let value: unknown;
  try { value = parseYaml(match[1]); }
  catch (error) {
    throw new AgentSpecError(
      `skills/${directoryName}/SKILL.md has invalid YAML frontmatter: ${(error as Error).message}`);
  }
  const parsed = skillFrontmatterSchema.safeParse(value);
  if (!parsed.success) fail(`skills/${directoryName}/SKILL.md frontmatter`, parsed.error);
  if (parsed.data.name !== directoryName)
    throw new AgentSpecError(
      `skills/${directoryName}/SKILL.md name must equal parent directory (${directoryName})`);
}

async function rejectSymlinks(root: string, rel = ""): Promise<void> {
  for (const entry of await readdir(join(root, rel), { withFileTypes: true })) {
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    const info = await lstat(join(root, child));
    if (info.isSymbolicLink())
      throw new AgentSpecError(`Agent Plugin must not contain symlink: ${child}`);
    if (info.isDirectory()) await rejectSymlinks(root, child);
  }
}

/** Build/publish gate for the portable floor implemented by AgentSpec. */
export async function validateAgentPluginDirectory(root: string): Promise<AgentPluginManifest> {
  await rejectSymlinks(root);
  let manifestText: string;
  try { manifestText = await readFile(join(root, "plugin.json"), "utf8"); }
  catch { throw new AgentSpecError("Agent Plugin is missing root plugin.json"); }
  const manifest = parseAgentPluginManifest(manifestText);

  let entries;
  try { entries = await readdir(join(root, "skills"), { withFileTypes: true }); }
  catch { return manifest; } // skills-only is optional in the portable spec
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    let md: string;
    try { md = await readFile(join(root, "skills", entry.name, "SKILL.md"), "utf8"); }
    catch { continue; } // immediate children without SKILL.md are not discovered skills
    parseAgentSkillFrontmatter(md, entry.name);
  }
  return manifest;
}

