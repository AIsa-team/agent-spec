import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { AgentManifest } from "../../schema/manifest.js";
import { TEXT_EXTS } from "../plugin-core/render.js";

export const PORTABLE_ROOT_SENTINEL = "__AISA_PORTABLE_PLUGIN_ROOT__";

function portableVenvRoot(m: AgentManifest): string {
  return `~/.aisa/agents/${m.id}/.venvs`;
}

export function portableSkillText(text: string, skillName: string, m: AgentManifest): string {
  let next = text;
  next = next.replaceAll(
    `bash "${PORTABLE_ROOT_SENTINEL}/scripts/ensure-venv.sh" `,
    `bash "scripts/aisa-bootstrap.sh" venv `,
  );
  next = next.replaceAll(
    `bash "${PORTABLE_ROOT_SENTINEL}/scripts/ensure-data.sh"`,
    `bash "scripts/aisa-bootstrap.sh" data`,
  );
  next = next.replaceAll(
    `${PORTABLE_ROOT_SENTINEL}/skills/${skillName}/`,
    "",
  );
  next = next.replaceAll(`${PORTABLE_ROOT_SENTINEL}/skills/`, "../");
  next = next.replaceAll(`${PORTABLE_ROOT_SENTINEL}/skills`, "..");
  for (const setup of m.setup.python) {
    next = next.replaceAll(
      `${PORTABLE_ROOT_SENTINEL}/.venvs/${setup.name}/bin/python`,
      `${portableVenvRoot(m)}/${setup.name}/bin/python`,
    );
  }
  return next;
}

/** Agent Skills metadata is a string-to-string map. Host-specific skills often
 * carry a useful nested metadata object, so preserve it as stable JSON rather
 * than dropping it or weakening portable validation. */
export function normalizePortableSkillFrontmatter(text: string): string {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return text; // the validator will produce the canonical error
  const frontmatter = parseYaml(match[1]) as Record<string, unknown> | null;
  if (!frontmatter || typeof frontmatter !== "object") return text;
  if (frontmatter.metadata && typeof frontmatter.metadata === "object" &&
      !Array.isArray(frontmatter.metadata)) {
    frontmatter.metadata = Object.fromEntries(
      Object.entries(frontmatter.metadata as Record<string, unknown>)
        .map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]),
    );
  }
  if (Array.isArray(frontmatter["allowed-tools"]))
    frontmatter["allowed-tools"] = frontmatter["allowed-tools"].join(" ");
  return `---\n${stringifyYaml(frontmatter).trimEnd()}\n---\n${text.slice(match[0].length)}`;
}

function bootstrapScript(): string {
  return `#!/usr/bin/env bash
# Portable Agent Plugin bootstrap. This file lives at skills/<name>/scripts/.
set -euo pipefail
ROOT="$(cd "$(dirname "\${BASH_SOURCE[0]}")/../../.." && pwd)"
ACTION="\${1:?usage: aisa-bootstrap.sh data|venv [name]}"
shift
case "$ACTION" in
  data) exec bash "$ROOT/scripts/ensure-data.sh" "$@";;
  venv) exec bash "$ROOT/scripts/ensure-venv.sh" "$@";;
  *) echo "unknown bootstrap action: $ACTION" >&2; exit 1;;
esac
`;
}

async function rewriteTree(root: string, dir: string, skillName: string, m: AgentManifest): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await rewriteTree(root, path, skillName, m);
    else if (TEXT_EXTS.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      const original = await readFile(path, "utf8");
      let rewritten = portableSkillText(original, skillName, m);
      if (entry.name === "SKILL.md") rewritten = normalizePortableSkillFrontmatter(rewritten);
      if (rewritten.includes(PORTABLE_ROOT_SENTINEL))
        throw new Error(`portable path conversion left a root sentinel in ${path.slice(root.length + 1)}`);
      await writeFile(path, rewritten);
    }
  }
}

export async function makePluginTreePortable(outDir: string, m: AgentManifest): Promise<void> {
  const skillsRoot = join(outDir, "skills");
  for (const entry of await readdir(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillRoot = join(skillsRoot, entry.name);
    await rewriteTree(outDir, skillRoot, entry.name, m);
    const scripts = join(skillRoot, "scripts");
    await mkdir(scripts, { recursive: true });
    const wrapper = join(scripts, "aisa-bootstrap.sh");
    await writeFile(wrapper, bootstrapScript());
    await chmod(wrapper, 0o755);
  }

  const ensureVenv = join(outDir, "scripts", "ensure-venv.sh");
  try {
    const text = await readFile(ensureVenv, "utf8");
    await writeFile(ensureVenv, text.replace(
      'VENV="$ROOT/.venvs/$NAME"',
      `VENV="\${AISA_DATA_DIR:-$HOME/.aisa/agents/${m.id}}/.venvs/$NAME"`,
    ));
  } catch { /* no setup.python */ }
}
