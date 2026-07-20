import { z } from "zod";
import { parse as parseYaml } from "yaml";
import { posix } from "node:path";

export class AgentSpecError extends Error {}

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "must be a lowercase slug");
const semver = z.string().regex(/^\d+\.\d+\.\d+$/, "must be semver x.y.z");

const envVarDecl = z.object({
  name: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  description: z.string(),
  degrade: z.string().optional(),
  // key 申请入口(2026-07-20):plugin 的 env 引导块用它把"缺 key"变成开通转化,
  // 缺省时引导文案退化为纯配置说明
  setupUrl: z.string().url().optional(),
});

function validHttpsGitUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname.length > 0
      && url.pathname !== "/"
      && !url.username
      && !url.password
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

function validRemotePath(value: string): boolean {
  if (!value || value.startsWith("/") || value.includes("\\")) return false;
  return value.split("/").every((part) =>
    part.length > 0 && part !== "." && part !== ".." && part !== ".git");
}

function validGitRef(value: string): boolean {
  return value.length > 0
    && !value.startsWith("-")
    && !/[\u0000-\u0020\u007f]/.test(value)
    && !value.includes("..")
    && !value.includes("@{")
    && !value.includes("\\");
}

const remoteSkillRef = z.object({
  type: z.literal("git").default("git"),
  url: z.string().refine(validHttpsGitUrl,
    "must be a public HTTPS Git URL without credentials, query, or fragment"),
  path: z.string().refine(validRemotePath, "must be a safe relative POSIX path"),
  name: slug.optional(),
  ref: z.string().refine(validGitRef, "must be a safe Git ref").default("main"),
}).strict().transform((remote) => ({
  ...remote,
  name: remote.name ?? posix.basename(remote.path),
}));

const skillsSchema = z.object({
  inline: z.array(z.string().min(1)).default([]),
  remote: z.array(remoteSkillRef).default([]),
}).strict().superRefine((skills, ctx) => {
  const names = new Map<string, string>();
  for (const name of skills.inline) names.set(name, `inline:${name}`);
  for (const [index, remote] of skills.remote.entries()) {
    const previous = names.get(remote.name);
    if (previous) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["remote", index, "name"],
        message: `skill output name collision "${remote.name}" with ${previous}`,
      });
    } else {
      names.set(remote.name, `remote:${index}`);
    }
  }
});

const pythonSetup = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  requirements: z.string().min(1),          // 源项目内相对路径,随产物打包
  env: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  optional: z.boolean().default(false),
  description: z.string().optional(),
});

// 安装期模板变量的声明式默认值(2026-07-20,plugin targets 需要):
// hermes 在安装时用真实值渲染 {{VAR}};plugin 无安装步骤,build 期用 default 渲染。
// env: true 表示运行时可用同名环境变量覆盖(路径类),false 为纯文本替换(称呼类)
const varDecl = z.object({
  default: z.string(),
  env: z.boolean().default(false),
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
  skills: skillsSchema.default({ inline: [], remote: [] }),
  vars: z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/), varDecl).default({}),
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
export type RemoteSkillRef = z.infer<typeof remoteSkillRef>;
export type EnvVarDecl = z.infer<typeof envVarDecl>;
export type PythonSetup = z.infer<typeof pythonSetup>;
export type VarDecl = z.infer<typeof varDecl>;

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
