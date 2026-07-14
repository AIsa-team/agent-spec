import { describe, it, expect } from "vitest";
import { resolveSkills } from "../src/skills/resolver.js";

const SHA = "a".repeat(40);

function fakeFetch(routes: Record<string, unknown>): (url: string) => Promise<Response> {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    for (const [prefix, body] of Object.entries(routes)) {
      if (url.startsWith(prefix)) {
        return new Response(
          typeof body === "string" ? body : JSON.stringify(body),
          { status: 200 },
        );
      }
    }
    return new Response("not found", { status: 404 });
  };
  (fn as any).calls = calls;
  return fn;
}

const ROUTES = {
  [`https://api.github.com/repos/AIsa-team/agent-skills/commits/v1.2.0`]: { sha: SHA },
  [`https://api.github.com/repos/AIsa-team/agent-skills/git/trees/${SHA}?recursive=1`]: {
    tree: [
      { path: "twitter-post/SKILL.md", type: "blob" },
      { path: "twitter-post/scripts/post.py", type: "blob" },
      { path: "other-skill/SKILL.md", type: "blob" },
    ],
  },
  [`https://raw.githubusercontent.com/AIsa-team/agent-skills/${SHA}/twitter-post/SKILL.md`]:
    "---\nname: twitter-post\n---",
  [`https://raw.githubusercontent.com/AIsa-team/agent-skills/${SHA}/twitter-post/scripts/post.py`]:
    "print('post')",
};

describe("resolveSkills", () => {
  const ref = { repo: "AIsa-team/agent-skills", skill: "twitter-post", ref: "v1.2.0" };

  it("resolves ref to SHA and fetches only that skill's files", async () => {
    const [r] = await resolveSkills([ref], fakeFetch(ROUTES) as any);
    expect(r.sha).toBe(SHA);
    expect(r.files.map((f) => f.path).sort()).toEqual(["SKILL.md", "scripts/post.py"]);
  });

  it("throws a clear error when the skill folder has no files at that ref", async () => {
    await expect(
      resolveSkills([{ ...ref, skill: "nope" }], fakeFetch(ROUTES) as any),
    ).rejects.toThrow(/nope.*not found|no files/i);
  });

  it("throws when the ref does not resolve", async () => {
    await expect(
      resolveSkills([{ ...ref, ref: "ghost" }], fakeFetch(ROUTES) as any),
    ).rejects.toThrow(/ghost/);
  });

  it("resolves the tree once per repo@ref even with multiple skills", async () => {
    const routes = {
      ...ROUTES,
      [`https://raw.githubusercontent.com/AIsa-team/agent-skills/${SHA}/other-skill/SKILL.md`]: "x",
    };
    const f = fakeFetch(routes);
    await resolveSkills([ref, { ...ref, skill: "other-skill" }], f as any);
    const treeCalls = (f as any).calls.filter((u: string) => u.includes("/git/trees/"));
    expect(treeCalls).toHaveLength(1);
  });
});
