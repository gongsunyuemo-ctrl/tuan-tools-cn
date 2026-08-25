import { copyFile, mkdir, rm, lstat, readFile } from "node:fs/promises";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(root, "_site");
const manifest = JSON.parse(await readFile(resolve(root, ".publish-manifest.json"), "utf8"));
if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error("发布清单为空，请先运行生成器。");

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const entry of manifest.files) {
  if (typeof entry !== "string" || entry.startsWith("/") || entry.split(/[\\/]/).includes("..")) throw new Error(`发布清单路径无效：${entry}`);
  const source = resolve(root, entry);
  if (relative(root, source).startsWith(".." + sep)) throw new Error(`发布清单越界：${entry}`);
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`发布项必须是普通文件：${entry}`);
  const target = resolve(destination, entry);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}
console.log(`已按逐文件白名单生成 _site，共 ${manifest.files.length} 个公开文件。`);
