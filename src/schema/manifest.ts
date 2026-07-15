import { z } from "zod";
import { parse as parseYaml } from "yaml";

export class AgentSpecError extends Error {}

export const DEFAULT_SKILLS_REPO = "AIsa-team/agent-skills";

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "must be a lowercase slug");
const semver = z.string().regex(/^\d+\.\d+\.\d+$/, "must be semver x.y.z");

const envVarDecl = z.object({
  name: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  description: z.string(),
  degrade: z.string().optional(),
});

const aisaSkillRef = z.object({
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/).default(DEFAULT_SKILLS_REPO),
  skill: z.string().min(1),
  ref: z.string().min(1).default("main"),
});

const pythonSetup = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  requirements: z.string().min(1),          // 源项目内相对路径,随产物打包
  env: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  optional: z.boolean().default(false),
  description: z.string().optional(),
});

const manifestSchema = z.object({
  spec: z.literal("agentspec/v1"),
  id: slug,
  name: z.string().min(1),
  version: semver,
  description: z.string().min(1),
  language: z.string().default("en"),
  models: z.object({
    default: z.string().min(1),
    fast: z.string().optional(),
    provider: z.string().default("aisa"),
  }).default({ default: "deepseek-v3.2", provider: "aisa" }),
  env: z.object({
    required: z.array(envVarDecl).default([]),
    optional: z.array(envVarDecl).default([]),
  }).default({ required: [], optional: [] }),
  skills: z.object({
    inline: z.array(z.string().min(1)).default([]),
    aisa: z.array(aisaSkillRef).default([]),
  }).default({ inline: [], aisa: [] }),
  cron: z.string().optional(),
  setup: z.object({
    python: z.array(pythonSetup).default([]),
  }).default({ python: [] }),
  update: z.object({
    channel: z.enum(["latest", "pinned"]).default("latest"),
    auto: z.boolean().default(true),
  }).default({ channel: "latest", auto: true }),
  targets: z.object({
    hermes: z.object({
      config: z.record(z.unknown()).default({}),
    }).optional(),
  }).optional(),
});

export type AgentManifest = z.infer<typeof manifestSchema>;
export type AisaSkillRef = z.infer<typeof aisaSkillRef>;
export type EnvVarDecl = z.infer<typeof envVarDecl>;
export type PythonSetup = z.infer<typeof pythonSetup>;

export function parseManifest(yamlText: string): AgentManifest {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (e) {
    throw new AgentSpecError(`agent.yaml is not valid YAML: ${(e as Error).message}`);
  }
  const result = manifestSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new AgentSpecError(`agent.yaml invalid: ${issues}`);
  }
  return result.data;
}
