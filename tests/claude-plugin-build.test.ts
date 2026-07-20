import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAgentProject } from "../src/loader.js";
import { claudePluginAdapter } from "../src/adapters/claude-plugin/index.js";
import { getAdapter } from "../src/adapters/adapter.js";

function makeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "agentspec-cp-"));
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
  writeFileSync(join(root, "soul", "01-identity.md"), "# Identity\nBe rigorous. {{SKILLS_DIR}}");
  writeFileSync(join(root, "soul", "02-rules.md"), "# Rules");
  mkdirSync(join(root, "skills", "demo", "hello"), { recursive: true });
  writeFileSync(join(root, "skills", "demo", "hello", "SKILL.md"), "---\nname: hello\n---\nhi");
  return root;
}

describe("claudePluginAdapter.build", () => {
  let out: string;
  beforeAll(async () => {
    const project = await loadAgentProject(makeFixture());
    out = mkdtempSync(join(tmpdir(), "agentspec-cpout-"));
    await claudePluginAdapter.build({ project, resolvedSkills: [] }, out);
  });

  it("registers under target claude-plugin", () => {
    expect(getAdapter("claude-plugin")).toBe(claudePluginAdapter);
  });

  it("emits the plugin layout", () => {
    for (const f of [
      ".claude-plugin/plugin.json", "agents/cio.md", "settings.json",
      "skills/demo/hello/SKILL.md",
    ]) expect(existsSync(join(out, f)), f).toBe(true);
  });

  it("plugin.json carries manifest meta", () => {
    const pj = JSON.parse(readFileSync(join(out, ".claude-plugin/plugin.json"), "utf8"));
    expect(pj).toMatchObject({ name: "cio", version: "1.0.0", description: "AI CIO" });
  });

  it("agents/cio.md has frontmatter and the full soul, rendered, in order", () => {
    const md = readFileSync(join(out, "agents/cio.md"), "utf8");
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain("name: cio");
    expect(md.indexOf("# Identity")).toBeLessThan(md.indexOf("# Rules"));
    expect(md).toContain("${CLAUDE_PLUGIN_ROOT}/skills");
    expect(md).not.toMatch(/\{\{/);
  });

  it("settings.json activates the agent as main-thread default", () => {
    expect(JSON.parse(readFileSync(join(out, "settings.json"), "utf8")))
      .toEqual({ agent: "cio" });
  });
});
