import { z } from "zod";
import type { AgentManifest } from "./schema/manifest.js";

const indexSchema = z.object({
  spec: z.literal("agent-index/v1"),
  agents: z.record(z.object({
    name: z.string(), description: z.string(), repo: z.string(),
    latest: z.string(),
    versions: z.record(z.object({
      targets: z.record(z.object({ url: z.string(), sha256: z.string() })),
    })),
  })),
});

export type AgentIndex = z.infer<typeof indexSchema>;

export function emptyIndex(): AgentIndex {
  return { spec: "agent-index/v1", agents: {} };
}

export function parseIndex(jsonText: string): AgentIndex {
  return indexSchema.parse(JSON.parse(jsonText));
}

export function upsertIndexEntry(index: AgentIndex, entry: {
  manifest: AgentManifest; repo: string; target: string; url: string; sha256: string;
}): AgentIndex {
  const { manifest: m } = entry;
  const next: AgentIndex = structuredClone(index);
  const agent = next.agents[m.id] ?? {
    name: m.name, description: m.description, repo: entry.repo, latest: m.version, versions: {},
  };
  agent.name = m.name; agent.description = m.description; agent.repo = entry.repo;
  agent.latest = m.version;
  agent.versions[m.version] = agent.versions[m.version] ?? { targets: {} };
  agent.versions[m.version].targets[entry.target] = { url: entry.url, sha256: entry.sha256 };
  next.agents[m.id] = agent;
  return next;
}

export function serializeIndex(index: AgentIndex): string {
  const sorted: AgentIndex = {
    spec: index.spec,
    agents: Object.fromEntries(Object.entries(index.agents).sort(([a], [b]) => a.localeCompare(b))),
  };
  return JSON.stringify(sorted, null, 2) + "\n";
}
