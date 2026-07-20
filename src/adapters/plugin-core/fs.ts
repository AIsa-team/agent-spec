import { mkdir, writeFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";

// 共享写盘/清单帮手：各 plugin-* adapter（非 hermes）产物落盘都走这两条,
// 避免每个 adapter 各写一份 mkdir+writeFile / 递归列目录的样板代码。
export async function writeInto(outDir: string, relPath: string, content: string): Promise<void> {
  const abs = join(outDir, relPath);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content);
}

export async function listFiles(dir: string, base = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...await listFiles(join(dir, e.name), rel));
    else out.push(rel);
  }
  return out.sort();
}
