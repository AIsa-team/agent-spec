import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAgentProject } from "../src/loader.js";
import { hermesAdapter } from "../src/adapters/hermes/index.js";
import { buildEnvExample } from "../src/envfile.js";
import { parseManifest } from "../src/schema/manifest.js";

function makeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "agentspec-hb-"));
  writeFileSync(join(root, "agent.yaml"), `
spec: agentspec/v1
id: cio
name: Neo CIO
version: 1.0.0
description: d
language: zh
models: { default: deepseek-v4-pro, provider: aisa }
env:
  required: [{ name: AISA_API_KEY, description: gateway }]
  optional: [{ name: FINNHUB_API_KEY, description: fallback, degrade: yahoo only }]
skills:
  inline: [demo/hello]
cron: cron/jobs.yaml
`);
  mkdirSync(join(root, "soul"));
  writeFileSync(join(root, "soul", "01-identity.md"), "# Identity");
  writeFileSync(join(root, "soul", "02-rules.md"), "# Rules");
  mkdirSync(join(root, "skills", "demo", "hello"), { recursive: true });
  writeFileSync(join(root, "skills", "demo", "hello", "SKILL.md"), "---\nname: hello\n---");
  mkdirSync(join(root, "cron"));
  writeFileSync(join(root, "cron", "jobs.yaml"),
    'jobs:\n  - { id: tick, schedule: "0 9 * * *", prompt: tick, model: default }\n');
  mkdirSync(join(root, "assets", "portfolio"), { recursive: true });
  writeFileSync(join(root, "assets", "portfolio", "engine.py"), "print(1)");
  return root;
}

const resolved = [{
  repo: "AIsa-team/agent-skills", skill: "twitter-post", ref: "v1.2.0",
  sha: "b".repeat(40),
  files: [
    { path: "SKILL.md", content: "---\nname: twitter-post\n---" },
    { path: "scripts/post.py", content: "print('post')" },
  ],
}];

describe("hermesAdapter.build", () => {
  let out: string;
  beforeAll(async () => {
    const project = await loadAgentProject(makeFixture());
    out = mkdtempSync(join(tmpdir(), "agentspec-out-"));
    await hermesAdapter.build({ project, resolvedSkills: resolved }, out);
  });

  it("emits the profile bundle layout", () => {
    for (const f of [
      "profile/SOUL.template.md",
      "profile/config.template.yaml",
      "profile/cron/jobs.template.json",
      "skills/demo/hello/SKILL.md",
      "skills/twitter-post/SKILL.md",
      "skills/twitter-post/scripts/post.py",
      "portfolio/engine.py",
      "agent.lock.json",
      ".env.example",
    ]) expect(existsSync(join(out, f)), f).toBe(true);
  });

  it("concatenates soul files in order", () => {
    const soul = readFileSync(join(out, "profile/SOUL.template.md"), "utf8");
    expect(soul.indexOf("# Identity")).toBeLessThan(soul.indexOf("# Rules"));
  });

  it("cron json contains the mapped job", () => {
    const jobs = JSON.parse(readFileSync(join(out, "profile/cron/jobs.template.json"), "utf8"));
    expect(jobs.jobs[0].model).toBe("{{MODEL_DEFAULT}}");
  });

  it("lockfile pins the resolved sha", () => {
    const lock = JSON.parse(readFileSync(join(out, "agent.lock.json"), "utf8"));
    expect(lock.skills[0].sha).toBe("b".repeat(40));
  });
});

describe("buildEnvExample", () => {
  it("declares defaults, required blank, optional commented", () => {
    const m = parseManifest(readFileSync(join(makeFixture(), "agent.yaml"), "utf8"));
    const env = buildEnvExample(m);
    expect(env).toContain("PROFILE_ID=cio");
    expect(env).toContain("MODEL_DEFAULT=deepseek-v4-pro");
    expect(env).toContain("AISA_API_KEY=");
    expect(env).toMatch(/# FINNHUB_API_KEY=/);
    expect(env).toMatch(/degrade: yahoo only/i);
  });
});
