import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAgentProject } from "../src/loader.js";
import { buildPluginTree } from "../src/adapters/plugin-core/build.js";
import { pluginMeta } from "../src/adapters/plugin-core/manifest.js";
import { parseManifest } from "../src/schema/manifest.js";

function makeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "agentspec-pc-"));
  writeFileSync(join(root, "agent.yaml"), `
spec: agentspec/v1
id: cio
name: Neo CIO
version: 1.0.0
description: AI CIO
env:
  required: [{ name: AISA_API_KEY, description: gateway }]
skills:
  inline: [plain/hello, finance/scan, gateway/search]
setup:
  python:
    - { name: dsa, requirements: requirements/dsa.txt, env: DSA_VENV_PYTHON, optional: true }
`);
  mkdirSync(join(root, "requirements"));
  writeFileSync(join(root, "requirements", "dsa.txt"), "pandas\n");
  mkdirSync(join(root, "soul"));
  writeFileSync(join(root, "soul", "01-id.md"), "# Identity");
  // 纯指令 skill:无注入
  mkdirSync(join(root, "skills", "plain", "hello"), { recursive: true });
  writeFileSync(join(root, "skills", "plain", "hello", "SKILL.md"),
    "---\nname: hello\n---\nJust instructions in {{SKILLS_DIR}}.");
  // venv skill:引用 {{DSA_VENV_PYTHON}}
  mkdirSync(join(root, "skills", "finance", "scan"), { recursive: true });
  writeFileSync(join(root, "skills", "finance", "scan", "SKILL.md"),
    "---\nname: scan\n---\nRun {{DSA_VENV_PYTHON}} scan.py in {{PORTFOLIO_DIR}}");
  // env skill:正文提到 AISA_API_KEY
  mkdirSync(join(root, "skills", "gateway", "search"), { recursive: true });
  writeFileSync(join(root, "skills", "gateway", "search", "SKILL.md"),
    "---\nname: search\n---\nCalls the gateway with AISA_API_KEY.");
  writeFileSync(join(root, "skills", "gateway", "search", "icon.bin"),
    Buffer.from([0, 255, 1]));
  return root;
}

describe("buildPluginTree", () => {
  let out: string;
  let runtimeEnvVars: string[];
  beforeAll(async () => {
    const project = await loadAgentProject(makeFixture());
    out = mkdtempSync(join(tmpdir(), "agentspec-pcout-"));
    ({ runtimeEnvVars } = await buildPluginTree(
      { project, resolvedSkills: [] }, out, "${CLAUDE_PLUGIN_ROOT}"));
  });

  it("copies skills preserving inline hierarchy and renders text files", () => {
    const md = readFileSync(join(out, "skills/plain/hello/SKILL.md"), "utf8");
    expect(md).toContain("${CLAUDE_PLUGIN_ROOT}/skills");
    expect(md).not.toMatch(/\{\{/);
  });

  it("keeps binary files byte-for-byte", () => {
    expect(readFileSync(join(out, "skills/gateway/search/icon.bin")))
      .toEqual(Buffer.from([0, 255, 1]));
  });

  it("injects venv bootstrap into venv-referencing skills only", () => {
    expect(readFileSync(join(out, "skills/finance/scan/SKILL.md"), "utf8"))
      .toContain("ensure-venv.sh\" dsa");
    expect(readFileSync(join(out, "skills/plain/hello/SKILL.md"), "utf8"))
      .not.toContain("ensure-venv.sh");
  });

  it("injects env checks for declared env names and runtime vars", () => {
    expect(readFileSync(join(out, "skills/gateway/search/SKILL.md"), "utf8"))
      .toContain("AISA_API_KEY");
    // {{PORTFOLIO_DIR}} 降级成 ${PORTFOLIO_DIR} → 该 skill 也要求 env 检查
    expect(readFileSync(join(out, "skills/finance/scan/SKILL.md"), "utf8"))
      .toContain("PORTFOLIO_DIR");
  });

  it("ships ensure-venv.sh (executable) and requirements", () => {
    const sh = join(out, "scripts/ensure-venv.sh");
    expect(existsSync(sh)).toBe(true);
    expect(statSync(sh).mode & 0o111).toBeTruthy();
    expect(existsSync(join(out, "requirements/dsa.txt"))).toBe(true);
  });

  it("aggregates runtime env vars", () => {
    expect(runtimeEnvVars).toContain("PORTFOLIO_DIR");
  });
});

describe("buildPluginTree env discovery across files", () => {
  // 回归:SKILL.md 按字典序排在 utils.py 之前,若边渲染边写 SKILL.md,
  // utils.py 里才出现的 {{API_TOKEN}} 会在写盘时被漏掉 —— 整 skill 必须先渲染完再写。
  function makeOrderFixture(): string {
    const root = mkdtempSync(join(tmpdir(), "agentspec-pcorder-"));
    writeFileSync(join(root, "agent.yaml"), `
spec: agentspec/v1
id: cio
name: Neo CIO
version: 1.0.0
description: AI CIO
skills:
  inline: [order/late-env]
`);
    mkdirSync(join(root, "skills", "order", "late-env"), { recursive: true });
    writeFileSync(join(root, "skills", "order", "late-env", "SKILL.md"),
      "---\nname: late-env\n---\nNo template refs here.");
    writeFileSync(join(root, "skills", "order", "late-env", "utils.py"),
      "TOKEN = '{{API_TOKEN}}'\n");
    return root;
  }

  it("includes env vars discovered in files that sort after SKILL.md", async () => {
    const project = await loadAgentProject(makeOrderFixture());
    const out = mkdtempSync(join(tmpdir(), "agentspec-pcorderout-"));
    const { runtimeEnvVars } = await buildPluginTree(
      { project, resolvedSkills: [] }, out, "${CLAUDE_PLUGIN_ROOT}");
    expect(runtimeEnvVars).toContain("API_TOKEN");
    expect(readFileSync(join(out, "skills/order/late-env/SKILL.md"), "utf8"))
      .toContain("API_TOKEN");
  });
});

describe("pluginMeta", () => {
  it("derives name/version/description from the manifest", () => {
    const m = parseManifest(
      "spec: agentspec/v1\nid: cio\nname: Neo CIO\nversion: 1.2.3\ndescription: AI CIO\n");
    expect(pluginMeta(m)).toEqual({ name: "cio", version: "1.2.3", description: "AI CIO", author: { name: "AIsa" } });
  });
});
