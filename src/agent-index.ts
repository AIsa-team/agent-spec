import { z } from "zod";
import { AgentSpecError, type AgentManifest } from "./schema/manifest.js";

// target 条目(2026-07-15 扩展,均为可选、向后兼容):
//   installMd/installSh/guidePrompt — 分发三件套的完整 URL(带 target 后缀命名,
//     消费端只读 URL、不再自行拼文件名)
//   e2bTemplate — 已烤好的 per-agent 版本化 E2B 模板名(ADR-0005);
//     语义:字段存在 = 模板已 bake 成功且与该版本一致(bake 成功后才写入)
const urlTargetSchema = z.object({
  url: z.string(),
  sha256: z.string(),
  installMd: z.string().optional(),
  installSh: z.string().optional(),
  guidePrompt: z.string().optional(),
  e2bTemplate: z.string().optional(),
});

// plugin 类 target 走 git 分发(ADR-0007): marketplace 不支持 zip source,
// 不可变性由 tag+commit 保证, path 是 marketplace 仓库内的产物目录
const gitTargetSchema = z.object({
  repo: z.string(),
  tag: z.string(),
  commit: z.string(),
  path: z.string(),
  // 安装文档的 Release 资产 URL(2026-07-20 起随发布生成,消费端只读 URL)
  installMd: z.string().optional(),
});

const targetSchema = z.union([urlTargetSchema, gitTargetSchema]);

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
export type AgentIndexGitTarget = z.infer<typeof gitTargetSchema>;

export function emptyIndex(): AgentIndex {
  return { spec: "agent-index/v1", agents: {} };
}

export function parseIndex(jsonText: string): AgentIndex {
  return indexSchema.parse(JSON.parse(jsonText));
}

/** upsertIndexEntry / upsertIndexGitTarget 共用的 agent 壳体维护:
 *  查找或新建 agent、刷新 name/description/repo、bump latest、确保该版本的
 *  targets 记录存在 —— 在克隆后的 index 上原地变更,返回该版本的 targets 供调用方写入具体条目。 */
function upsertAgentShell(
  next: AgentIndex, m: AgentManifest, repo: string, version: string,
): { targets: Record<string, AgentIndexTarget> } {
  const agent = next.agents[m.id] ?? {
    name: m.name, description: m.description, repo, latest: version, versions: {},
  };
  agent.name = m.name; agent.description = m.description; agent.repo = repo;
  agent.latest = version;
  agent.versions[version] = agent.versions[version] ?? { targets: {} };
  next.agents[m.id] = agent;
  return agent.versions[version];
}

export function upsertIndexEntry(index: AgentIndex, entry: {
  manifest: AgentManifest; repo: string; target: string; url: string; sha256: string;
  assets?: { installMd?: string; installSh?: string; guidePrompt?: string };
}): AgentIndex {
  const { manifest: m } = entry;
  const next: AgentIndex = structuredClone(index);
  const version = upsertAgentShell(next, m, entry.repo, m.version);
  version.targets[entry.target] = {
    url: entry.url, sha256: entry.sha256, ...(entry.assets ?? {}),
  };
  return next;
}

/** plugin 类 target 走 git 分发(ADR-0007),没有 sha256 归档 —— 独立于 upsertIndexEntry 写入。 */
export function upsertIndexGitTarget(index: AgentIndex, entry: {
  manifest: AgentManifest; repo: string; target: string; git: AgentIndexGitTarget;
}): AgentIndex {
  const { manifest: m } = entry;
  const next: AgentIndex = structuredClone(index);
  const version = upsertAgentShell(next, m, entry.repo, m.version);
  version.targets[entry.target] = { ...entry.git };
  return next;
}

/** bake 成功后把模板名记入指定版本 target 条目的 e2bTemplate(纯函数)。
 *  条目不存在时抛错(先 publish 后 bake)。git 形态条目没有 e2bTemplate 语义 —— 直接拒绝。 */
export function setIndexTemplate(index: AgentIndex, opts: {
  id: string; version: string; target: string; templateName: string;
}): AgentIndex {
  const next: AgentIndex = structuredClone(index);
  const t = next.agents[opts.id]?.versions[opts.version]?.targets[opts.target];
  if (!t) throw new AgentSpecError(
    `index has no ${opts.target} entry for ${opts.id}@${opts.version} — publish before recording a template`);
  if (!("url" in t)) throw new AgentSpecError("e2bTemplate only applies to url-form targets");
  t.e2bTemplate = opts.templateName;
  return next;
}

export function serializeIndex(index: AgentIndex): string {
  const sorted: AgentIndex = {
    spec: index.spec,
    agents: Object.fromEntries(Object.entries(index.agents).sort(([a], [b]) => a.localeCompare(b))),
  };
  return JSON.stringify(sorted, null, 2) + "\n";
}
