import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAgentProject } from "../src/loader.js";

const MANIFEST = `
spec: agentspec/v1
id: fix
name: Fixture
version: 0.0.1
description: fixture agent
skills:
  inline:
    - demo/hello
cron: cron/jobs.yaml
`;

function makeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "agentspec-fix-"));
  writeFileSync(join(root, "agent.yaml"), MANIFEST);
  mkdirSync(join(root, "soul"));
  writeFileSync(join(root, "soul", "SOUL.md"), "# Soul of {{OWNER}}");
  mkdirSync(join(root, "skills", "demo", "hello"), { recursive: true });
  writeFileSync(join(root, "skills", "demo", "hello", "SKILL.md"), "---\nname: hello\n---\nhi");
  mkdirSync(join(root, "cron"));
  writeFileSync(join(root, "cron", "jobs.yaml"),
    'jobs:\n  - { id: tick, schedule: "0 9 * * *", prompt: tick }\n');
  mkdirSync(join(root, "assets", "engine"), { recursive: true });
  writeFileSync(join(root, "assets", "engine", "main.py"), "print('hi')");
  return root;
}

describe("loadAgentProject", () => {
  let root: string;
  beforeAll(() => { root = makeFixture(); });

  it("loads manifest, soul, cron, skills, assets", async () => {
    const p = await loadAgentProject(root);
    expect(p.manifest.id).toBe("fix");
    expect(p.soulFiles).toEqual([{ relPath: "SOUL.md", content: "# Soul of {{OWNER}}" }]);
    expect(p.cronJobs[0].id).toBe("tick");
    expect(p.inlineSkillDirs[0]).toBe(join(root, "skills", "demo", "hello"));
    expect(p.assetEntries).toEqual(["engine"]);
  });

  it("fails when a declared inline skill dir is missing SKILL.md", async () => {
    const bad = makeFixture();
    writeFileSync(join(bad, "agent.yaml"),
      MANIFEST.replace("demo/hello", "demo/missing"));
    await expect(loadAgentProject(bad)).rejects.toThrow(/demo\/missing/);
  });

  it("fails when a declared setup requirements file is missing", async () => {
    const bad = makeFixture();
    writeFileSync(join(bad, "agent.yaml"),
      MANIFEST + "setup:\n  python:\n    - { name: x, requirements: requirements/x.txt, env: X_PY }\n");
    await expect(loadAgentProject(bad)).rejects.toThrow(/requirements\/x.txt/);
  });

  it("fails when agent.yaml is absent", async () => {
    const empty = mkdtempSync(join(tmpdir(), "agentspec-empty-"));
    await expect(loadAgentProject(empty)).rejects.toThrow(/agent.yaml/);
  });
});
