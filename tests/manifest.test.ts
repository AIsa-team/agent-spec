import { describe, it, expect } from "vitest";
import { parseManifest, AgentSpecError } from "../src/schema/manifest.js";

const VALID = `
spec: agentspec/v1
id: cio
name: Neo CIO
version: 1.0.0
description: AI Chief Investment Officer
language: zh
models:
  default: deepseek-v4-pro
  fast: gemini-2.5-flash
  provider: aisa
env:
  required:
    - name: AISA_API_KEY
      description: models + aisa skills gateway
  optional:
    - name: FINNHUB_API_KEY
      description: price fallback
      degrade: skip fallback, Yahoo only
skills:
  inline:
    - finance/portfolio-report
  aisa:
    - repo: AIsa-team/agent-skills
      skill: twitter-post
      ref: v1.2.0
cron: cron/jobs.yaml
update:
  channel: latest
  auto: true
`;

describe("parseManifest", () => {
  it("parses a valid manifest", () => {
    const m = parseManifest(VALID);
    expect(m.id).toBe("cio");
    expect(m.models.default).toBe("deepseek-v4-pro");
    expect(m.skills.aisa[0]).toEqual({
      repo: "AIsa-team/agent-skills", skill: "twitter-post", ref: "v1.2.0",
    });
    expect(m.env.optional[0].degrade).toBe("skip fallback, Yahoo only");
  });

  it("defaults: skills 缺省为空数组, update 缺省 latest/auto=true, aisa ref 缺省 main, repo 缺省官方库", () => {
    const m = parseManifest(`
spec: agentspec/v1
id: mini
name: Mini
version: 0.0.1
description: d
skills:
  aisa:
    - skill: hello
`);
    expect(m.skills.inline).toEqual([]);
    expect(m.skills.aisa[0]).toEqual({ repo: "AIsa-team/agent-skills", skill: "hello", ref: "main" });
    expect(m.update).toEqual({ channel: "latest", auto: true });
    expect(m.language).toBe("en");
    expect(m.env.required).toEqual([]);
  });

  it("rejects wrong spec version", () => {
    expect(() => parseManifest(VALID.replace("agentspec/v1", "agentspec/v2")))
      .toThrow(AgentSpecError);
  });

  it("rejects invalid id (must be slug)", () => {
    expect(() => parseManifest(VALID.replace("id: cio", "id: 'Bad Id!'")))
      .toThrow(/id/);
  });

  it("rejects non-semver version", () => {
    expect(() => parseManifest(VALID.replace("version: 1.0.0", "version: latest")))
      .toThrow(/version/);
  });
});
