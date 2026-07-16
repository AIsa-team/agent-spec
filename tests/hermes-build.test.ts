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
setup:
  python:
    - { name: dsa, requirements: requirements/dsa.txt, env: DSA_VENV_PYTHON, optional: true }
`);
  mkdirSync(join(root, "requirements"));
  writeFileSync(join(root, "requirements", "dsa.txt"), "pandas==3.0.2\n");
  mkdirSync(join(root, "soul"));
  writeFileSync(join(root, "soul", "01-identity.md"), "# Identity");
  writeFileSync(join(root, "soul", "02-rules.md"), "# Rules");
  mkdirSync(join(root, "skills", "demo", "hello"), { recursive: true });
  writeFileSync(join(root, "skills", "demo", "hello", "SKILL.md"), "---\nname: hello\n---");
  mkdirSync(join(root, "skills", "demo", "hello", "references"), { recursive: true });
  writeFileSync(join(root, "skills", "demo", "hello", "references", "guide.md"), "guide");
  mkdirSync(join(root, "cron"));
  writeFileSync(join(root, "cron", "jobs.yaml"),
    'jobs:\n  - { id: tick, schedule: "0 9 * * *", prompt: tick, model: default }\n');
  mkdirSync(join(root, "assets", "portfolio"), { recursive: true });
  writeFileSync(join(root, "assets", "portfolio", "engine.py"), "print(1)");
  mkdirSync(join(root, "assets", "portfolio", "__pycache__"), { recursive: true });
  writeFileSync(join(root, "assets", "portfolio", "__pycache__", "engine.cpython-311.pyc"), "junk");
  writeFileSync(join(root, "skills", "demo", "hello", ".DS_Store"), "junk");
  return root;
}

const resolved = [{
  type: "git" as const,
  url: "https://github.com/example/shared-skills.git",
  path: "packages/twitter-post",
  name: "twitter-post",
  ref: "v1.2.0",
  commit: "b".repeat(40),
  files: [
    { path: "SKILL.md", content: Buffer.from("---\nname: twitter-post\n---") },
    { path: "scripts/post.py", content: Buffer.from("print('post')") },
    { path: "assets/icon.bin", content: Buffer.from([0, 255, 1, 2]) },
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
      "skills/demo/hello/references/guide.md",
      "skills/twitter-post/SKILL.md",
      "skills/twitter-post/scripts/post.py",
      "skills/twitter-post/assets/icon.bin",
      "portfolio/engine.py",
      "requirements/dsa.txt",
      "agent.json",
      "agent.lock.json",
      ".env.example",
    ]) expect(existsSync(join(out, f)), f).toBe(true);
  });

  it("preserves remote binary files byte-for-byte", () => {
    expect(readFileSync(join(out, "skills/twitter-post/assets/icon.bin")))
      .toEqual(Buffer.from([0, 255, 1, 2]));
  });

  it("excludes __pycache__ / .pyc / .DS_Store junk from the bundle", () => {
    expect(existsSync(join(out, "portfolio/__pycache__"))).toBe(false);
    expect(existsSync(join(out, "skills/demo/hello/.DS_Store"))).toBe(false);
  });

  it("concatenates soul files in order", () => {
    const soul = readFileSync(join(out, "profile/SOUL.template.md"), "utf8");
    expect(soul.indexOf("# Identity")).toBeLessThan(soul.indexOf("# Rules"));
  });

  it("cron json contains the mapped job", () => {
    const jobs = JSON.parse(readFileSync(join(out, "profile/cron/jobs.template.json"), "utf8"));
    expect(jobs.jobs[0].model).toBe("{{MODEL_DEFAULT}}");
  });

  it("lockfile pins the resolved commit", () => {
    const lock = JSON.parse(readFileSync(join(out, "agent.lock.json"), "utf8"));
    expect(lock.skills[0].commit).toBe("b".repeat(40));
    expect(lock.skills[0]).not.toHaveProperty("sha");
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
