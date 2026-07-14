import { describe, it, expect } from "vitest";
import { parseManifest } from "../src/schema/manifest.js";
import { emptyIndex, parseIndex, upsertIndexEntry, serializeIndex } from "../src/agent-index.js";

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
