import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentSpecError, type RemoteSkillRef } from "../schema/manifest.js";
import { realGitRunner, type GitRunner } from "./git-runner.js";

// Kept as a general HTTP dependency type for agent-delivery consumers.
// Remote skill resolution itself uses GitRunner, not FetchLike.
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface GitTreeEntry {
  mode: string;
  type: string;
  object: string;
  size: number | null;
  path: string;
}

export interface ResolvedSkill extends RemoteSkillRef {
  commit: string;
  files: { path: string; content: Buffer }[];
}

export interface RemoteSkillLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  fetchTimeoutMs: number;
}

export const REMOTE_SKILL_LIMITS: RemoteSkillLimits = {
  maxFiles: 1000,
  maxFileBytes: 5 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
  fetchTimeoutMs: 60_000,
};

export function parseLsTree(raw: Buffer): GitTreeEntry[] {
  const entries: GitTreeEntry[] = [];
  for (const record of raw.toString("utf8").split("\0")) {
    if (!record) continue;
    const tab = record.indexOf("\t");
    const metadata = tab === -1 ? record : record.slice(0, tab);
    const path = tab === -1 ? "" : record.slice(tab + 1);
    const match = /^(\d{6}) ([a-z]+) ([0-9a-f]{40}) +(\d+|-)$/i.exec(metadata);
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

function safeUrl(value: string): string {
  const url = new URL(value);
  return `${url.protocol}//${url.host}${url.pathname}`;
}

async function runGit(
  git: GitRunner,
  args: string[],
  timeoutMs: number,
  errorMessage: string,
  cwd?: string,
): Promise<Buffer> {
  const result = await git(args, { cwd, timeoutMs });
  if (result.code !== 0) throw new AgentSpecError(errorMessage);
  return result.stdout;
}

async function openRepository(
  root: string,
  index: number,
  remote: RemoteSkillRef,
  git: GitRunner,
  timeoutMs: number,
): Promise<{ repoDir: string; commit: string }> {
  const repoDir = join(root, `repo-${index}`);
  const source = safeUrl(remote.url);
  await runGit(git, ["init", "--bare", repoDir], timeoutMs,
    `could not initialize temporary Git repository for ${source}`);
  await runGit(git, ["fetch", "--depth=1", remote.url, remote.ref], timeoutMs,
    `could not fetch ref "${remote.ref}" from ${source}`, repoDir);
  const rawCommit = await runGit(git, ["rev-parse", "FETCH_HEAD^{commit}"], timeoutMs,
    `could not resolve ref "${remote.ref}" to a commit in ${source}`, repoDir);
  const commit = rawCommit.toString("utf8").trim();
  if (!/^[0-9a-f]{40}$/.test(commit))
    throw new AgentSpecError(`ref "${remote.ref}" did not resolve to a full commit in ${source}`);
  return { repoDir, commit };
}

async function readSkill(
  remote: RemoteSkillRef,
  repo: { repoDir: string; commit: string },
  git: GitRunner,
  limits: RemoteSkillLimits,
): Promise<ResolvedSkill> {
  const source = safeUrl(remote.url);
  const treeRaw = await runGit(git,
    ["ls-tree", "-r", "-l", "-z", repo.commit, "--", remote.path],
    limits.fetchTimeoutMs,
    `could not inspect path "${remote.path}" in ${source}@${remote.ref}`,
    repo.repoDir);
  const entries = parseLsTree(treeRaw);
  if (entries.length === 0)
    throw new AgentSpecError(`remote skill path "${remote.path}" not found in ${source}@${remote.ref}`);

  for (const entry of entries) {
    if (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode))
      throw new AgentSpecError(`unsupported git entry ${entry.mode} ${entry.type} at ${entry.path}`);
  }

  const skillMd = `${remote.path}/SKILL.md`;
  if (!entries.some((entry) => entry.path === skillMd))
    throw new AgentSpecError(`remote skill "${remote.name}" is missing SKILL.md at ${skillMd}`);
  if (entries.length > limits.maxFiles)
    throw new AgentSpecError(`remote skill "${remote.name}" has too many files (${entries.length} > ${limits.maxFiles})`);

  let totalBytes = 0;
  for (const entry of entries) {
    if (entry.size === null || !Number.isSafeInteger(entry.size) || entry.size < 0)
      throw new AgentSpecError(`remote skill "${remote.name}" has invalid file size at ${entry.path}`);
    if (entry.size > limits.maxFileBytes)
      throw new AgentSpecError(`remote skill "${remote.name}" file too large: ${entry.path}`);
    totalBytes += entry.size;
    if (totalBytes > limits.maxTotalBytes)
      throw new AgentSpecError(`remote skill "${remote.name}" exceeds total size limit`);
  }

  const files = [] as { path: string; content: Buffer }[];
  const prefix = `${remote.path}/`;
  for (const entry of entries) {
    if (!entry.path.startsWith(prefix))
      throw new AgentSpecError(`git returned a path outside remote skill "${remote.name}"`);
    const content = await runGit(git, ["show", `${repo.commit}:${entry.path}`],
      limits.fetchTimeoutMs, `could not read ${entry.path} from ${source}@${remote.ref}`,
      repo.repoDir);
    if (content.length !== entry.size)
      throw new AgentSpecError(`remote skill file size changed while reading ${entry.path}`);
    files.push({ path: entry.path.slice(prefix.length), content });
  }
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

  return { ...remote, commit: repo.commit, files };
}

export async function resolveSkills(
  refs: RemoteSkillRef[],
  options: { git?: GitRunner; limits?: Partial<RemoteSkillLimits> } = {},
): Promise<ResolvedSkill[]> {
  if (refs.length === 0) return [];
  const git = options.git ?? realGitRunner;
  const limits = { ...REMOTE_SKILL_LIMITS, ...options.limits };
  const root = await mkdtemp(join(tmpdir(), "agentspec-git-"));
  const cache = new Map<string, Promise<{ repoDir: string; commit: string }>>();

  try {
    const resolved: ResolvedSkill[] = [];
    for (const remote of refs) {
      const key = `${new URL(remote.url).toString()}\0${remote.ref}`;
      let repo = cache.get(key);
      if (!repo) {
        repo = openRepository(root, cache.size, remote, git, limits.fetchTimeoutMs);
        cache.set(key, repo);
      }
      resolved.push(await readSkill(remote, await repo, git, limits));
    }
    return resolved;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
