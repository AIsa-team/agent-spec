import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentPluginAdapter } from "../src/adapters/agent-plugin/index.js";
import { getAdapter } from "../src/adapters/adapter.js";
import { loadAgentProject } from "../src/loader.js";
import {
  AGENT_PLUGIN_SCHEMA_URL,
  validateAgentPluginDirectory,
} from "../src/agent-plugins.js";

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "agentspec-portable-"));
  writeFileSync(join(root, "agent.yaml"), `
spec: agentspec/v1
id: demo-agent
name: Demo Agent
version: 1.2.3
description: Portable demo
vars:
  PROFILE_DIR: { default: "~/.aisa/agents/demo-agent", env: true }
skills:
  inline: [scan]
setup:
  python:
    - name: scan
      requirements: requirements/scan.txt
      env: SCAN_PYTHON
      optional: true
branding:
  developerName: AIsa
  websiteURL: https://aisa.one/agents/demo-agent
  keywords: [demo, portable]
`);
  mkdirSync(join(root, "soul"));
  writeFileSync(join(root, "soul", "SOUL.md"), "# Demo\nUse {{SKILLS_DIR}}.");
  mkdirSync(join(root, "skills", "scan", "scripts"), { recursive: true });
  writeFileSync(join(root, "skills", "scan", "SKILL.md"), [
    "---", "name: scan", "description: Scan a demo symbol.", "metadata:",
    "  aisa:", "    bins: [python3]", "allowed-tools: [Bash, Read]", "---", "",
    "Run {{SCAN_PYTHON}} {{SKILLS_DIR}}/scan/scripts/run.py.",
  ].join("\n"));
  writeFileSync(join(root, "skills", "scan", "scripts", "run.py"), "print('ok')\n");
  mkdirSync(join(root, "requirements"));
  writeFileSync(join(root, "requirements", "scan.txt"), "requests==2.32.0\n");
  return root;
}

describe("agentPluginAdapter", () => {
  it("builds and validates the Agent Plugins v1 portable floor", async () => {
    expect(getAdapter("agent-plugin")).toBe(agentPluginAdapter);
    const project = await loadAgentProject(fixture());
    const out = mkdtempSync(join(tmpdir(), "agentspec-portable-out-"));
    const result = await agentPluginAdapter.build({ project, resolvedSkills: [] }, out);

    expect(result.files).toContain("plugin.json");
    expect(result.files).toContain("skills/soul/SKILL.md");
    expect(result.files).toContain("skills/scan/scripts/aisa-bootstrap.sh");
    expect(existsSync(join(out, ".codex-plugin"))).toBe(false);
    expect(existsSync(join(out, ".claude-plugin"))).toBe(false);

    const manifest = JSON.parse(readFileSync(join(out, "plugin.json"), "utf8"));
    expect(manifest).toMatchObject({
      $schema: AGENT_PLUGIN_SCHEMA_URL,
      name: "demo-agent",
      version: "1.2.3",
      homepage: "https://aisa.one/agents/demo-agent",
    });
    await expect(validateAgentPluginDirectory(out)).resolves.toMatchObject({ name: "demo-agent" });
  });

  it("uses skill-root references and no host-provided PLUGIN_ROOT", async () => {
    const project = await loadAgentProject(fixture());
    const out = mkdtempSync(join(tmpdir(), "agentspec-portable-out-"));
    await agentPluginAdapter.build({ project, resolvedSkills: [] }, out);
    const md = readFileSync(join(out, "skills", "scan", "SKILL.md"), "utf8");
    expect(md).toContain("scripts/run.py");
    expect(md).toContain("~/.aisa/agents/demo-agent/.venvs/scan/bin/python");
    expect(md).toContain('bash "scripts/aisa-bootstrap.sh" venv scan');
    expect(md).not.toContain("PLUGIN_ROOT");
    expect(md).not.toContain("__AISA_PORTABLE_PLUGIN_ROOT__");
    expect(md).not.toMatch(/\{\{[A-Z_][A-Z0-9_]*\}\}/);
    expect(md).toContain('aisa: \'{"bins":["python3"]}\'');
    expect(md).toContain("allowed-tools: Bash Read");
  });
});
