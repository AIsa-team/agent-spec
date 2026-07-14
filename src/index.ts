export const AGENTSPEC_VERSION = "agentspec/v1";

export {
  parseManifest,
  AgentSpecError,
  DEFAULT_SKILLS_REPO,
  type AgentManifest,
  type AisaSkillRef,
  type EnvVarDecl,
} from "./schema/manifest.js";
export { parseCronJobs, type CronJob } from "./schema/cron.js";
export { loadAgentProject, type AgentProject } from "./loader.js";
export { resolveSkills, type ResolvedSkill, type FetchLike } from "./skills/resolver.js";
export { createLock, serializeLock, parseLock, type AgentLock } from "./lock.js";
export {
  getAdapter,
  registerAdapter,
  type Adapter,
  type BuildInput,
  type BuildResult,
} from "./adapters/adapter.js";
export { hermesAdapter } from "./adapters/hermes/index.js";
export { buildEnvExample } from "./envfile.js";
export {
  emptyIndex,
  parseIndex,
  upsertIndexEntry,
  serializeIndex,
  type AgentIndex,
} from "./agent-index.js";
