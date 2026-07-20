import type { AgentManifest, PythonSetup, VarDecl } from "../../schema/manifest.js";

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

/** env 依赖显式化:缺 key 时不是报错打发用户,而是把开通/配置流程留在当轮对话里
 *  完成(转化关键:用户动机最强的瞬间被接住)。~/.aisa/credentials 是 plugin 形态
 *  的约定 key 文件,脚本读取顺序 env → credentials,写入即生效、无需重启宿主 */
export function envCheckBlock(names: string[], m: AgentManifest): string {
  const all = [...m.env.required, ...m.env.optional];
  const lines = names.map((n) => {
    const decl = all.find((v) => v.name === n);
    const desc = decl?.description ?? "required by this skill";
    const get = decl?.setupUrl ? ` No key yet? Get one at ${decl.setupUrl} (takes about a minute).` : "";
    return `> - \`${n}\` — ${desc}.${get}`;
  });
  return [
    `> **Required credentials** — scripts resolve these as: env var → \`~/.aisa/credentials\` (KEY=VALUE lines):`,
    ...lines,
    `> If a value is missing, do NOT fail silently and do NOT just tell the user to "export" it.`,
    `> Guide them through setup right here in the conversation:`,
    `> 1. If they don't have the key, give them the sign-up link above and wait.`,
    `> 2. Ask them to paste the key into the chat, then save it for them:`,
    `>    \`mkdir -p ~/.aisa && printf 'NAME=value\\n' >> ~/.aisa/credentials && chmod 600 ~/.aisa/credentials\``,
    `>    (replace NAME=value with the real pair; keep one KEY=VALUE per line).`,
    `> 3. Immediately retry the user's original command — the file takes effect at once, no host restart needed.`,
    `> If the user prefers not to paste secrets into chat, offer the alternative: they export the`,
    `> env var themselves in the host's environment, then restart the host. 不要静默失败 / never fail silently.`,
  ].join("\n");
}

/** 数据自举说明:引用带默认值路径变量的 skill,首调前先播种用户数据目录。
 *  路径已在 build 期渲染为默认字面值;env: true 的变量仍可用同名环境变量覆盖 */
export function dataBootstrapBlock(
  vars: { name: string; decl: VarDecl }[], m: AgentManifest, pluginRoot: string,
): string {
  const lines = vars.map(({ name, decl }) =>
    `> - \`${decl.default}\`${decl.description ? ` — ${decl.description}` : ""}` +
    `(export \`${name}\` to override — if set, use its value instead of this default)`);
  return [
    `> **Data bootstrap** — this skill reads files under the user data directory.`,
    `> If a path below does not exist yet, run \`bash "${pluginRoot}/scripts/ensure-data.sh"\` first`,
    `> (idempotent: seeds missing files from the plugin's bundled assets, never overwrites existing data).`,
    ...lines,
  ].join("\n");
}

/** 播种用户数据目录:assets 整树 copy-if-missing 到 ~/.aisa/agents/<id>。
 *  用户数据(持仓等)绝不覆盖;plugin 更新/卸载不触碰该目录 */
export function ensureDataScript(m: AgentManifest): string {
  return `#!/usr/bin/env bash
# ensure-data.sh — idempotent user-data seeding for the ${m.id} plugin.
# Copies bundled assets into the data dir ONLY where files are missing;
# user data lives outside the plugin dir so updates never touch it.
set -euo pipefail
ROOT="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
DST="\${AISA_DATA_DIR:-$HOME/.aisa/agents/${m.id}}"
mkdir -p "$DST"
(cd "$ROOT/assets" && find . -type f) | while read -r f; do
  mkdir -p "$DST/$(dirname "$f")"
  [ -e "$DST/$f" ] || cp "$ROOT/assets/$f" "$DST/$f"
done
echo "data ready: $DST"
`;
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
