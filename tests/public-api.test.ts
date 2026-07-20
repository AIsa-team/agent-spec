import { describe, it, expect } from "vitest";
import * as api from "../src/index.js";
import type { GitRunner, RemoteSkillRef } from "../src/index.js";

const remoteTypeProbe: RemoteSkillRef = {
  type: "git", url: "https://example.com/repo.git", path: "hello", name: "hello", ref: "main",
};
const gitTypeProbe: GitRunner = async () => ({ code: 0, stdout: Buffer.alloc(0), stderr: "" });

describe("public api", () => {
  it("exposes the complete surface", () => {
    for (const name of [
      "AGENTSPEC_VERSION", "parseManifest", "AgentSpecError",
      "parseCronJobs", "loadAgentProject", "resolveSkills",
      "realGitRunner", "REMOTE_SKILL_LIMITS",
      "createLock", "serializeLock", "parseLock",
      "getAdapter", "registerAdapter", "hermesAdapter", "claudePluginAdapter", "codexPluginAdapter", "buildEnvExample",
    ]) expect(api, name).toHaveProperty(name);
    expect(api).not.toHaveProperty("DEFAULT_SKILLS_REPO");
    expect(remoteTypeProbe.name).toBe("hello");
    expect(gitTypeProbe).toBeTypeOf("function");
  });

  it("hermes adapter is registered by importing the index", () => {
    expect(api.getAdapter("hermes")).toBe(api.hermesAdapter);
  });

  it("claude-plugin adapter is registered by importing the index", () => {
    expect(api.getAdapter("claude-plugin")).toBe(api.claudePluginAdapter);
  });

  it("codex-plugin adapter is registered by importing the index", () => {
    expect(api.getAdapter("codex-plugin")).toBe(api.codexPluginAdapter);
  });
});
