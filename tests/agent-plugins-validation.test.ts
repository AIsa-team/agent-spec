import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AGENT_PLUGIN_SCHEMA_URL,
  parseAgentPluginManifest,
  parseAgentSkillFrontmatter,
  validateAgentPluginDirectory,
} from "../src/agent-plugins.js";

describe("Agent Plugins v1 validation", () => {
  it("rejects unknown portable manifest fields", () => {
    expect(() => parseAgentPluginManifest(JSON.stringify({
      $schema: AGENT_PLUGIN_SCHEMA_URL,
      name: "demo",
      nativeOnly: true,
    }))).toThrow(/unrecognized/i);
  });

  it("requires Agent Skills name to match its parent directory", () => {
    expect(() => parseAgentSkillFrontmatter(
      "---\nname: other\ndescription: Demo skill.\n---\n",
      "demo",
    )).toThrow(/parent directory/);
  });

  it("rejects symlinks anywhere in a portable package", async () => {
    const root = mkdtempSync(join(tmpdir(), "agent-plugin-invalid-"));
    writeFileSync(join(root, "plugin.json"), JSON.stringify({
      $schema: AGENT_PLUGIN_SCHEMA_URL,
      name: "demo",
    }));
    mkdirSync(join(root, "skills", "demo"), { recursive: true });
    writeFileSync(join(root, "skills", "demo", "SKILL.md"),
      "---\nname: demo\ndescription: Demo skill.\n---\n");
    const { symlinkSync } = await import("node:fs");
    symlinkSync("SKILL.md", join(root, "skills", "demo", "escape"));
    await expect(validateAgentPluginDirectory(root)).rejects.toThrow(/symlink/);
  });
});

