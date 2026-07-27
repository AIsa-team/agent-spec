import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, Document, visit, isScalar } from "yaml";
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

  // 哨兵只保护解析期。序列化时 `__AGENTSPEC_VAR_X__ …` 是普通标量,不会加引号;
  // fromSentinel 在序列化之后才把 `{{` 放回去,于是一个以变量开头的值(如
  // `{{SEC_VENV_PYTHON}} /path/script.py *`)会被 YAML 当成 flow mapping,
  // 整份 config.yaml 解析失败 —— 而 hermes 遇到坏 config 是静默回退默认值,
  // 模型、command_allowlist、quick_commands 全部失效且不报错。
  // 值中间的 `{{` 无害,只有开头才致命,所以只给这类标量强制加双引号。
  const doc = new Document(merged);
  visit(doc, {
    Scalar(_key, node) {
      if (isScalar(node) && typeof node.value === "string"
          && node.value.startsWith("__AGENTSPEC_VAR_")) {
        node.type = "QUOTE_DOUBLE";
      }
    },
  });

  return fromSentinel(doc.toString({ lineWidth: 0 }));
}
