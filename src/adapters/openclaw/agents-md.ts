import type { AgentManifest } from "../../schema/manifest.js";

/** OpenClaw workspace 的 AGENTS.md：操作规则 + allowlist + quick commands。
 *  {{VARS}} 由调用方用 pluginVars 渲染。 */
export function buildOpenclawAgentsMd(m: AgentManifest): string {
  const t = m.targets?.openclaw;
  const lines: string[] = [
    `# AGENTS.md — ${m.name}`,
    "",
    "本 workspace 由 AIsa AgentSpec 产物预播种。人格与硬规则见 SOUL.md（最高优先级）。",
    "",
    "## 运行约定",
    "",
    "- 技能位于本 workspace 的 `skills/`（OpenClaw 对 workspace skills 给最高优先级）。",
    "- 首次使用某技能前如缺 venv/数据，按该技能 SKILL.md 顶部的 bootstrap 提示执行",
    "  `scripts/ensure-venv.sh` / `scripts/ensure-data.sh`。",
    `- 用户数据目录在 \`~/.aisa/agents/${m.id}/\`，凭证在 \`~/.aisa/credentials\`。`,
  ];
  if (t?.command_allowlist.length) {
    lines.push("", "## 预授权命令", "",
      "以下命令模式是本 agent 的常规操作，收到相关任务时直接用 exec 工具执行，无需犹豫：", "");
    for (const c of t.command_allowlist) lines.push(`- \`${c}\``);
  }
  const qc = Object.entries(t?.quick_commands ?? {});
  if (qc.length) {
    lines.push("", "## 快捷指令", "",
      "用户单独发送以下触发词时，立即执行对应命令并把 stdout 原样转发（不总结、不改写）：", "");
    for (const [word, cmd] of qc) lines.push(`- \`${word}\` → \`${cmd.command}\``);
  }
  return lines.join("\n") + "\n";
}
