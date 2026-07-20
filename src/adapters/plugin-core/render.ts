import type { AgentManifest } from "../../schema/manifest.js";

/** 参与 {{VARS}} 渲染的文本文件扩展名;其余按二进制原样拷贝 */
export const TEXT_EXTS = new Set([".md", ".txt", ".py", ".sh", ".yaml", ".yml", ".json"]);

/** plugin 无 per-user 安装变量:已知变量在 build 期定死到 plugin root 下;
 *  manifest.vars 声明的变量渲染为其 default 字面值(内置变量优先,不可被声明覆盖) */
export function pluginVars(m: AgentManifest, pluginRoot: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, v] of Object.entries(m.vars)) vars[name] = v.default;
  vars.SKILLS_DIR = `${pluginRoot}/skills`;
  for (const s of m.setup.python)
    vars[s.env] = `${pluginRoot}/.venvs/${s.name}/bin/python`;
  return vars;
}

/** 未知变量降级为 shell env 引用(${X})并上报,保证产物零 {{}} 残留 */
export function renderPluginText(
  text: string, vars: Record<string, string>,
): { text: string; runtimeEnvVars: string[] } {
  const runtime = new Set<string>();
  const rendered = text.replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g, (_, name: string) => {
    if (name in vars) return vars[name];
    runtime.add(name);
    return `\${${name}}`;
  });
  return { text: rendered, runtimeEnvVars: [...runtime].sort() };
}
