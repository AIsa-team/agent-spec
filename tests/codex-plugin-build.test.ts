import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAgentProject } from "../src/loader.js";
import { codexPluginAdapter } from "../src/adapters/codex-plugin/index.js";
import { getAdapter } from "../src/adapters/adapter.js";

function makeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "agentspec-xp-"));
  writeFileSync(join(root, "agent.yaml"), `
spec: agentspec/v1
id: cio
name: Neo CIO
version: 1.0.0
description: AI CIO
skills:
  inline: [demo/hello]
`);
  mkdirSync(join(root, "soul"));
  writeFileSync(join(root, "soul", "01-identity.md"), "# Identity\n{{SKILLS_DIR}}");
  mkdirSync(join(root, "skills", "demo", "hello"), { recursive: true });
  writeFileSync(join(root, "skills", "demo", "hello", "SKILL.md"), "---\nname: hello\n---\nhi");
  return root;
}

describe("codexPluginAdapter.build", () => {
  let out: string;
  beforeAll(async () => {
    const project = await loadAgentProject(makeFixture());
    out = mkdtempSync(join(tmpdir(), "agentspec-xpout-"));
    await codexPluginAdapter.build({ project, resolvedSkills: [] }, out);
  });

  it("registers under target codex-plugin", () => {
    expect(getAdapter("codex-plugin")).toBe(codexPluginAdapter);
  });

  it("emits the plugin layout — no agents/, no settings.json", () => {
    expect(existsSync(join(out, ".codex-plugin/plugin.json"))).toBe(true);
    expect(existsSync(join(out, "skills/soul/SKILL.md"))).toBe(true);
    expect(existsSync(join(out, "skills/demo/hello/SKILL.md"))).toBe(true);
    expect(existsSync(join(out, "agents"))).toBe(false);
    expect(existsSync(join(out, "settings.json"))).toBe(false);
  });

  it("soul skill is marked always-apply and carries the rendered soul", () => {
    const md = readFileSync(join(out, "skills/soul/SKILL.md"), "utf8");
    expect(md).toMatch(/^---\nname: soul\n/);
    expect(md).toMatch(/ALWAYS apply/i);
    expect(md).toContain("# Identity");
    expect(md).toContain("${PLUGIN_ROOT}/skills");
    expect(md).not.toMatch(/\{\{/);
  });
});
