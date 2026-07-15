import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { AgentManifest } from "../../schema/manifest.js";

const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../templates");

// {{TOKEN}} 在 YAML 解析中不稳定 → 解析/生成期间用哨兵字符串代理,最后还原
const TOKEN_RE = /\{\{(\w+)\}\}/g;
const SENTINEL_RE = /__AGENTSPEC_VAR_(\w+)__/g;
const toSentinel = (s: string) => s.replace(TOKEN_RE, "__AGENTSPEC_VAR_$1__");
const fromSentinel = (s: string) => s.replace(SENTINEL_RE, "{{$1}}");

function deepMerge(base: any, override: any): any {
  if (Array.isArray(override) || typeof override !== "object" || override === null) return override;
  const out = { ...(typeof base === "object" && base !== null && !Array.isArray(base) ? base : {}) };
  for (const [k, v] of Object.entries(override)) out[k] = deepMerge(out[k], v);
  return out;
}

export function buildHermesConfig(manifest: AgentManifest, aisaModels?: string[]): string {
  const baseText = readFileSync(join(TEMPLATES_DIR, "hermes", "base-config.yaml"), "utf8");
  const cfg = parseYaml(toSentinel(baseText)) as any;

  cfg.model.default = toSentinel("{{MODEL_DEFAULT}}");
  cfg.model.provider = toSentinel("{{MODEL_PROVIDER}}");
  cfg.display.language = manifest.language;
  // 构建时注入的动态模型列表(2026-07-15 方案1):替代基础模板里的静态清单
  if (aisaModels?.length) cfg.providers.aisa.models = [...aisaModels].sort();

  const overrideRaw = manifest.targets?.hermes?.config ?? {};
  const override = JSON.parse(toSentinel(JSON.stringify(overrideRaw)));
  const merged = deepMerge(cfg, override);

  return fromSentinel(stringifyYaml(merged, { lineWidth: 0 }));
}
