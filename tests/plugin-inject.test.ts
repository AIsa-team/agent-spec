import { describe, it, expect } from "vitest";
import {
  injectAfterFrontmatter, venvBootstrapBlock, envCheckBlock, ensureVenvScript,
  dataBootstrapBlock, ensureDataScript,
} from "../src/adapters/plugin-core/inject.js";
import { parseManifest } from "../src/schema/manifest.js";

const manifest = parseManifest(`
spec: agentspec/v1
id: cio
name: Neo CIO
version: 1.0.0
description: d
env:
  required: [{ name: AISA_API_KEY, description: AISA gateway key, setupUrl: "https://console.aisa.one/get-started" }]
setup:
  python:
    - { name: dsa, requirements: requirements/dsa.txt, env: DSA_VENV_PYTHON, optional: true }
`);
const root = "${CLAUDE_PLUGIN_ROOT}";

describe("injectAfterFrontmatter", () => {
  it("inserts after the closing frontmatter fence", () => {
    const out = injectAfterFrontmatter("---\nname: x\n---\nBody", "INJECTED");
    expect(out).toBe("---\nname: x\n---\n\nINJECTED\n\nBody");
  });
  it("prepends when there is no frontmatter", () => {
    expect(injectAfterFrontmatter("Body", "INJECTED")).toBe("INJECTED\n\nBody");
  });
});

describe("venvBootstrapBlock", () => {
  it("tells the model to run ensure-venv.sh before first use", () => {
    const block = venvBootstrapBlock(manifest.setup.python[0], root);
    expect(block).toContain('bash "${CLAUDE_PLUGIN_ROOT}/scripts/ensure-venv.sh" dsa');
    expect(block).toContain("${CLAUDE_PLUGIN_ROOT}/.venvs/dsa/bin/python");
  });
});

describe("envCheckBlock", () => {
  it("lists each var with its manifest description", () => {
    const block = envCheckBlock(["AISA_API_KEY"], manifest);
    expect(block).toContain("AISA_API_KEY");
    expect(block).toContain("AISA gateway key");
    expect(block).toMatch(/不要静默失败|never fail silently/i);
  });

  // 转化引导:开通链接、credentials 粘贴代写、当轮重试缺一不可
  it("guides acquisition and in-conversation setup, not just export", () => {
    const block = envCheckBlock(["AISA_API_KEY"], manifest);
    expect(block).toContain("https://console.aisa.one/get-started");
    expect(block).toContain("~/.aisa/credentials");
    expect(block).toContain("chmod 600");
    expect(block).toMatch(/retry the user's original command/i);
    expect(block).toMatch(/no host restart/i);
  });

  it("omits the sign-up line for vars without setupUrl", () => {
    const noUrl = parseManifest(
      "spec: agentspec/v1\nid: x\nname: X\nversion: 1.0.0\ndescription: d\n" +
      "env:\n  required: [{ name: OTHER_KEY, description: other }]\n");
    const block = envCheckBlock(["OTHER_KEY"], noUrl);
    expect(block).not.toContain("Get one at");
    expect(block).toContain("~/.aisa/credentials");
  });
});

describe("ensureVenvScript", () => {
  it("creates the venv idempotently from packaged requirements", () => {
    const sh = ensureVenvScript(manifest, root);
    expect(sh).toMatch(/^#!\/usr\/bin\/env bash/);
    expect(sh).toContain('dsa) REQ="requirements/dsa.txt"');
    expect(sh).toContain("python3 -m venv");
    expect(sh).toContain("pip install -r");
    // 幂等:解释器已存在即退出
    expect(sh).toContain('[ -x "$PY" ] && exit 0');
  });
});

describe("dataBootstrapBlock / ensureDataScript", () => {
  const m2 = parseManifest(`
spec: agentspec/v1
id: cio
name: Neo CIO
version: 1.0.0
description: d
vars:
  PORTFOLIO_DIR: { default: "~/.aisa/agents/cio/portfolio", env: true, description: 组合数据目录 }
`);

  it("block points at ensure-data.sh and lists default paths with override hint", () => {
    const block = dataBootstrapBlock(
      [{ name: "PORTFOLIO_DIR", decl: m2.vars.PORTFOLIO_DIR }], m2, "${CLAUDE_PLUGIN_ROOT}");
    expect(block).toContain('bash "${CLAUDE_PLUGIN_ROOT}/scripts/ensure-data.sh"');
    expect(block).toContain("~/.aisa/agents/cio/portfolio");
    expect(block).toContain("组合数据目录");
    expect(block).toContain("export `PORTFOLIO_DIR` to override");
    expect(block).toContain("never overwrites existing data");
  });

  it("ensure-data.sh seeds copy-if-missing into ~/.aisa/agents/<id>", () => {
    const sh = ensureDataScript(m2);
    expect(sh).toMatch(/^#!\/usr\/bin\/env bash/);
    expect(sh).toContain('DST="${AISA_DATA_DIR:-$HOME/.aisa/agents/cio}"');
    expect(sh).toContain('[ -e "$DST/$f" ] || cp "$ROOT/assets/$f" "$DST/$f"');
  });
});
