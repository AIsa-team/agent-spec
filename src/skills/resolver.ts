import { AgentSpecError, type RemoteSkillRef } from "../schema/manifest.js";

export interface GitTreeEntry {
  mode: string;
  type: string;
  object: string;
  size: number | null;
  path: string;
}

export function parseLsTree(raw: Buffer): GitTreeEntry[] {
  const entries: GitTreeEntry[] = [];
  for (const record of raw.toString("utf8").split("\0")) {
    if (!record) continue;
    const tab = record.indexOf("\t");
    const metadata = tab === -1 ? record : record.slice(0, tab);
    const path = tab === -1 ? "" : record.slice(tab + 1);
    const match = /^(\d{6}) ([a-z]+) ([0-9a-f]{40}) (\d+|-)$/i.exec(metadata);
    if (!match || !path) throw new AgentSpecError(`invalid git ls-tree record: ${metadata}`);
    entries.push({
      mode: match[1],
      type: match[2],
      object: match[3],
      size: match[4] === "-" ? null : Number(match[4]),
      path,
    });
  }
  return entries;
}

export interface ResolvedSkill {
  repo: string; skill: string; ref: string; sha: string;
  files: { path: string; content: string }[];
}
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = { "user-agent": "aisa-agent-spec" };
  if (process.env.GITHUB_TOKEN) h.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function getJson(fetchImpl: FetchLike, url: string): Promise<any> {
  const res = await fetchImpl(url, { headers: ghHeaders() });
  if (!res.ok) throw new AgentSpecError(`GitHub request failed (${res.status}): ${url}`);
  return res.json();
}

export async function resolveSkills(
  refs: RemoteSkillRef[],
  fetchImpl: FetchLike = fetch,
): Promise<ResolvedSkill[]> {
  // 每个唯一 repo@ref 只解析一次 SHA + tree
  const treeCache = new Map<string, { sha: string; paths: string[] }>();

  async function repoTree(repo: string, ref: string) {
    const key = `${repo}@${ref}`;
    let cached = treeCache.get(key);
    if (!cached) {
      const commit = await getJson(fetchImpl,
        `https://api.github.com/repos/${repo}/commits/${ref}`);
      const sha: string = commit.sha;
      if (!sha) throw new AgentSpecError(`could not resolve ref "${ref}" in ${repo}`);
      const tree = await getJson(fetchImpl,
        `https://api.github.com/repos/${repo}/git/trees/${sha}?recursive=1`);
      const paths = (tree.tree as { path: string; type: string }[])
        .filter((e) => e.type === "blob").map((e) => e.path);
      cached = { sha, paths };
      treeCache.set(key, cached);
    }
    return cached;
  }

  const out: ResolvedSkill[] = [];
  for (const r of refs) {
    const { sha, paths } = await repoTree(r.repo, r.ref);
    const prefix = `${r.skill}/`;
    const skillPaths = paths.filter((p) => p.startsWith(prefix));
    if (skillPaths.length === 0)
      throw new AgentSpecError(`skill "${r.skill}" not found in ${r.repo}@${r.ref} (no files)`);
    const files = await Promise.all(skillPaths.map(async (p) => {
      const res = await fetchImpl(
        `https://raw.githubusercontent.com/${r.repo}/${sha}/${p}`,
        { headers: { "user-agent": "aisa-agent-spec" } });
      if (!res.ok) throw new AgentSpecError(`failed to fetch ${p} (${res.status})`);
      return { path: p.slice(prefix.length), content: await res.text() };
    }));
    out.push({ repo: r.repo, skill: r.skill, ref: r.ref, sha, files });
  }
  return out;
}
