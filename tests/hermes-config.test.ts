import { describe, it, expect } from "vitest";
import { parse as parseYaml } from "yaml";
import { buildHermesConfig } from "../src/adapters/hermes/config.js";
import { parseManifest } from "../src/schema/manifest.js";

const manifest = parseManifest(`
spec: agentspec/v1
id: cio
name: Neo CIO
version: 1.0.0
description: d
language: zh
models: { default: deepseek-v4-pro, provider: aisa }
targets:
  hermes:
    config:
      terminal: { cwd: "{{PORTFOLIO_DIR}}" }
      command_allowlist:
        - "python3 {{SKILLS_DIR}}/aisa-search/scripts/call.py search *"
      quick_commands:
        "888": { type: exec, command: "python3 {{PORTFOLIO_DIR}}/valuation_push.py" }
`);

describe("buildHermesConfig", () => {
  const text = buildHermesConfig(manifest);
  // {{TOKENS}} 不是合法 YAML 标量的一部分时会解析失败,先替换成占位再 parse
  const cfg = parseYaml(text.replaceAll(/\{\{(\w+)\}\}/g, "V_$1")) as any;

  it("maps model tokens and language", () => {
    expect(cfg.model.default).toBe("V_MODEL_DEFAULT");
    expect(cfg.model.provider).toBe("V_MODEL_PROVIDER");
    expect(cfg.display.language).toBe("zh");
  });

  it("deep-merges targets.hermes.config (override scalar, add new sections)", () => {
    expect(cfg.terminal.cwd).toBe("V_PORTFOLIO_DIR");
    expect(cfg.terminal.timeout).toBe(180);          // 基础模板值保留
    expect(cfg.command_allowlist).toHaveLength(1);
    expect(cfg.quick_commands["888"].type).toBe("exec");
  });

  it("keeps base sections untouched when no override", () => {
    expect(cfg.approvals.mode).toBe("off");
    expect(cfg.providers.aisa.key_env).toBe("AISA_API_KEY");
  });
});
