import { describe, it, expect } from "vitest";
import { createLock, serializeLock, parseLock } from "../src/lock.js";
import { parseManifest } from "../src/schema/manifest.js";

const manifest = parseManifest(`
spec: agentspec/v1
id: cio
name: Neo CIO
version: 1.0.0
description: d
`);
const resolved = [{
  type: "git" as const,
  url: "https://github.com/example/shared-skills.git",
  path: "packages/twitter-post",
  name: "twitter-post",
  ref: "v1.2.0",
  commit: "a".repeat(40),
  files: [],
}];

describe("lockfile", () => {
  it("creates, serializes, and round-trips", () => {
    const lock = createLock(manifest, resolved);
    expect(lock.skills[0]).toEqual({
      type: "git",
      url: "https://github.com/example/shared-skills.git",
      path: "packages/twitter-post",
      name: "twitter-post",
      ref: "v1.2.0",
      commit: "a".repeat(40),
    });
    expect(lock.skills[0]).not.toHaveProperty("files");
    const text = serializeLock(lock);
    expect(text.endsWith("\n")).toBe(true);
    expect(parseLock(text)).toEqual(lock);
  });

  it("serialization is deterministic regardless of skill order", () => {
    const b = { ...resolved[0], name: "aaa-first", path: "packages/aaa-first" };
    expect(serializeLock(createLock(manifest, [resolved[0], b])))
      .toBe(serializeLock(createLock(manifest, [b, resolved[0]])));
  });

  it("parseLock rejects garbage", () => {
    expect(() => parseLock("{}")).toThrow();
    expect(() => parseLock(JSON.stringify({
      spec: "agentspec-lock/v1", agent: "cio", version: "1.0.0",
      skills: [{ repo: "old/repo", skill: "old", ref: "main", sha: "a".repeat(40) }],
    }))).toThrow();
  });
});
