import { z } from "zod";
import { AgentSpecError, type AgentManifest } from "./schema/manifest.js";

// target 条目(2026-07-15 扩展,均为可选、向后兼容):
//   installMd/installSh/guidePrompt — 分发三件套的完整 URL(带 target 后缀命名,
//     消费端只读 URL、不再自行拼文件名)
//   e2bTemplate/e2bTemplateDev — 已烤好的 per-agent E2B 模板名(prod/dev 双轨);
//     语义:字段存在 = 模板已 bake 成功且与该版本一致(bake 成功后才写入)
const targetSchema = z.object({
  url: z.string(),
  sha256: z.string(),
  installMd: z.string().optional(),
  installSh: z.string().optional(),
  guidePrompt: z.string().optional(),
  e2bTemplate: z.string().optional(),
  e2bTemplateDev: z.string().optional(),
});

const indexSchema = z.object({
  spec: z.literal("agent-index/v1"),
  agents: z.record(z.object({
    name: z.string(), description: z.string(), repo: z.string(),
    latest: z.string(),
    versions: z.record(z.object({
      targets: z.record(targetSchema),
    })),
  })),
});

export type AgentIndex = z.infer<typeof indexSchema>;
export type AgentIndexTarget = z.infer<typeof targetSchema>;

export function emptyIndex(): AgentIndex {
  return { spec: "agent-index/v1", agents: {} };
}

export function parseIndex(jsonText: string): AgentIndex {
  return indexSchema.parse(JSON.parse(jsonText));
}

export function upsertIndexEntry(index: AgentIndex, entry: {
  manifest: AgentManifest; repo: string; target: string; url: string; sha256: string;
  assets?: { installMd?: string; installSh?: string; guidePrompt?: string };
}): AgentIndex {
  const { manifest: m } = entry;
  const next: AgentIndex = structuredClone(index);
  const agent = next.agents[m.id] ?? {
    name: m.name, description: m.description, repo: entry.repo, latest: m.version, versions: {},
  };
  agent.name = m.name; agent.description = m.description; agent.repo = entry.repo;
  agent.latest = m.version;
  agent.versions[m.version] = agent.versions[m.version] ?? { targets: {} };
  agent.versions[m.version].targets[entry.target] = {
    url: entry.url, sha256: entry.sha256, ...(entry.assets ?? {}),
  };
  next.agents[m.id] = agent;
  return next;
}

/** bake 成功后把模板名记入指定版本的 target 条目(纯函数)。dev=true 写
 *  e2bTemplateDev,否则写 e2bTemplate。条目不存在时抛错(先 publish 后 bake)。 */
export function setIndexTemplate(index: AgentIndex, opts: {
  id: string; version: string; target: string; templateName: string; dev?: boolean;
}): AgentIndex {
  const next: AgentIndex = structuredClone(index);
  const t = next.agents[opts.id]?.versions[opts.version]?.targets[opts.target];
  if (!t) throw new AgentSpecError(
    `index has no ${opts.target} entry for ${opts.id}@${opts.version} — publish before recording a template`);
  if (opts.dev) t.e2bTemplateDev = opts.templateName;
  else t.e2bTemplate = opts.templateName;
  return next;
}

export function serializeIndex(index: AgentIndex): string {
  const sorted: AgentIndex = {
    spec: index.spec,
    agents: Object.fromEntries(Object.entries(index.agents).sort(([a], [b]) => a.localeCompare(b))),
  };
  return JSON.stringify(sorted, null, 2) + "\n";
}
