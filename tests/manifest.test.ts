import { describe, it, expect } from "vitest";
import { parseManifest, AgentSpecError } from "../src/schema/manifest.js";

const VALID = `
spec: agentspec/v1
id: cio
name: Neo CIO
version: 1.0.0
description: AI Chief Investment Officer
language: zh
models:
  default: deepseek-v4-pro
  fast: gemini-2.5-flash
  provider: aisa
env:
  required:
    - name: AISA_API_KEY
      description: models + aisa skills gateway
  optional:
    - name: FINNHUB_API_KEY
      description: price fallback
      degrade: skip fallback, Yahoo only
skills:
  inline:
    - finance/portfolio-report
  remote:
    - type: git
      url: https://github.com/AISA-skills/marketing-skills.git
      path: packages/skills/twitter-post
      name: twitter-post
      ref: v1.2.0
cron: cron/jobs.yaml
update:
  channel: latest
  auto: true
`;

describe("parseManifest", () => {
  it("parses a valid manifest", () => {
    const m = parseManifest(VALID);
    expect(m.id).toBe("cio");
    expect(m.models.default).toBe("deepseek-v4-pro");
    expect(m.skills.remote[0]).toEqual({
      type: "git",
      url: "https://github.com/AISA-skills/marketing-skills.git",
      path: "packages/skills/twitter-post",
      name: "twitter-post",
      ref: "v1.2.0",
    });
    expect(m.env.optional[0].degrade).toBe("skip fallback, Yahoo only");
  });

  it("defaults remote type/ref/name and other manifest fields", () => {
    const m = parseManifest(`
spec: agentspec/v1
id: mini
name: Mini
version: 0.0.1
description: d
skills:
  remote:
    - url: https://gitlab.example.org/agents/shared-skills.git
      path: research/hello
`);
    expect(m.skills.inline).toEqual([]);
    expect(m.skills.remote[0]).toEqual({
      type: "git",
      url: "https://gitlab.example.org/agents/shared-skills.git",
      path: "research/hello",
      name: "hello",
      ref: "main",
    });
    expect(m.update).toEqual({ channel: "latest", auto: true });
    expect(m.language).toBe("en");
    expect(m.env.required).toEqual([]);
  });

  it("rejects the removed skills.aisa field", () => {
    expect(() => parseManifest(`
spec: agentspec/v1
id: old
name: Old
version: 0.0.1
description: d
skills:
  aisa: []
`)).toThrow(/skills.*aisa|unrecognized/i);
  });

  it.each([
    "git@github.com:org/repo.git",
    "ssh://git@github.com/org/repo.git",
    "file:///tmp/repo",
    "https://user:token@example.com/repo.git",
    "https://example.com/repo.git?token=x",
    "https://example.com/repo.git#main",
  ])("rejects unsafe remote URL %s", (url) => {
    expect(() => parseManifest(`
spec: agentspec/v1
id: unsafe
name: Unsafe
version: 0.0.1
description: d
skills:
  remote:
    - url: ${url}
      path: hello
`)).toThrow(/url/i);
  });

  it.each(["/root/skill", "../skill", "a/../skill", ".git/skill", "a\\\\b"])
  ("rejects unsafe remote path %s", (path) => {
    expect(() => parseManifest(`
spec: agentspec/v1
id: unsafe-path
name: Unsafe Path
version: 0.0.1
description: d
skills:
  remote:
    - url: https://example.com/repo.git
      path: '${path}'
`)).toThrow(/path/i);
  });

  it("rejects remote/remote and inline/remote output-name collisions", () => {
    expect(() => parseManifest(`
spec: agentspec/v1
id: collision
name: Collision
version: 0.0.1
description: d
skills:
  inline: [hello]
  remote:
    - { url: https://example.com/a.git, path: skills/hello }
`)).toThrow(/collision/i);

    expect(() => parseManifest(`
spec: agentspec/v1
id: collision
name: Collision
version: 0.0.1
description: d
skills:
  remote:
    - { url: https://example.com/a.git, path: skills/hello }
    - { url: https://example.com/b.git, path: other/hello }
`)).toThrow(/collision/i);
  });

  it("parses setup.python with defaults and rejects bad env names", () => {
    const m = parseManifest(`
spec: agentspec/v1
id: s
name: S
version: 0.0.1
description: d
setup:
  python:
    - name: dsa
      requirements: requirements/dsa.txt
      env: DSA_VENV_PYTHON
      optional: true
    - name: core
      requirements: requirements/core.txt
      env: CORE_PY
`);
    expect(m.setup.python).toHaveLength(2);
    expect(m.setup.python[0].optional).toBe(true);
    expect(m.setup.python[1].optional).toBe(false);
    expect(() => parseManifest(`
spec: agentspec/v1
id: s
name: S
version: 0.0.1
description: d
setup:
  python:
    - { name: x, requirements: r.txt, env: "bad-name" }
`)).toThrow(/env/);
  });

  it("setup defaults to empty python list", () => {
    const m = parseManifest(`
spec: agentspec/v1
id: s2
name: S
version: 0.0.1
description: d
`);
    expect(m.setup.python).toEqual([]);
  });

  it("rejects wrong spec version", () => {
    expect(() => parseManifest(VALID.replace("agentspec/v1", "agentspec/v2")))
      .toThrow(AgentSpecError);
  });

  it("rejects invalid id (must be slug)", () => {
    expect(() => parseManifest(VALID.replace("id: cio", "id: 'Bad Id!'")))
      .toThrow(/id/);
  });

  it("rejects non-semver version", () => {
    expect(() => parseManifest(VALID.replace("version: 1.0.0", "version: latest")))
      .toThrow(/version/);
  });
});

describe("targets.openclaw", () => {
  const base = `
spec: agentspec/v1
id: cio
name: X
version: 1.0.0
description: d
`;
  it("parses command_allowlist and quick_commands with defaults", () => {
    const m = parseManifest(base + `
targets:
  openclaw:
    command_allowlist:
      - "python3 {{SKILLS_DIR}}/aisa-search/scripts/call.py search *"
    quick_commands:
      "888":
        command: "python3 {{PORTFOLIO_DIR}}/valuation_push.py"
`);
    expect(m.targets?.openclaw?.command_allowlist).toHaveLength(1);
    expect(m.targets?.openclaw?.quick_commands["888"]).toEqual(
      { type: "exec", command: "python3 {{PORTFOLIO_DIR}}/valuation_push.py" });
  });
  it("defaults to empty lists when block is empty", () => {
    const m = parseManifest(base + "targets:\n  openclaw: {}\n");
    expect(m.targets?.openclaw?.command_allowlist).toEqual([]);
    expect(m.targets?.openclaw?.quick_commands).toEqual({});
  });
});
