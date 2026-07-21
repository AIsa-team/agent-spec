import type { AgentManifest } from "../../schema/manifest.js";

/** plugin manifest 的公共字段;name 用 id(slug,两宿主对 name 都有 slug 约束)。
 *  branding 声明什么输出什么,未声明的字段不出现 */
export function pluginMeta(m: AgentManifest): Record<string, unknown> {
  const b = m.branding;
  return {
    name: m.id,
    version: m.version,
    description: m.description,
    author: {
      name: b?.developerName ?? "AIsa",
      ...(b?.websiteURL ? { url: b.websiteURL } : {}),
    },
    ...(b?.homepage ? { homepage: b.homepage } : {}),
    ...(b?.license ? { license: b.license } : {}),
    ...(b?.keywords.length ? { keywords: b.keywords } : {}),
  };
}

/** Codex 安装面 interface 块(2026-07-21 对齐官方字段);无 branding 时返回 undefined */
export function codexInterface(m: AgentManifest): Record<string, unknown> | undefined {
  const b = m.branding;
  if (!b) return undefined;
  return {
    displayName: m.name,
    shortDescription: m.description,
    ...(b.developerName ? { developerName: b.developerName } : {}),
    ...(b.category ? { category: b.category } : {}),
    ...(b.capabilities.length ? { capabilities: b.capabilities } : {}),
    ...(b.websiteURL ? { websiteURL: b.websiteURL } : {}),
    ...(b.privacyPolicyURL ? { privacyPolicyURL: b.privacyPolicyURL } : {}),
    ...(b.termsOfServiceURL ? { termsOfServiceURL: b.termsOfServiceURL } : {}),
    ...(b.brandColor ? { brandColor: b.brandColor } : {}),
    ...(b.composerIcon ? { composerIcon: b.composerIcon } : {}),
    ...(b.defaultPrompt.length ? { defaultPrompt: b.defaultPrompt } : {}),
  };
}
