import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAgentProject } from "../src/loader.js";
import { codexPluginAdapter } from "../src/adapters/codex-plugin/index.js";
import { getAdapter } from "../src/adapters/adapter.js";

function makeFixture(name = "Neo CIO"): string {
  const root = mkdtempSync(join(tmpdir(), "agentspec-xp-"));
  writeFileSync(join(root, "agent.yaml"), `
spec: agentspec/v1
id: cio
name: ${JSON.stringify(name)}
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

describe("codexPluginAdapter.build — manifest name with quotes", () => {
  // Guards against raw interpolation of m.name into the hand-built YAML frontmatter:
  // a name containing " or \ must not corrupt the description line.
  it("JSON-encodes the description so a quoted name stays parseable", async () => {
    const project = await loadAgentProject(makeFixture('Neo "CIO"'));
    const out = mkdtempSync(join(tmpdir(), "agentspec-xpout-quote-"));
    await codexPluginAdapter.build({ project, resolvedSkills: [] }, out);

    const md = readFileSync(join(out, "skills/soul/SKILL.md"), "utf8");
    expect(md).toMatch(/^---\nname: soul\n/);
    const descLine = md.split("\n").find((l) => l.startsWith("description: "));
    const expected = JSON.stringify(
      'Neo "CIO" core identity and operating rules. ALWAYS apply this skill: load it at the start of EVERY conversation before any other skill.',
    );
    expect(descLine).toBe(`description: ${expected}`);
  });
});

describe("codexPluginAdapter SessionStart hook (SOUL dual-channel)", () => {
  it("emits hooks.json injecting soul-context.md at session start", async () => {
    const project = await loadAgentProject(makeFixture());
    const out = mkdtempSync(join(tmpdir(), "agentspec-xph-"));
    await codexPluginAdapter.build({ project, resolvedSkills: [] }, out);

    const hooks = JSON.parse(readFileSync(join(out, "hooks/hooks.json"), "utf8"));
    const entry = hooks.hooks.SessionStart[0].hooks[0];
    expect(entry.type).toBe("command");
    expect(entry.command).toBe('cat "${PLUGIN_ROOT}/hooks/soul-context.md"');

    const ctx = readFileSync(join(out, "hooks/soul-context.md"), "utf8");
    expect(ctx).toContain("# Identity");
    expect(ctx).toContain("${PLUGIN_ROOT}/skills");
    expect(ctx).not.toMatch(/\{\{/);
    // 兜底 skill 仍在(hook 未被信任前的通道)
    expect(readFileSync(join(out, "skills/soul/SKILL.md"), "utf8")).toMatch(/ALWAYS apply/i);
  });
});
