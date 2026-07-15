import { describe, it, expect } from "vitest";
import { parseManifest } from "../src/schema/manifest.js";
import { emptyIndex, parseIndex, upsertIndexEntry, setIndexTemplate, serializeIndex } from "../src/agent-index.js";

const m = parseManifest(`
spec: agentspec/v1
id: cio
name: Neo CIO
version: 1.1.0
description: d
`);

describe("agent index", () => {
  it("upserts a new agent, bumps latest, keeps old versions", () => {
    let idx = emptyIndex();
    idx = upsertIndexEntry(idx, { manifest: { ...m, version: "1.0.0" }, repo: "AIsa-team/aisa_cio_agent", target: "hermes", url: "u1", sha256: "s1" });
    idx = upsertIndexEntry(idx, { manifest: m, repo: "AIsa-team/aisa_cio_agent", target: "hermes", url: "u2", sha256: "s2" });
    expect(idx.agents.cio.latest).toBe("1.1.0");
    expect(Object.keys(idx.agents.cio.versions)).toEqual(["1.0.0", "1.1.0"]);
    expect(idx.agents.cio.versions["1.1.0"].targets.hermes.url).toBe("u2");
  });

  it("does not mutate the input index", () => {
    const idx = emptyIndex();
    upsertIndexEntry(idx, { manifest: m, repo: "r", target: "hermes", url: "u", sha256: "s" });
    expect(idx.agents).toEqual({});
  });

  it("round-trips through serialize/parse and rejects garbage", () => {
    let idx = upsertIndexEntry(emptyIndex(), { manifest: m, repo: "r", target: "hermes", url: "u", sha256: "s" });
    expect(parseIndex(serializeIndex(idx))).toEqual(idx);
    expect(() => parseIndex("{}")).toThrow();
  });
});

describe("index target extensions (2026-07-15)", () => {
  it("carries asset urls and template fields through upsert/setIndexTemplate", () => {
    let idx = upsertIndexEntry(emptyIndex(), {
      manifest: m, repo: "r", target: "hermes", url: "u", sha256: "s",
      assets: { installMd: "u/INSTALL-hermes.md", installSh: "u/install-hermes.sh", guidePrompt: "u/guide-prompt-hermes.txt" },
    });
    idx = setIndexTemplate(idx, { id: "cio", version: "1.1.0", target: "hermes", templateName: "hermes-cio-dev", dev: true });
    idx = setIndexTemplate(idx, { id: "cio", version: "1.1.0", target: "hermes", templateName: "hermes-cio" });
    const t = idx.agents.cio.versions["1.1.0"].targets.hermes;
    expect(t.installMd).toBe("u/INSTALL-hermes.md");
    expect(t.e2bTemplateDev).toBe("hermes-cio-dev");
    expect(t.e2bTemplate).toBe("hermes-cio");
    expect(parseIndex(serializeIndex(idx))).toEqual(idx);   // 扩展字段过 schema 校验
  });

  it("setIndexTemplate throws when the version entry does not exist", () => {
    expect(() => setIndexTemplate(emptyIndex(), { id: "x", version: "1.0.0", target: "hermes", templateName: "t" }))
      .toThrow(/publish before/);
  });
});
