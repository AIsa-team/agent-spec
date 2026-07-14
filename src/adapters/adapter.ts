import { AgentSpecError } from "../schema/manifest.js";
import type { AgentProject } from "../loader.js";
import type { ResolvedSkill } from "../skills/resolver.js";

export interface BuildInput { project: AgentProject; resolvedSkills: ResolvedSkill[] }
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
