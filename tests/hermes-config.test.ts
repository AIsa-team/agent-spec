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
    expect(cfg.skills.external_dirs).toContain("V_SKILLS_DIR");
    expect(cfg.skills.external_dirs).not.toContain("~/.hermes/skills/");
  });

  it("injects a dynamic aisa model list when provided, keeps static list otherwise", () => {
    const dynamic = parseYaml(buildHermesConfig(manifest, ["m-b", "m-a"]).replaceAll(/\{\{(\w+)\}\}/g, "V_$1")) as any;
    expect(dynamic.providers.aisa.models).toEqual(["m-a", "m-b"]);   // 注入且排序
    expect(cfg.providers.aisa.models.length).toBeGreaterThan(0);     // 未注入时保留静态列表
  });
});

// hermes 读 config.yaml 时不会先替换 {{TOKEN}} —— 上面的用例替换后再 parse,
// 恰好绕开了唯一会炸的情况。这里按 hermes 的方式原样解析。
describe("buildHermesConfig output parses without substituting tokens first", () => {
  const leading = parseManifest(`
spec: agentspec/v1
id: cio
name: Neo CIO
version: 1.0.0
description: d
language: zh
models: { default: deepseek-v4-pro, provider: aisa }
setup:
  python:
    - { name: sec, requirements: requirements/sec.txt, env: SEC_VENV_PYTHON, optional: true }
targets:
  hermes:
    config:
      terminal: { cwd: "{{PORTFOLIO_DIR}}" }
      command_allowlist:
        - "python3 {{SKILLS_DIR}}/marketpulse/scripts/market_client.py *"
        - "{{SEC_VENV_PYTHON}} {{SKILLS_DIR}}/sec-filings/scripts/sec_boot.py *"
        - "{{SEC_VENV_PYTHON}} -c *"
      quick_commands:
        "888": { type: exec, command: "{{PORTFOLIO_DIR}}/valuation_push.py" }
`);
  const text = buildHermesConfig(leading);

  it("quotes scalars that begin with a template token", () => {
    // 以 {{VAR}} 开头的裸标量会被 YAML 当成 flow mapping,整份文件解析失败;
    // 而 hermes 对坏 config 是静默回退默认值 —— 模型 / command_allowlist /
    // quick_commands 全部失效且不报错。所以必须能原样 parse。
    expect(() => parseYaml(text)).not.toThrow();

    const cfg = parseYaml(text) as any;
    expect(cfg.command_allowlist).toEqual([
      "python3 {{SKILLS_DIR}}/marketpulse/scripts/market_client.py *",
      "{{SEC_VENV_PYTHON}} {{SKILLS_DIR}}/sec-filings/scripts/sec_boot.py *",
      "{{SEC_VENV_PYTHON}} -c *",
    ]);
    expect(cfg.quick_commands["888"].command).toBe("{{PORTFOLIO_DIR}}/valuation_push.py");
    expect(cfg.terminal.cwd).toBe("{{PORTFOLIO_DIR}}");
  });

  it("leaves mid-string tokens unquoted so the diff stays minimal", () => {
    expect(text).toContain("- python3 {{SKILLS_DIR}}/marketpulse/scripts/market_client.py *");
  });
});

describe("buildHermesConfig MCP passthrough", () => {
  it("preserves the AISA MCP URL and literal API-key placeholder without leaking the environment", () => {
    const previousApiKey = process.env.AISA_API_KEY;
    const realApiKey = "aisa-real-key-must-not-leak";
    process.env.AISA_API_KEY = realApiKey;

    try {
      const mcpManifest = parseManifest(`
spec: agentspec/v1
id: cmo
name: AIsa CMO
version: 0.1.2
description: d
targets:
  hermes:
    config:
      mcp_servers:
        aisa-tools:
          url: https://tools.aisa.one/mcp
          headers:
            Authorization: 'Bearer \${AISA_API_KEY}'
`);

      const text = buildHermesConfig(mcpManifest);
      const cfg = parseYaml(text) as any;

      expect(cfg.mcp_servers["aisa-tools"]).toEqual({
        url: "https://tools.aisa.one/mcp",
        headers: { Authorization: "Bearer ${AISA_API_KEY}" },
      });
      expect(text).toContain("Bearer ${AISA_API_KEY}");
      expect(text).not.toContain(realApiKey);
    } finally {
      if (previousApiKey === undefined) delete process.env.AISA_API_KEY;
      else process.env.AISA_API_KEY = previousApiKey;
    }
  });
});
