import { z } from "zod";
import { AgentSpecError, type AgentManifest } from "./schema/manifest.js";
import type { ResolvedSkill } from "./skills/resolver.js";

const lockSchema = z.object({
  spec: z.literal("agentspec-lock/v1"),
  agent: z.string(),
  version: z.string(),
  skills: z.array(z.object({
    type: z.literal("git"),
    url: z.string(),
    path: z.string(),
    name: z.string(),
    ref: z.string(),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
  }).strict()),
}).strict();

export type AgentLock = z.infer<typeof lockSchema>;

export function createLock(manifest: AgentManifest, resolved: ResolvedSkill[]): AgentLock {
  const skills = resolved
    .map(({ type, url, path, name, ref, commit }) =>
      ({ type, url, path, name, ref, commit }))
    .sort((a, b) => {
      const left = `${a.name}\0${a.url}\0${a.path}`;
      const right = `${b.name}\0${b.url}\0${b.path}`;
      return left < right ? -1 : left > right ? 1 : 0;
    });
  return { spec: "agentspec-lock/v1", agent: manifest.id, version: manifest.version, skills };
}

export function serializeLock(lock: AgentLock): string {
  return JSON.stringify(lock, null, 2) + "\n";
}

export function parseLock(jsonText: string): AgentLock {
  const result = lockSchema.safeParse(JSON.parse(jsonText));
  if (!result.success) throw new AgentSpecError(`agent.lock.json invalid: ${result.error.message}`);
  return result.data;
}
