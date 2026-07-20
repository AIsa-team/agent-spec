import { describe, it, expect } from "vitest";
import {
  injectAfterFrontmatter, venvBootstrapBlock, envCheckBlock, ensureVenvScript,
} from "../src/adapters/plugin-core/inject.js";
import { parseManifest } from "../src/schema/manifest.js";

const manifest = parseManifest(`
spec: agentspec/v1
id: cio
name: Neo CIO
version: 1.0.0
description: d
env:
  required: [{ name: AISA_API_KEY, description: AISA gateway key }]
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
    expect(block).toMatch(/不要静默失败|do not fail silently/i);
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
