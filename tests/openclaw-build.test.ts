import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAgentProject } from "../src/loader.js";
import { openclawAdapter } from "../src/adapters/openclaw/index.js";
import { OPENCLAW_CRON_NOTE } from "../src/adapters/openclaw/cron-setup.js";

function makeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "agentspec-ob-"));
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
targets:
  openclaw:
    command_allowlist:
      - "python3 {{SKILLS_DIR}}/demo/hello/scripts/run.py *"
    quick_commands:
      "888":
        command: "python3 {{PORTFOLIO_DIR}}/valuation_push.py"
vars:
  PORTFOLIO_DIR: { default: "~/.aisa/agents/cio/portfolio", env: true }
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

describe("openclawAdapter.build", () => {
  let out: string;
  beforeAll(async () => {
    const project = await loadAgentProject(makeFixture());
    out = mkdtempSync(join(tmpdir(), "agentspec-out-"));
    await openclawAdapter.build({ project, resolvedSkills: resolved }, out);
  });

  it("emits the workspace bundle layout", () => {
    for (const f of [
      "workspace/SOUL.md", "workspace/AGENTS.md",
      "workspace/skills/demo/hello/SKILL.md",
      "workspace/skills/twitter-post/SKILL.md",
      "workspace/scripts/ensure-venv.sh",
      "workspace/scripts/ensure-data.sh",
      "workspace/requirements/dsa.txt",
      "workspace/assets/portfolio/engine.py",
      "workspace/cron-setup.sh",
      "agent.json", "agent.lock.json", ".env.example",
    ]) expect(existsSync(join(out, f)), f).toBe(true);
  });

  it("AGENTS.md carries allowlist + quick commands with rendered vars", () => {
    const md = readFileSync(join(out, "workspace/AGENTS.md"), "utf8");
    expect(md).toContain("$HOME/.openclaw/workspace-cio/skills/demo/hello/scripts/run.py");
    expect(md).toContain("888");
    expect(md).toContain("~/.aisa/agents/cio/portfolio/valuation_push.py");
    expect(md).not.toContain("{{");
  });

  it("cron-setup.sh registers each job with the openclaw note appended", () => {
    const sh = readFileSync(join(out, "workspace/cron-setup.sh"), "utf8");
    expect(sh.startsWith("#!/usr/bin/env bash")).toBe(true);
    expect(sh).toContain("openclaw cron add --name tick --agent cio");
    expect(sh).toContain("--cron '0 9 * * *'");
    expect(sh).toContain("--announce");
    expect(sh).toContain(OPENCLAW_CRON_NOTE.trim().slice(0, 20));
  });

  it("SOUL.md is the rendered soul concatenation", () => {
    const soul = readFileSync(join(out, "workspace/SOUL.md"), "utf8");
    expect(soul).toContain("# Identity");
    expect(soul).toContain("# Rules");
  });
});
