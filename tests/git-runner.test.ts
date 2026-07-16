import { describe, it, expect } from "vitest";
import { realGitRunner } from "../src/skills/git-runner.js";
import { parseLsTree } from "../src/skills/resolver.js";

describe("Git runner primitives", () => {
  it("runs git without a shell and returns binary stdout", async () => {
    const result = await realGitRunner(["--version"], { timeoutMs: 5_000 });
    expect(result.code).toBe(0);
    expect(Buffer.isBuffer(result.stdout)).toBe(true);
    expect(result.stdout.toString("utf8")).toMatch(/^git version /);
  });

  it("parses NUL-delimited ls-tree output without losing paths", () => {
    const raw = Buffer.from(
      `100644 blob ${"a".repeat(40)} 42\tpackages/x/SKILL.md\0`
      + `100755 blob ${"b".repeat(40)} 12\tpackages/x/scripts/run.sh\0`,
    );

    expect(parseLsTree(raw)).toEqual([
      {
        mode: "100644",
        type: "blob",
        object: "a".repeat(40),
        size: 42,
        path: "packages/x/SKILL.md",
      },
      {
        mode: "100755",
        type: "blob",
        object: "b".repeat(40),
        size: 12,
        path: "packages/x/scripts/run.sh",
      },
    ]);
  });

  it("rejects malformed ls-tree records", () => {
    expect(() => parseLsTree(Buffer.from("not-a-tree-record\0")))
      .toThrow(/ls-tree/i);
  });
});
