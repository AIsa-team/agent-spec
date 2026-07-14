import { describe, it, expect } from "vitest";
import * as api from "../src/index.js";

describe("public api", () => {
  it("exposes the complete surface", () => {
    for (const name of [
      "AGENTSPEC_VERSION", "parseManifest", "AgentSpecError", "DEFAULT_SKILLS_REPO",
      "parseCronJobs", "loadAgentProject", "resolveSkills",
      "createLock", "serializeLock", "parseLock",
      "getAdapter", "registerAdapter", "hermesAdapter", "buildEnvExample",
    ]) expect(api, name).toHaveProperty(name);
  });

  it("hermes adapter is registered by importing the index", () => {
    expect(api.getAdapter("hermes")).toBe(api.hermesAdapter);
  });
});
