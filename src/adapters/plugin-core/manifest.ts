import type { AgentManifest } from "../../schema/manifest.js";

/** plugin manifest 的公共字段;name 用 id(slug,两宿主对 name 都有 slug 约束) */
export function pluginMeta(m: AgentManifest): { name: string; version: string; description: string } {
  return { name: m.id, version: m.version, description: m.description };
}
