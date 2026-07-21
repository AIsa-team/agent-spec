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

describe("codex plugin.json branding/interface", () => {
  it("emits the interface block when branding is declared, omits when absent", async () => {
    const root = makeFixture();
    const yaml = readFileSync(join(root, "agent.yaml"), "utf8");
    writeFileSync(join(root, "agent.yaml"), yaml + `
branding:
  developerName: AIsa
  category: Productivity
  websiteURL: https://console.aisa.one/financial-agent
  privacyPolicyURL: https://aisa.one/privacy
  termsOfServiceURL: https://aisa.one/TOS
  defaultPrompt: ["port", "scan AAPL"]
`);
    const project = await loadAgentProject(root);
    const out = mkdtempSync(join(tmpdir(), "agentspec-xpb-"));
    await codexPluginAdapter.build({ project, resolvedSkills: [] }, out);
    const pj = JSON.parse(readFileSync(join(out, ".codex-plugin/plugin.json"), "utf8"));
    expect(pj.skills).toBe("./skills/");
    expect(pj.author).toEqual({ name: "AIsa", url: "https://console.aisa.one/financial-agent" });
    expect(pj.interface).toMatchObject({
      displayName: "Neo CIO",
      developerName: "AIsa",
      category: "Productivity",
      websiteURL: "https://console.aisa.one/financial-agent",
      privacyPolicyURL: "https://aisa.one/privacy",
      termsOfServiceURL: "https://aisa.one/TOS",
      defaultPrompt: ["port", "scan AAPL"],
    });
    // 未声明的字段不出现(composerIcon/brandColor 暂缺)
    expect(pj.interface).not.toHaveProperty("composerIcon");
    expect(pj.interface).not.toHaveProperty("brandColor");

    // 无 branding 的项目不输出 interface(向后兼容)
    const plain = await loadAgentProject(makeFixture());
    const out2 = mkdtempSync(join(tmpdir(), "agentspec-xpb2-"));
    await codexPluginAdapter.build({ project: plain, resolvedSkills: [] }, out2);
    const pj2 = JSON.parse(readFileSync(join(out2, ".codex-plugin/plugin.json"), "utf8"));
    expect(pj2).not.toHaveProperty("interface");
  });
});
