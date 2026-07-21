import type { AgentManifest } from "../../schema/manifest.js";
import type { CronJob } from "../../schema/cron.js";

export const OPENCLAW_CRON_NOTE =
  "\n\n(OpenClaw 运行环境提示：如需执行脚本，用 exec 工具运行并捕获 stdout；" +
  "本 cron 以 --announce 把最终文本投递到最近会话所在的通道。)";

// 简单 token（字母数字/常见路径符号）原样出现，其余单引号转义 —— 保持简单值可读、
// 复杂值（含空格/通配符/中文）安全
const simpleToken = /^[A-Za-z0-9_.:/-]+$/;
const shq = (s: string) => (simpleToken.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

/** 幂等的 cron 注册脚本：先删同名旧 job（忽略失败）再 add，可重复执行 */
export function buildOpenclawCronSetup(m: AgentManifest, jobs: CronJob[]): string {
  const cmds = jobs.map((j) => {
    const flags = [
      `--name ${shq(j.id)}`,
      `--agent ${shq(m.id)}`,
      `--cron ${shq(j.schedule)}`,
      `--message ${shq(j.prompt + OPENCLAW_CRON_NOTE)}`,
      "--announce",
      ...(j.model && j.model !== "default" ? [`--model ${shq(j.model)}`] : []),
      ...(j.enabled ? [] : ["--disabled"]),
    ].join(" ");
    return `openclaw cron rm ${shq(j.id)} >/dev/null 2>&1 || true\nopenclaw cron add ${flags}`;
  });
  return `#!/usr/bin/env bash
# cron-setup.sh — 注册 ${m.name} 的 cron 任务（需要 OpenClaw Gateway 在运行）。
# 由 agent-spec openclaw adapter 生成；幂等，可重复执行。
set -euo pipefail
command -v openclaw >/dev/null || { echo "openclaw not found" >&2; exit 1; }
openclaw health >/dev/null || { echo "OpenClaw gateway unreachable — start it, then re-run" >&2; exit 1; }
${cmds.join("\n")}
echo "cron jobs registered for ${m.id}"
`;
}
