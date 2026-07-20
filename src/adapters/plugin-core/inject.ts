import type { AgentManifest, PythonSetup } from "../../schema/manifest.js";

/** 在 frontmatter 闭合线后插块;SKILL.md 的 frontmatter 必须保留在文件头 */
export function injectAfterFrontmatter(md: string, block: string): string {
  const m = md.match(/^---\n[\s\S]*?\n---\n?/);
  if (!m) return `${block}\n\n${md}`;
  const head = m[0].endsWith("\n") ? m[0] : `${m[0]}\n`;
  return `${head}\n${block}\n\n${md.slice(m[0].length).replace(/^\n/, "")}`;
}

/** venv 类 skill 首调自举:宿主没有安装钩子,把自举变成 skill 说明的一部分 */
export function venvBootstrapBlock(s: PythonSetup, pluginRoot: string): string {
  const py = `${pluginRoot}/.venvs/${s.name}/bin/python`;
  return [
    `> **Runtime bootstrap (${s.name})** — this skill's scripts need a Python venv.`,
    `> Before first use (or if \`${py}\` is missing), run:`,
    `> \`bash "${pluginRoot}/scripts/ensure-venv.sh" ${s.name}\``,
    `> Then invoke scripts with \`${py}\`. First run installs dependencies and can take a few minutes.`,
  ].join("\n");
}

/** env 依赖显式化:缺 key 时给配置指引,不要静默失败 */
export function envCheckBlock(names: string[], m: AgentManifest): string {
  const all = [...m.env.required, ...m.env.optional];
  const lines = names.map((n) => {
    const decl = all.find((v) => v.name === n);
    return `> - \`${n}\` — ${decl?.description ?? "required by this skill"}`;
  });
  return [
    `> **Required environment** — before running scripts, verify these variables are set (\`echo $VAR\`):`,
    ...lines,
    `> If missing, STOP and tell the user to export it in the environment this plugin runs in`,
    `> (e.g. shell profile or the host app's env settings). 不要静默失败 / do not fail silently.`,
  ].join("\n");
}

/** 一个脚本管全部 venv:按 name 查 requirements,幂等自举到 <pluginRoot>/.venvs/<name> */
export function ensureVenvScript(m: AgentManifest, pluginRoot: string): string {
  const cases = m.setup.python
    .map((s) => `  ${s.name}) REQ="${s.requirements}";;`)
    .join("\n");
  return `#!/usr/bin/env bash
# ensure-venv.sh <name> — idempotent venv bootstrap for plugin skills.
# Venvs live inside the plugin dir so uninstalling the plugin removes them too.
set -euo pipefail
NAME="\${1:?usage: ensure-venv.sh <name>}"
ROOT="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
case "$NAME" in
${cases}
  *) echo "unknown venv name: $NAME" >&2; exit 1;;
esac
VENV="$ROOT/.venvs/$NAME"
PY="$VENV/bin/python"
[ -x "$PY" ] && exit 0
python3 -m venv "$VENV"
"$PY" -m pip install --upgrade pip
"$PY" -m pip install -r "$ROOT/$REQ"
echo "venv ready: $PY"
`;
}
