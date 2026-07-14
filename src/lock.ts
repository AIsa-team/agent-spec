import { z } from "zod";
import { AgentSpecError, type AgentManifest } from "./schema/manifest.js";
import type { ResolvedSkill } from "./skills/resolver.js";

const lockSchema = z.object({
  spec: z.literal("agentspec-lock/v1"),
  agent: z.string(),
  version: z.string(),
  skills: z.array(z.object({
    repo: z.string(), skill: z.string(), ref: z.string(),
    sha: z.string().regex(/^[0-9a-f]{40}$/),
  })),
});

export type AgentLock = z.infer<typeof lockSchema>;

export function createLock(manifest: AgentManifest, resolved: ResolvedSkill[]): AgentLock {
  const skills = resolved
    .map(({ repo, skill, ref, sha }) => ({ repo, skill, ref, sha }))
    .sort((a, b) => `${a.repo}/${a.skill}`.localeCompare(`${b.repo}/${b.skill}`));
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
