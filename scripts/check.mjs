import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { loadConfig } from "./config.mjs";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootArgument = process.argv.find((argument) => argument.startsWith("--root="));
const root = rootArgument ? resolve(sourceRoot, rootArgument.slice(7)) : sourceRoot;
const config = await loadConfig(sourceRoot, false);
const basePath = new URL(config.siteUrl).pathname.replace(/\/$/, "");
const htmlFiles = (await walk(root)).filter((file) => file.endsWith(".html") && !(root === sourceRoot && file.includes("/_site/")));
const jsFiles = (await walk(resolve(root, "assets/js"))).filter((file) => file.endsWith(".js"));
const failures = [];
const toolHtmlFiles = new Set(["compress/index.html", "watermark/index.html", "resize/index.html", "convert/index.html", "remove-exif/index.html"]);

if (root === sourceRoot) {
  try {
    const manifest = JSON.parse(await readFile(resolve(sourceRoot, ".generated-manifest.json"), "utf8"));
    const configHash = createHash("sha256").update(await readFile(resolve(sourceRoot, "site.config.json"))).digest("hex");
    if (manifest.configHash !== configHash) failures.push("site.config.json 已改变，但生成页面尚未更新；请先运行 npm run build");
    for (const file of manifest.files || []) {
      const hash = createHash("sha256").update(await readFile(resolve(sourceRoot, file))).digest("hex");
      if (manifest.hashes?.[file] !== hash) failures.push(`${file} 与最近一次生成结果不一致`);
    }
    for (const [file, expected] of Object.entries(manifest.staticHashes || {})) {
      const hash = createHash("sha256").update(await readFile(resolve(sourceRoot, file))).digest("hex");
      if (hash !== expected) failures.push(`${file} 已改变，资源版本号尚未更新；请先运行 npm run build`);
    }
  } catch (error) { failures.push("无法验证生成文件清单：" + error.message); }
}

for (const file of jsFiles) {
  const checked = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (checked.status !== 0) failures.push(`${relative(root, file)}：JavaScript 语法错误\n${checked.stderr}`);
}

for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  const name = relative(root, file);
  const structuredItems = [];
  if (!/<html lang="zh-CN">/.test(html)) failures.push(`${name}：缺少 zh-CN`);
  if (!/<meta name="description"/.test(html)) failures.push(`${name}：缺少描述`);
  if (name !== "404.html" && !/<link rel="canonical"/.test(html)) failures.push(`${name}：缺少 canonical`);
  if (/政策草案|默认假设|正式上线前|当前代码包|没有隐藏脚本|jingtu-tools/.test(html)) failures.push(`${name}：包含不应公开的占位或内部文案`);
  if (/upgrade-insecure-requests/.test(html)) failures.push(`${name}：不应在 HTML CSP 中强制升级本地 HTTP 预览`);
  const ids = Array.from(html.matchAll(/\sid="([^"]+)"/g), (match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) failures.push(`${name}：存在重复 ID ${[...new Set(duplicates)].join(", ")}`);
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { structuredItems.push(JSON.parse(match[1])); }
    catch (error) { failures.push(`${name}：JSON-LD 无法解析：${error.message}`); }
  }
  if (toolHtmlFiles.has(name)) {
    const application = structuredItems.find((item) => item?.["@type"] === "WebApplication");
    const offer = Array.isArray(application?.offers) ? application.offers[0] : application?.offers;
    if (!application || application.isAccessibleForFree !== true || Number(offer?.price) !== 0 || typeof offer?.priceCurrency !== "string" || !offer.priceCurrency) {
      failures.push(`${name}：结构化数据缺少有效的免费价格信息`);
    }
  }
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const link = match[1];
    if (/^(https?:|mailto:|#|blob:)/.test(link)) continue;
    const stripped = basePath && link.startsWith(basePath) ? link.slice(basePath.length) : link;
    const clean = stripped.split(/[?#]/)[0];
    let target;
    if (clean.startsWith("/")) target = resolve(root, clean.slice(1));
    else target = resolve(dirname(file), clean);
    if (clean.endsWith("/")) target = resolve(target, "index.html");
    try { if (!(await stat(target)).isFile()) failures.push(`${name}：链接目标不存在 ${link}`); }
    catch (_) { failures.push(`${name}：链接目标不存在 ${link}`); }
  }
}

const domContracts = {
  "compress/index.html": "assets/js/compress.js",
  "watermark/index.html": "assets/js/watermark.js",
  "resize/index.html": "assets/js/resize.js",
  "convert/index.html": "assets/js/convert.js",
  "remove-exif/index.html": "assets/js/exif.js"
};
for (const [htmlPath, jsPath] of Object.entries(domContracts)) {
  const html = await readFile(resolve(root, htmlPath), "utf8");
  const source = await readFile(resolve(root, jsPath), "utf8");
  const ids = new Set(Array.from(html.matchAll(/\sid="([^"]+)"/g), (match) => match[1]));
  const requiredIds = new Set(Array.from(source.matchAll(/querySelector\(["']#([^"']+)["']\)/g), (match) => match[1]));
  for (const id of requiredIds) if (!ids.has(id)) failures.push(`${htmlPath}：缺少 ${jsPath} 所需的 #${id}`);
}

const sitemap = await readFile(resolve(root, "sitemap.xml"), "utf8");
if (/<priority>|<changefreq>/.test(sitemap)) failures.push("sitemap.xml：包含搜索引擎忽略的 priority/changefreq");
if (!/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(sitemap)) failures.push("sitemap.xml：缺少准确 lastmod");
for (const [path, date] of Object.entries(config.pageLastModified)) {
  const expected = `<loc>${new URL(config.siteUrl).href.replace(/\/$/, "")}${path}</loc><lastmod>${date}</lastmod>`;
  if (!sitemap.includes(expected)) failures.push(`sitemap.xml：${path} 的 lastmod 与配置不一致`);
}

const css = await readFile(resolve(root, "assets/css/styles.css"), "utf8");
if ((css.match(/{/g) || []).length !== (css.match(/}/g) || []).length) failures.push("assets/css/styles.css：花括号不配对");

const integrationSource = (await Promise.all(jsFiles.map((file) => readFile(file, "utf8")))).join("\n");
if (/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/.test(integrationSource)) failures.push("运行时代码出现网络发送 API");
if (/\.innerHTML\s*=|\beval\s*\(/.test(integrationSource)) failures.push("运行时代码出现高风险 DOM 或 eval 写入");

if (failures.length) {
  console.error(failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log(`检查通过：${htmlFiles.length} 个 HTML、${jsFiles.length} 个 JavaScript 文件。`);

async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", "_site"].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else result.push(path);
  }
  return result;
}
