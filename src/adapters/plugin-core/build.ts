import { mkdir, writeFile, readFile, readdir, chmod, cp } from "node:fs/promises";
import { join, dirname, relative, extname } from "node:path";
import type { BuildInput } from "../adapter.js";
import { pluginVars, renderPluginText, TEXT_EXTS } from "./render.js";
import {
  injectAfterFrontmatter, venvBootstrapBlock, envCheckBlock, ensureVenvScript,
  dataBootstrapBlock, ensureDataScript,
} from "./inject.js";

// 排除本地编译/系统垃圾,产物必须可复现 —— 与 hermes adapter 同一条规则
const junkRe = /(^|\/)(__pycache__(\/|$)|\.DS_Store$)|\.pyc$/;

interface SkillFile { path: string; content: Buffer }

async function readTree(dir: string, base = ""): Promise<SkillFile[]> {
  const out: SkillFile[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (junkRe.test(rel)) continue;
    if (e.isDirectory()) out.push(...await readTree(join(dir, e.name), rel));
    else out.push({ path: rel, content: await readFile(join(dir, e.name)) });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * 两个 plugin adapter（hermes 之外的宿主目标）共用的树构建器：写出
 * skills/（渲染+注入后）、scripts/ensure-venv.sh、requirements/。
 */
export async function buildPluginTree(
  { project, resolvedSkills }: BuildInput, outDir: string, pluginRoot: string,
): Promise<{ runtimeEnvVars: string[] }> {
  const m = project.manifest;
  const vars = pluginVars(m, pluginRoot);
  const declaredEnv = [...m.env.required, ...m.env.optional].map((v) => v.name);
  const venvEnvByName = new Map(m.setup.python.map((s) => [s.env, s]));
  const allRuntime = new Set<string>();

  // inline 保留相对层级,remote 用 resolved name —— 与 hermes 产物同构
  const skillSets: { name: string; files: SkillFile[] }[] = [];
  for (const dir of project.inlineSkillDirs)
    skillSets.push({
      name: relative(join(project.root, "skills"), dir),
      files: await readTree(dir),
    });
  for (const s of resolvedSkills)
    skillSets.push({
      name: s.name,
      files: s.files.map((f) => ({ path: f.path, content: Buffer.from(f.content) })),
    });

  for (const skill of skillSets) {
    // 注入判定要在渲染前做:{{DSA_VENV_PYTHON}} 渲染后就认不出是 venv 引用了
    const rawText = skill.files
      .filter((f) => TEXT_EXTS.has(extname(f.path)))
      .map((f) => f.content.toString("utf8")).join("\n");
    const venvSetups = [...venvEnvByName.entries()]
      .filter(([env]) => rawText.includes(`{{${env}}}`)).map(([, s]) => s);
    const envNames = new Set<string>(
      declaredEnv.filter((n) => new RegExp(`\\b${n}\\b`).test(rawText)));
    // env: true 的声明变量(路径类)已渲染成默认值 —— 引用它的 skill 注入数据自举说明
    const dataVars = Object.entries(m.vars)
      .filter(([name, v]) => v.env && rawText.includes(`{{${name}}}`))
      .map(([name, decl]) => ({ name, decl }));

    // Pass 1: 渲染全部文件到内存,先把整个 skill 的 runtimeEnvVars 收集齐 ——
    // SKILL.md 可能按字典序排在其他模板文件(如 utils.py)之前,若边渲染边写
    // SKILL.md 就会漏掉后处理文件才暴露出的 env,导致写盘内容与返回值不一致。
    const rendered: { path: string; content: Buffer; text?: string }[] = [];
    for (const f of skill.files) {
      if (!TEXT_EXTS.has(extname(f.path))) { rendered.push({ path: f.path, content: f.content }); continue; }
      const r = renderPluginText(f.content.toString("utf8"), vars);
      r.runtimeEnvVars.forEach((n) => { allRuntime.add(n); envNames.add(n); });
      rendered.push({ path: f.path, content: f.content, text: r.text });
    }

    // Pass 2: envNames 已经是整个 skill 的最终集合,再注入并写盘。
    for (const f of rendered) {
      const dst = join(outDir, "skills", skill.name, f.path);
      await mkdir(dirname(dst), { recursive: true });
      if (f.text === undefined) { await writeFile(dst, f.content); continue; }
      let text = f.text;
      if (f.path === "SKILL.md") {
        // 注入顺序约定:venv bootstrap 最终在最上,data bootstrap 次之,env 检查最后
        // (先能跑,再有数据,最后查 key)。后插的块会顶到先插的上面。
        if (envNames.size) text = injectAfterFrontmatter(text, envCheckBlock([...envNames].sort(), m));
        if (dataVars.length) text = injectAfterFrontmatter(text, dataBootstrapBlock(dataVars, m, pluginRoot));
        for (const s of [...venvSetups].reverse())
          text = injectAfterFrontmatter(text, venvBootstrapBlock(s, pluginRoot));
      }
      await writeFile(dst, text);
    }
  }

  if (m.setup.python.length) {
    const sh = join(outDir, "scripts", "ensure-venv.sh");
    await mkdir(dirname(sh), { recursive: true });
    await writeFile(sh, ensureVenvScript(m, pluginRoot));
    await chmod(sh, 0o755);
    for (const s of m.setup.python) {
      const dst = join(outDir, s.requirements);
      await mkdir(dirname(dst), { recursive: true });
      await writeFile(dst, await readFile(join(project.root, s.requirements)));
    }
  }

  // assets 随包分发 + ensure-data.sh:数据目录在 plugin 之外,首调播种、更新不触碰
  if (project.assetEntries.length) {
    for (const entry of project.assetEntries)
      await cp(join(project.root, "assets", entry), join(outDir, "assets", entry),
        { recursive: true, filter: (src) => !junkRe.test(src) });
    const sh = join(outDir, "scripts", "ensure-data.sh");
    await mkdir(dirname(sh), { recursive: true });
    await writeFile(sh, ensureDataScript(m));
    await chmod(sh, 0o755);
  }
  return { runtimeEnvVars: [...allRuntime].sort() };
}
