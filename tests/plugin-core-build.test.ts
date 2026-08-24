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
  inline: [hello, scan, search]
setup:
  python:
    - { name: dsa, requirements: requirements/dsa.txt, env: DSA_VENV_PYTHON, optional: true }
`);
  mkdirSync(join(root, "requirements"));
  writeFileSync(join(root, "requirements", "dsa.txt"), "pandas\n");
  mkdirSync(join(root, "soul"));
  writeFileSync(join(root, "soul", "01-id.md"), "# Identity");
  // 纯指令 skill:无注入
  mkdirSync(join(root, "skills", "hello"), { recursive: true });
  writeFileSync(join(root, "skills", "hello", "SKILL.md"),
    "---\nname: hello\n---\nJust instructions in {{SKILLS_DIR}}.");
  // venv skill:引用 {{DSA_VENV_PYTHON}}
  mkdirSync(join(root, "skills", "scan"), { recursive: true });
  writeFileSync(join(root, "skills", "scan", "SKILL.md"),
    "---\nname: scan\n---\nRun {{DSA_VENV_PYTHON}} scan.py in {{PORTFOLIO_DIR}}");
  // env skill:正文提到 AISA_API_KEY
  mkdirSync(join(root, "skills", "search"), { recursive: true });
  writeFileSync(join(root, "skills", "search", "SKILL.md"),
    "---\nname: search\n---\nCalls the gateway with AISA_API_KEY.");
  writeFileSync(join(root, "skills", "search", "icon.bin"),
    Buffer.from([0, 255, 1]));
  writeFileSync(join(root, "README.md"), "# Neo CIO\n\nSkills live in {{SKILLS_DIR}}.");
  // {{OWNER}} 故意留在 LICENSE 里:它必须原样出现在产物中,证明没被渲染
  writeFileSync(join(root, "LICENSE"), "MIT License\n\nCopyright (c) {{OWNER}}\n");
  writeFileSync(join(root, "NOTES.md"), "private scratch notes");
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

  it("copies each inline skill to a flat skills/<name>/ dir and renders text files", () => {
    const md = readFileSync(join(out, "skills/hello/SKILL.md"), "utf8");
    expect(md).toContain("${CLAUDE_PLUGIN_ROOT}/skills");
    expect(md).not.toMatch(/\{\{/);
  });

  it("ships README.md through template rendering", () => {
    const md = readFileSync(join(out, "README.md"), "utf8");
    expect(md).toContain("${CLAUDE_PLUGIN_ROOT}/skills");
    expect(md).not.toMatch(/\{\{/);
  });

  it("ships LICENSE verbatim, without template rendering", () => {
    // 法律文本必须逐字节保真 —— {{OWNER}} 原样保留,不做变量替换
    expect(readFileSync(join(out, "LICENSE"), "utf8"))
      .toBe("MIT License\n\nCopyright (c) {{OWNER}}\n");
  });

  it("does not sweep other root-level files into the plugin", () => {
    expect(existsSync(join(out, "NOTES.md"))).toBe(false);
    expect(existsSync(join(out, "agent.yaml"))).toBe(false);
  });

  it("keeps binary files byte-for-byte", () => {
    expect(readFileSync(join(out, "skills/search/icon.bin")))
      .toEqual(Buffer.from([0, 255, 1]));
  });

  it("injects venv bootstrap into venv-referencing skills only", () => {
    expect(readFileSync(join(out, "skills/scan/SKILL.md"), "utf8"))
      .toContain("ensure-venv.sh\" dsa");
    expect(readFileSync(join(out, "skills/hello/SKILL.md"), "utf8"))
      .not.toContain("ensure-venv.sh");
  });

  it("injects env checks for declared env names and runtime vars", () => {
    expect(readFileSync(join(out, "skills/search/SKILL.md"), "utf8"))
      .toContain("AISA_API_KEY");
    // {{PORTFOLIO_DIR}} 降级成 ${PORTFOLIO_DIR} → 该 skill 也要求 env 检查
    expect(readFileSync(join(out, "skills/scan/SKILL.md"), "utf8"))
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
  inline: [late-env]
`);
    mkdirSync(join(root, "skills", "late-env"), { recursive: true });
    writeFileSync(join(root, "skills", "late-env", "SKILL.md"),
      "---\nname: late-env\n---\nNo template refs here.");
    writeFileSync(join(root, "skills", "late-env", "utils.py"),
      "TOKEN = '{{API_TOKEN}}'\n");
    return root;
  }

  it("includes env vars discovered in files that sort after SKILL.md", async () => {
    const project = await loadAgentProject(makeOrderFixture());
    const out = mkdtempSync(join(tmpdir(), "agentspec-pcorderout-"));
    const { runtimeEnvVars } = await buildPluginTree(
      { project, resolvedSkills: [] }, out, "${CLAUDE_PLUGIN_ROOT}");
    expect(runtimeEnvVars).toContain("API_TOKEN");
    expect(readFileSync(join(out, "skills/late-env/SKILL.md"), "utf8"))
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

describe("buildPluginTree with vars defaults and assets", () => {
  function makeVarsFixture(): string {
    const root = mkdtempSync(join(tmpdir(), "agentspec-pv-"));
    writeFileSync(join(root, "agent.yaml"), `
spec: agentspec/v1
id: cio
name: Neo CIO
version: 1.0.0
description: d
vars:
  PORTFOLIO_DIR: { default: "~/.aisa/agents/cio/portfolio", env: true }
  OWNER: { default: "Owner" }
skills:
  inline: [report]
`);
    mkdirSync(join(root, "soul"));
    writeFileSync(join(root, "soul", "01-id.md"), "# Id");
    mkdirSync(join(root, "skills", "report"), { recursive: true });
    writeFileSync(join(root, "skills", "report", "SKILL.md"),
      "---\nname: report\n---\nRead `{{PORTFOLIO_DIR}}/portfolio_truth.json` for {{OWNER}}.");
    mkdirSync(join(root, "assets", "portfolio"), { recursive: true });
    writeFileSync(join(root, "assets", "portfolio", "portfolio_truth.json"), "{}");
    writeFileSync(join(root, "assets", "portfolio", "engine.py"), "print(1)");
    return root;
  }

  let out: string;
  let runtimeEnvVars: string[];
  beforeAll(async () => {
    const project = await loadAgentProject(makeVarsFixture());
    out = mkdtempSync(join(tmpdir(), "agentspec-pvout-"));
    ({ runtimeEnvVars } = await buildPluginTree(
      { project, resolvedSkills: [] }, out, "${CLAUDE_PLUGIN_ROOT}"));
  });

  it("renders defaulted vars to literals and keeps them out of runtimeEnvVars", () => {
    const md = readFileSync(join(out, "skills/report/SKILL.md"), "utf8");
    expect(md).toContain("~/.aisa/agents/cio/portfolio/portfolio_truth.json");
    expect(md).toContain("for Owner.");
    expect(md).not.toMatch(/\{\{/);
    expect(runtimeEnvVars).toEqual([]);
  });

  it("injects data bootstrap (not hard env-check) for env-overridable defaulted vars", () => {
    const md = readFileSync(join(out, "skills/report/SKILL.md"), "utf8");
    expect(md).toContain("ensure-data.sh");
    expect(md).toContain("export `PORTFOLIO_DIR` to override");
    expect(md).not.toContain("Required environment");
  });

  it("packages assets and ships executable ensure-data.sh", () => {
    expect(existsSync(join(out, "assets/portfolio/portfolio_truth.json"))).toBe(true);
    expect(existsSync(join(out, "assets/portfolio/engine.py"))).toBe(true);
    const sh = join(out, "scripts/ensure-data.sh");
    expect(existsSync(sh)).toBe(true);
    expect(statSync(sh).mode & 0o111).toBeTruthy();
    expect(readFileSync(sh, "utf8")).toContain("$HOME/.aisa/agents/cio");
  });
});
