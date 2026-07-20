export const AGENTSPEC_VERSION = "agentspec/v1";

export {
  parseManifest,
  AgentSpecError,
  type AgentManifest,
  type RemoteSkillRef,
  type EnvVarDecl,
} from "./schema/manifest.js";
export { parseCronJobs, type CronJob } from "./schema/cron.js";
export { loadAgentProject, type AgentProject } from "./loader.js";
export {
  resolveSkills,
  REMOTE_SKILL_LIMITS,
  type ResolvedSkill,
  type RemoteSkillLimits,
  type FetchLike,
} from "./skills/resolver.js";
export { realGitRunner, type GitRunner, type GitResult } from "./skills/git-runner.js";
export { createLock, serializeLock, parseLock, type AgentLock } from "./lock.js";
export {
  getAdapter,
  registerAdapter,
  type Adapter,
  type BuildInput,
  type BuildResult,
} from "./adapters/adapter.js";
export { hermesAdapter } from "./adapters/hermes/index.js";
export { claudePluginAdapter } from "./adapters/claude-plugin/index.js";
export { codexPluginAdapter } from "./adapters/codex-plugin/index.js";
export { buildEnvExample } from "./envfile.js";
export {
  emptyIndex,
  parseIndex,
  upsertIndexEntry,
  upsertIndexGitTarget,
  setIndexTemplate,
  serializeIndex,
  type AgentIndex,
  type AgentIndexTarget,
  type AgentIndexGitTarget,
} from "./agent-index.js";
