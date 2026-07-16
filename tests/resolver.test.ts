import { existsSync, mkdirSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { resolveSkills, type RemoteSkillLimits } from "../src/skills/resolver.js";
import type { GitRunner } from "../src/skills/git-runner.js";
import type { RemoteSkillRef } from "../src/schema/manifest.js";

const COMMIT = "a".repeat(40);
const URL = "https://gitlab.example.org/example/shared-skills.git";

interface TreeFile {
  path: string;
  content: Buffer;
  mode?: string;
  type?: string;
  size?: number | null;
}

function lsTree(files: TreeFile[]): Buffer {
  return Buffer.from(files.map((file, index) => {
    const mode = file.mode ?? "100644";
    const type = file.type ?? "blob";
    const size = file.size === null ? "-" : String(file.size ?? file.content.length);
    return `${mode} ${type} ${String(index + 1).padStart(40, "b")} ${size}\t${file.path}\0`;
  }).join(""));
}

function fakeGit(
  trees: Record<string, TreeFile[]>,
  opts: { fetchFails?: boolean } = {},
): GitRunner & { calls: string[][]; repoDirs: string[] } {
  const calls: string[][] = [];
  const repoDirs: string[] = [];
  const runner: GitRunner = async (args) => {
    calls.push(args);
    if (args[0] === "init") {
      const repoDir = args.at(-1)!;
      repoDirs.push(repoDir);
      mkdirSync(repoDir, { recursive: true });
      return { code: 0, stdout: Buffer.alloc(0), stderr: "" };
    }
    if (args[0] === "fetch") {
      return opts.fetchFails
        ? { code: 1, stdout: Buffer.alloc(0), stderr: "remote rejected ref" }
        : { code: 0, stdout: Buffer.alloc(0), stderr: "" };
    }
    if (args[0] === "rev-parse") {
      return { code: 0, stdout: Buffer.from(`${COMMIT}\n`), stderr: "" };
    }
    if (args[0] === "ls-tree") {
      const sourcePath = args.at(-1)!;
      const files = trees[sourcePath] ?? [];
      return { code: 0, stdout: lsTree(files), stderr: "" };
    }
    if (args[0] === "show") {
      const fullPath = args[1].slice(args[1].indexOf(":") + 1);
      const file = Object.values(trees).flat().find((candidate) => candidate.path === fullPath);
      return file
        ? { code: 0, stdout: file.content, stderr: "" }
        : { code: 1, stdout: Buffer.alloc(0), stderr: "missing blob" };
    }
    return { code: 1, stdout: Buffer.alloc(0), stderr: `unexpected git ${args.join(" ")}` };
  };
  return Object.assign(runner, { calls, repoDirs });
}

function ref(path: string, name = path.split("/").at(-1)!): RemoteSkillRef {
  return { type: "git", url: URL, path, name, ref: "v1.2.0" };
}

const TWITTER_FILES: TreeFile[] = [
  { path: "packages/twitter/SKILL.md", content: Buffer.from("---\nname: twitter\n---") },
  { path: "packages/twitter/scripts/post.py", content: Buffer.from("print('post')") },
  { path: "packages/twitter/assets/icon.bin", content: Buffer.from([0, 255, 1, 2]) },
];

describe("resolveSkills", () => {
  it("resolves multiple paths with one fetch and preserves binary files", async () => {
    const git = fakeGit({
      "packages/twitter": TWITTER_FILES,
      "packages/search": [
        { path: "packages/search/SKILL.md", content: Buffer.from("# Search") },
      ],
    });

    const resolved = await resolveSkills([
      ref("packages/twitter", "twitter-post"),
      ref("packages/search", "web-search"),
    ], { git });

    expect(git.calls.filter((args) => args[0] === "fetch")).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      type: "git", url: URL, path: "packages/twitter", name: "twitter-post",
      ref: "v1.2.0", commit: COMMIT,
    });
    expect(resolved[0].files.map((file) => file.path)).toEqual([
      "SKILL.md", "assets/icon.bin", "scripts/post.py",
    ]);
    expect(resolved[0].files.find((file) => file.path === "assets/icon.bin")?.content)
      .toEqual(Buffer.from([0, 255, 1, 2]));
    expect(git.repoDirs.every((dir) => !existsSync(dir))).toBe(true);
  });

  it("reports a missing ref without leaking git stderr", async () => {
    const git = fakeGit({}, { fetchFails: true });
    await expect(resolveSkills([ref("packages/nope")], { git }))
      .rejects.toThrow(/could not fetch.*v1\.2\.0.*gitlab\.example\.org/i);
    await expect(resolveSkills([ref("packages/nope")], { git }))
      .rejects.not.toThrow(/remote rejected ref/);
  });

  it("requires SKILL.md directly inside the selected path", async () => {
    const git = fakeGit({
      "packages/no-root": [
        { path: "packages/no-root/nested/SKILL.md", content: Buffer.from("nested") },
      ],
    });
    await expect(resolveSkills([ref("packages/no-root")], { git }))
      .rejects.toThrow(/SKILL\.md/);
  });

  it.each([
    { mode: "120000", type: "blob", label: "symlink" },
    { mode: "160000", type: "commit", label: "gitlink" },
  ])("rejects $label entries", async ({ mode, type }) => {
    const git = fakeGit({
      "packages/unsafe": [
        { path: "packages/unsafe/SKILL.md", content: Buffer.from("ok") },
        { path: "packages/unsafe/linked", content: Buffer.from("target"), mode, type, size: null },
      ],
    });
    await expect(resolveSkills([ref("packages/unsafe")], { git }))
      .rejects.toThrow(/unsupported git entry/i);
  });

  it.each([
    { limits: { maxFiles: 1 }, message: /too many files/i },
    { limits: { maxFileBytes: 3 }, message: /file too large/i },
    { limits: { maxTotalBytes: 5 }, message: /total size/i },
  ] as { limits: Partial<RemoteSkillLimits>; message: RegExp }[])
  ("enforces resource limit $limits", async ({ limits, message }) => {
    const git = fakeGit({
      "packages/limited": [
        { path: "packages/limited/SKILL.md", content: Buffer.from("1234") },
        { path: "packages/limited/a.txt", content: Buffer.from("1234") },
      ],
    });
    await expect(resolveSkills([ref("packages/limited")], { git, limits }))
      .rejects.toThrow(message);
  });

  it("rejects a non-commit FETCH_HEAD", async () => {
    const git = fakeGit({ "packages/x": TWITTER_FILES });
    const wrapped: GitRunner = async (args, options) => args[0] === "rev-parse"
      ? { code: 0, stdout: Buffer.from("not-a-commit\n"), stderr: "" }
      : git(args, options);
    await expect(resolveSkills([ref("packages/x")], { git: wrapped }))
      .rejects.toThrow(/commit/i);
  });
});
