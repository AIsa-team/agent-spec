import { AgentSpecError } from "../schema/manifest.js";
import type { AgentProject } from "../loader.js";
import type { ResolvedSkill } from "../skills/resolver.js";

export interface BuildInput {
  project: AgentProject;
  resolvedSkills: ResolvedSkill[];
  /** AIsa 网关当前可用模型 id 列表(构建时从 /v1/models 拉取);缺省保留 adapter 内置静态列表 */
  aisaModels?: string[];
}
export interface BuildResult { outDir: string; files: string[] }
export interface Adapter {
  target: string;
  build(input: BuildInput, outDir: string): Promise<BuildResult>;
}

const registry = new Map<string, Adapter>();

export function registerAdapter(a: Adapter): void { registry.set(a.target, a); }

export function getAdapter(target: string): Adapter {
  const a = registry.get(target);
  if (!a) throw new AgentSpecError(
    `unknown build target "${target}" — available: ${[...registry.keys()].join(", ") || "(none)"}`);
  return a;
}
