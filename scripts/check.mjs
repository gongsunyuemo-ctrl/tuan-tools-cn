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
const publicPages = new Set(Object.keys(config.pageLastModified).map((path) => path === "/" ? "index.html" : `${path.replace(/^\//, "")}index.html`));
const promotionPages = new Set(["index.html"]);
const uniqueFields = { title: new Map(), description: new Map(), canonical: new Map(), h1: new Map() };

for (const publicPage of publicPages) {
  if (!htmlFiles.some((file) => relative(root, file) === publicPage)) failures.push(`${publicPage}：配置中存在，但页面文件不存在`);
}

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
  const isGoogleVerification = /^google[a-z0-9]+\.html$/.test(name);
  if (isGoogleVerification) {
    const expected = `google-site-verification: ${name}`;
    if (html.trim() !== expected) failures.push(`${name}：Google 站点验证文件内容与文件名不匹配`);
  } else {
    if (!/<html lang="zh-CN">/.test(html)) failures.push(`${name}：缺少 zh-CN`);
    if (!/<meta name="description"/.test(html)) failures.push(`${name}：缺少描述`);
    if (name !== "404.html" && !/<link rel="canonical"/.test(html)) failures.push(`${name}：缺少 canonical`);
  }
  if (/政策草案|默认假设|正式上线前|当前代码包|没有隐藏脚本|jingtu-tools/.test(html)) failures.push(`${name}：包含不应公开的占位或内部文案`);
  if (/upgrade-insecure-requests/.test(html)) failures.push(`${name}：不应在 HTML CSP 中强制升级本地 HTTP 预览`);
  const ids = Array.from(html.matchAll(/\sid="([^"]+)"/g), (match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) failures.push(`${name}：存在重复 ID ${[...new Set(duplicates)].join(", ")}`);
  if (publicPages.has(name)) {
    const values = {
      title: html.match(/<title>([^<]+)<\/title>/)?.[1],
      description: html.match(/<meta name="description" content="([^"]+)"/)?.[1],
      canonical: html.match(/<link rel="canonical" href="([^"]+)"/)?.[1],
      h1: html.match(/<h1>([^<]+)<\/h1>/)?.[1]
    };
    for (const [field, value] of Object.entries(values)) {
      if (!value) failures.push(`${name}：缺少可检查的 ${field}`);
      else if (uniqueFields[field].has(value)) failures.push(`${name}：${field} 与 ${uniqueFields[field].get(value)} 重复`);
      else uniqueFields[field].set(value, name);
    }
    const bannerCount = (html.match(/class="promotion-banner"/g) || []).length;
    const expectedBannerCount = promotionPages.has(name) ? 1 : 0;
    if (bannerCount !== expectedBannerCount) failures.push(`${name}：推广横幅数量应为 ${expectedBannerCount}，实际为 ${bannerCount}`);
    if (promotionPages.has(name) && !/<a class="promotion-banner" href="https:\/\/huyuejsq\.co\/" target="_blank" rel="sponsored noopener noreferrer"/.test(html)) failures.push(`${name}：推广链接地址或安全属性不正确`);
    const friendLinks = [
      ["https://ciyuan-toolbox.pages.dev/", "次元工具箱"],
      ["https://agoodvpn.github.io/vpn-guide/", "VPN指南"],
      ["https://jigen-pocket.proud-2531.chatgpt.site/", "次元口袋"]
    ];
    for (const [href, label] of friendLinks) {
      const present = html.includes(`href="${href}"`) && html.includes(`>${label}</a>`);
      if (name === "friends/index.html" && !present) failures.push(`${name}：缺少友情链接 ${label}`);
      if (name !== "friends/index.html" && present) failures.push(`${name}：友情链接 ${label} 只应出现在友情链接页`);
    }
    if (name === "index.html" && !html.includes('/friends/')) failures.push("index.html：缺少友情链接页面入口");
    if (name === "friends/index.html" && !html.includes('name="robots" content="noindex,follow"')) failures.push("friends/index.html：应使用 noindex,follow");
    if (/"@type":"FAQPage"/.test(html)) failures.push(`${name}：普通工具站不应保留无实际展示价值的 FAQPage 富结果标记`);
    if (!html.includes("G-40JD4CQ5DT")) failures.push(`${name}：缺少当前 Google Analytics 衡量 ID`);
    if (["inspect/index.html", "photo-requirements/index.html", "compress/index.html", "batch-compress/index.html", "batch-exif/index.html", "watermark/index.html", "resize/index.html", "convert/index.html", "remove-exif/index.html"].includes(name) && !html.includes('class="noscript-note"')) failures.push(`${name}：工具页缺少无 JavaScript 可用性提示`);
    if (!html.includes("data-install-app")) failures.push(`${name}：缺少渐进增强的 PWA 安装入口`);
    if (name.startsWith("guides/") && name !== "guides/index.html") {
      if (!/<time datetime="\d{4}-\d{2}-\d{2}">\d{4}-\d{2}-\d{2}<\/time>/.test(html)) failures.push(`${name}：指南页缺少可见更新时间`);
      if (!html.includes("data-share-page")) failures.push(`${name}：指南页缺少分享操作`);
    }
  }
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { structuredItems.push(JSON.parse(match[1])); }
    catch (error) { failures.push(`${name}：JSON-LD 无法解析：${error.message}`); }
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
  "inspect/index.html": "assets/js/inspect.js",
  "photo-requirements/index.html": "assets/js/requirements.js",
  "compress/index.html": "assets/js/compress.js",
  "batch-compress/index.html": "assets/js/batch-compress.js",
  "batch-exif/index.html": "assets/js/batch-exif.js",
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


const pwaManifestPath = resolve(root, "manifest.webmanifest");
const serviceWorkerPath = resolve(root, "service-worker.js");
try {
  const pwa = JSON.parse(await readFile(pwaManifestPath, "utf8"));
  if (pwa.name !== config.siteName || pwa.short_name !== config.shortName) failures.push("manifest.webmanifest：站点名称与配置不一致");
  if (pwa.display !== "standalone") failures.push("manifest.webmanifest：display 应为 standalone");
  if (!pwa.id || pwa.id !== pwa.start_url) failures.push("manifest.webmanifest：缺少稳定 id 或与 start_url 不一致");
  if (!Array.isArray(pwa.shortcuts) || pwa.shortcuts.length < 4) failures.push("manifest.webmanifest：缺少核心工具快捷入口");
  if (!Array.isArray(pwa.icons) || !pwa.icons.some((icon) => icon.sizes === "192x192") || !pwa.icons.some((icon) => icon.sizes === "512x512")) failures.push("manifest.webmanifest：缺少 192/512 图标");
} catch (error) { failures.push("manifest.webmanifest：无法解析或不存在：" + error.message); }
try {
  const worker = await readFile(serviceWorkerPath, "utf8");
  const checked = spawnSync(process.execPath, ["--check", serviceWorkerPath], { encoding: "utf8" });
  if (checked.status !== 0) failures.push("service-worker.js：JavaScript 语法错误\n" + checked.stderr);
  if (!worker.includes("tuan-tools-") || !worker.includes("caches.open")) failures.push("service-worker.js：缺少版本缓存逻辑");
  if (!worker.includes("SKIP_WAITING") || !worker.includes("message")) failures.push("service-worker.js：缺少用户确认更新握手");
  if (/google-analytics|googletagmanager|ciyuan-toolbox|agoodvpn|jigen-pocket|huyuejsq/.test(worker)) failures.push("service-worker.js：不应缓存第三方资源");
  if (/blob:|data:/.test(worker)) failures.push("service-worker.js：不应持久缓存 Blob/Data URL");
  if (!worker.includes("/batch-exif/") || !worker.includes("assets/js/batch-exif.js")) failures.push("service-worker.js：缺少批量元数据清理离线资源");
  if (!worker.includes("/photo-requirements/") || !worker.includes("assets/js/requirements.js")) failures.push("service-worker.js：缺少按上传要求处理工具离线资源");
  for (const offlineAsset of ["/404.html", "/manifest.webmanifest", "/assets/img/apple-touch-icon.png", "/assets/img/hero-workbench.webp"]) if (!worker.includes(offlineAsset)) failures.push(`service-worker.js：缺少离线资源 ${offlineAsset}`);
  const batchCompressHtml = await readFile(resolve(root, "batch-compress/index.html"), "utf8");
  const batchExifHtml = await readFile(resolve(root, "batch-exif/index.html"), "utf8");
  if (!batchCompressHtml.includes('id="batch-progress"') || !batchCompressHtml.includes('id="cancel"')) failures.push("batch-compress/index.html：缺少批量进度或停止控件");
  if (!batchExifHtml.includes('id="batch-progress"') || !batchExifHtml.includes('id="cancel"')) failures.push("batch-exif/index.html：缺少批量进度或停止控件");
  if (!batchCompressHtml.includes('id="retry-failed"')) failures.push("batch-compress/index.html：缺少失败项重试控件");
  if (!batchExifHtml.includes('id="retry-failed"')) failures.push("batch-exif/index.html：缺少失败项重试控件");
  const inspectHtml = await readFile(resolve(root, "inspect/index.html"), "utf8");
  const requirementsHtml = await readFile(resolve(root, "photo-requirements/index.html"), "utf8");
  if (!inspectHtml.includes('id="copy-report"')) failures.push("inspect/index.html：缺少复制检查结果控件");
  const homeHtml = await readFile(resolve(root, "index.html"), "utf8");
  if (homeHtml.includes(">undefined<")) failures.push("index.html：首页工具符号出现 undefined");
  if (/href="[^"]*批量清除会删除所有可能的元数据吗/.test(batchExifHtml)) failures.push("batch-exif/index.html：进一步了解链接配置错误");
  if (!batchExifHtml.includes('<h2>进一步了解</h2>') || !batchExifHtml.includes('/guides/remove-photo-location/')) failures.push("batch-exif/index.html：缺少正确的指南内链");
  if (!inspectHtml.includes('id="inspect-memory"')) failures.push("inspect/index.html：缺少预计解码内存字段");
  for (const id of ["target-width", "target-height", "target-kb", "requirement-status"]) if (!requirementsHtml.includes(`id="${id}"`)) failures.push(`photo-requirements/index.html：缺少按要求处理核心控件 #${id}`);

} catch (error) { failures.push("service-worker.js：无法检查：" + error.message); }

const sitemap = await readFile(resolve(root, "sitemap.xml"), "utf8");
if (/<priority>|<changefreq>/.test(sitemap)) failures.push("sitemap.xml：包含搜索引擎忽略的 priority/changefreq");
if (!/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(sitemap)) failures.push("sitemap.xml：缺少准确 lastmod");
for (const [path, date] of Object.entries(config.pageLastModified)) {
  const expected = `<loc>${new URL(config.siteUrl).href.replace(/\/$/, "")}${path}</loc><lastmod>${date}</lastmod>`;
  if (!sitemap.includes(expected)) failures.push(`sitemap.xml：${path} 的 lastmod 与配置不一致`);
}

const css = await readFile(resolve(root, "assets/css/styles.css"), "utf8");
if ((css.match(/{/g) || []).length !== (css.match(/}/g) || []).length) failures.push("assets/css/styles.css：花括号不配对");

const siteSource = await readFile(resolve(root, "assets/js/site.js"), "utf8");
for (const file of htmlFiles) { const rel = relative(root, file); if (/^(google[^/]*\.html|BingSiteAuth\.xml)$/.test(rel)) continue; const html = await readFile(file, "utf8"); if (!html.includes("data-offline-notice")) failures.push(`${rel}：缺少离线状态提示容器`); }
if (!siteSource.includes("beforeinstallprompt") || !siteSource.includes("appinstalled")) failures.push("assets/js/site.js：缺少 PWA 安装提示逻辑");
if (!siteSource.includes('laterButton.textContent = "稍后"') || !siteSource.includes('role", "region"')) failures.push("assets/js/site.js：PWA 更新提示缺少稍后操作或可访问性语义");
for (const batchScript of ["assets/js/batch-compress.js", "assets/js/batch-exif.js"]) {
  const batchSource = await readFile(resolve(root, batchScript), "utf8");
  if (!batchSource.includes("已跳过：") || !batchSource.includes('classList.add("is-invalid")')) failures.push(`${batchScript}：缺少无效文件跳过逻辑`);
  if (!batchSource.includes('className = "batch-remove-file"') || !batchSource.includes('textContent = "移除"')) failures.push(`${batchScript}：缺少已选文件逐张移除逻辑`);
}
if (!siteSource.includes('[data-offline-notice]') || !siteSource.includes('window.addEventListener("offline"') || !siteSource.includes('window.addEventListener("online"')) failures.push("assets/js/site.js：缺少离线状态提示逻辑");
const integrationSource = (await Promise.all(jsFiles.map((file) => readFile(file, "utf8")))).join("\n");
if (/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/.test(integrationSource)) failures.push("运行时代码出现网络发送 API");
if (/\.innerHTML\s*=|\beval\s*\(/.test(integrationSource)) failures.push("运行时代码出现高风险 DOM 或 eval 写入");


const packageMeta = JSON.parse(await readFile(resolve(sourceRoot, "package.json"), "utf8"));
if (packageMeta.version !== config.currentVersion) failures.push(`package.json 版本 ${packageMeta.version} 与 site.config.json currentVersion ${config.currentVersion} 不一致`);
for (const [articlePath, published] of Object.entries(config.pagePublished || {})) {
  const rel = `${articlePath.replace(/^\//, "")}index.html`;
  try {
    const html = await readFile(resolve(root, rel), "utf8");
    const modified = config.pageLastModified[articlePath];
    if (!html.includes(`\"datePublished\":\"${published}\"`)) failures.push(`${rel}：Article Schema 缺少正确 datePublished`);
    if (!html.includes(`\"dateModified\":\"${modified}\"`)) failures.push(`${rel}：Article Schema 缺少正确 dateModified`);
    if (!html.includes(`article:published_time\" content=\"${published}T00:00:00+08:00`)) failures.push(`${rel}：缺少 article:published_time`);
  } catch (error) { failures.push(`${rel}：无法检查文章发布日期：${error.message}`); }
}
if (sitemap.includes('/friends/')) failures.push('sitemap.xml：友情链接 noindex 页面不应进入 sitemap');

const readme = await readFile(resolve(sourceRoot, "README.md"), "utf8");
const integrations = await readFile(resolve(sourceRoot, "INTEGRATIONS.md"), "utf8");
if (/不加载统计和广告脚本|当前站点不加载统计或广告脚本/.test(readme + "\n" + integrations)) failures.push("维护文档与当前 GA4、静态推广横幅实现不一致");
for (const heading of ["## 技术结构", "## PWA 与离线缓存", "## SEO 与 GEO 设计", "## 隐私与第三方服务", "## 发布前检查清单", "## 维护原则"]) {
  if (!readme.includes(heading)) failures.push(`README.md：缺少关键维护章节 ${heading}`);
}
for (const eventName of ["tool_file_selected", "tool_run", "tool_success", "tool_download", "tool_cancel", "guide_share", "guide_copy_link"]) {
  if (!readme.includes(eventName) || !integrations.includes(eventName)) failures.push(`维护文档缺少 Analytics 事件说明：${eventName}`);
}

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
