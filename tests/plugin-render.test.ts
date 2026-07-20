import { describe, it, expect } from "vitest";
import { pluginVars, renderPluginText, TEXT_EXTS } from "../src/adapters/plugin-core/render.js";
import { parseManifest } from "../src/schema/manifest.js";

const manifest = parseManifest(`
spec: agentspec/v1
id: cio
name: Neo CIO
version: 1.0.0
description: d
setup:
  python:
    - { name: dsa, requirements: requirements/dsa.txt, env: DSA_VENV_PYTHON, optional: true }
`);

describe("pluginVars", () => {
  it("maps SKILLS_DIR and each python setup env under the plugin root", () => {
    const vars = pluginVars(manifest, "${CLAUDE_PLUGIN_ROOT}");
    expect(vars.SKILLS_DIR).toBe("${CLAUDE_PLUGIN_ROOT}/skills");
    expect(vars.DSA_VENV_PYTHON).toBe("${CLAUDE_PLUGIN_ROOT}/.venvs/dsa/bin/python");
  });
});

describe("renderPluginText", () => {
  const vars = pluginVars(manifest, "${CLAUDE_PLUGIN_ROOT}");

  it("substitutes known vars", () => {
    const r = renderPluginText("run {{DSA_VENV_PYTHON}} in {{SKILLS_DIR}}/x", vars);
    expect(r.text).toBe(
      "run ${CLAUDE_PLUGIN_ROOT}/.venvs/dsa/bin/python in ${CLAUDE_PLUGIN_ROOT}/skills/x");
    expect(r.runtimeEnvVars).toEqual([]);
  });

  it("downgrades unknown vars to shell env refs and reports them", () => {
    const r = renderPluginText("cd {{PORTFOLIO_DIR}} && ls {{PORTFOLIO_DIR}}", vars);
    expect(r.text).toBe("cd ${PORTFOLIO_DIR} && ls ${PORTFOLIO_DIR}");
    expect(r.runtimeEnvVars).toEqual(["PORTFOLIO_DIR"]);   // 去重
  });

  it("leaves no {{...}} residue", () => {
    const r = renderPluginText("{{SKILLS_DIR}} {{ANY_THING}}", vars);
    expect(r.text).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it("declares the text extension set", () => {
    for (const ext of [".md", ".py", ".sh", ".txt", ".yaml", ".yml", ".json"])
      expect(TEXT_EXTS.has(ext)).toBe(true);
    expect(TEXT_EXTS.has(".bin")).toBe(false);
  });
});
