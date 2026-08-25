import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const production = process.argv.includes("--production");
const config = await loadConfig(root, production);

const parsedSiteUrl = new URL(config.siteUrl);
const siteUrl = parsedSiteUrl.href.replace(/\/$/, "");
const basePath = parsedSiteUrl.pathname === "/" ? "" : parsedSiteUrl.pathname.replace(/\/$/, "");
const asset = (path) => `${basePath}${path}`;
const absolute = (path) => `${siteUrl}${path === "/" ? "/" : path}`;
const noindex = !config.productionReady;
const generatedFiles = [];
const staticFiles = [".nojekyll", "assets/css/styles.css", "assets/img/apple-touch-icon.png", "assets/img/favicon.png", "assets/img/hero-workbench.webp", "assets/js/image-core.js", "assets/js/site.js", "assets/js/compress.js", "assets/js/watermark.js", "assets/js/resize.js", "assets/js/convert.js", "assets/js/exif.js"];
await writeFile(resolve(root, ".nojekyll"), "");
const assetVersion = createHash("sha256").update((await Promise.all(staticFiles.map((file) => readFile(resolve(root, file))))).map((item) => createHash("sha256").update(item).digest("hex")).join(":"), "utf8").digest("hex").slice(0, 12);
const staticAsset = (path) => `${asset(path)}?v=${assetVersion}`;

try {
  const previous = JSON.parse(await readFile(resolve(root, ".generated-manifest.json"), "utf8"));
  const safeGeneratedPath = /^(?:404\.html|index\.html|robots\.txt|sitemap\.xml|CNAME|(?:compress|watermark|resize|convert|remove-exif|methodology|about|privacy|terms)\/index\.html)$/;
  for (const file of previous.files || []) {
    if (typeof file !== "string" || !safeGeneratedPath.test(file)) throw new Error(`旧生成清单包含非法路径：${file}`);
    await rm(resolve(root, file), { force: true });
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const tools = [
  { slug: "compress", name: "图片压缩到指定 KB", short: "压缩图片", description: "按目标文件大小压缩 JPG、PNG 或 WebP，必要时逐级缩小像素尺寸。", script: "compress.js", category: "MultimediaApplication" },
  { slug: "watermark", name: "证件与资料图片加水印", short: "添加水印", description: "添加用途文字，支持自动换行、重复铺满、角度与透明度设置。", script: "watermark.js", category: "SecurityApplication" },
  { slug: "resize", name: "图片尺寸修改与定位裁剪", short: "修改尺寸", description: "设置宽高像素，调整裁剪焦点，或使用完整适应和拉伸模式。", script: "resize.js", category: "MultimediaApplication" },
  { slug: "convert", name: "JPG、PNG、WebP 格式转换", short: "转换格式", description: "在常用静态图片格式之间转换，并正确处理透明区域。", script: "convert.js", category: "MultimediaApplication" },
  { slug: "remove-exif", name: "EXIF 查看与清除", short: "清除 EXIF", description: "检查常见拍摄信息，隐藏精确 GPS，并重新编码生成新副本。", script: "exif.js", category: "SecurityApplication" }
];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function jsonLdHash(json) {
  return createHash("sha256").update(json).digest("base64");
}

function structuredData(page) {
  const items = [];
  const modified = config.pageLastModified[page.path] || config.lastModified;
  if (page.kind === "home") {
    items.push({ "@context": "https://schema.org", "@type": "WebSite", name: config.siteName, alternateName: config.shortName, url: absolute("/"), description: page.description, inLanguage: "zh-CN", dateModified: modified, publisher: { "@type": "Organization", name: config.operatorName, url: absolute("/") } });
  }
  if (page.kind === "tool") {
    items.push({ "@context": "https://schema.org", "@type": "WebApplication", name: page.tool.name, url: absolute(`/${page.tool.slug}/`), description: page.description, applicationCategory: page.tool.category, operatingSystem: "支持现代浏览器的桌面与移动设备", browserRequirements: "需要 JavaScript、Canvas、Blob 和本地文件读取能力", isAccessibleForFree: true, offers: { "@type": "Offer", price: 0, priceCurrency: "CNY" }, author: { "@type": "Organization", name: config.operatorName, url: absolute("/") }, dateModified: modified });
    items.push({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "全部工具", item: absolute("/") },
      { "@type": "ListItem", position: 2, name: page.tool.name, item: absolute(`/${page.tool.slug}/`) }
    ] });
  }
  return items.map((item) => JSON.stringify(item).replace(/[<>&\u2028\u2029]/g, (character) => ({ "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" })[character]));
}

function head(page) {
  const canonical = absolute(page.path);
  const shouldNoindex = noindex || page.noindex;
  const json = structuredData(page);
  const hashes = json.map((item) => `'sha256-${jsonLdHash(item)}'`).join(" ");
  const csp = `default-src 'self'; img-src 'self' blob: data:; script-src 'self' ${hashes}; style-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f3f6f4">
  <meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
  <meta name="referrer" content="no-referrer">
  ${shouldNoindex ? '<meta name="robots" content="noindex,nofollow">' : '<meta name="robots" content="index,follow,max-image-preview:large">'}
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.description)}">
  <meta name="author" content="${escapeHtml(config.operatorName)}">
  ${page.noindex ? "" : `<link rel="canonical" href="${canonical}">`}
  <link rel="icon" href="${staticAsset("/assets/img/favicon.png")}" sizes="32x32">
  <link rel="apple-touch-icon" href="${staticAsset("/assets/img/apple-touch-icon.png")}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:site_name" content="${escapeHtml(config.siteName)}">
  <meta property="og:title" content="${escapeHtml(page.ogTitle || page.title)}">
  <meta property="og:description" content="${escapeHtml(page.description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${absolute("/assets/img/hero-workbench.webp")}?v=${assetVersion}">
  <meta property="og:image:width" content="1672">
  <meta property="og:image:height" content="941">
  <meta property="og:image:alt" content="桌面上的手机、照片、色卡和裁切尺">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(page.ogTitle || page.title)}">
  <meta name="twitter:description" content="${escapeHtml(page.description)}">
  <meta name="twitter:image" content="${absolute("/assets/img/hero-workbench.webp")}?v=${assetVersion}">
  <meta name="twitter:image:alt" content="桌面上的手机、照片、色卡和裁切尺">
  <link rel="stylesheet" href="${staticAsset("/assets/css/styles.css")}">
  ${json.map((item) => `<script type="application/ld+json">${item}</script>`).join("\n  ")}
</head>`;
}

function header(current) {
  const link = (href, label, key) => `<a${current === key ? ' aria-current="page"' : ""} href="${asset(href)}">${label}</a>`;
  return `<a class="skip-link" href="#main">跳到主要内容</a>
<header class="site-header">
  <nav class="nav-shell" aria-label="主导航">
    <a class="brand" href="${asset("/")}"><span class="brand-mark" aria-hidden="true">图</span>${escapeHtml(config.siteName)}</a>
    <button class="menu-button" type="button" aria-label="打开导航" aria-expanded="false" aria-controls="site-navigation"><span class="menu-lines" aria-hidden="true"></span></button>
    <div class="nav-links" id="site-navigation">${link("/", "全部工具", "home")}${link("/methodology/", "测试方法", "methodology")}${link("/about/", "关于", "about")}</div>
  </nav>
</header>`;
}

function footer() {
  return `<footer class="site-footer">
  <div class="footer-inner">
    <span>© <span data-year></span> ${escapeHtml(config.siteName)}</span>
    <div class="footer-links"><a href="${asset("/methodology/")}">测试方法</a><a href="${asset("/about/")}">关于本站</a><a href="${asset("/privacy/")}">隐私政策</a><a href="${asset("/terms/")}">使用条款</a></div>
  </div>
</footer>
<script src="${staticAsset("/assets/js/site.js")}" defer></script>`;
}

function pageShell(page, current, body, scripts = []) {
  return `${head(page)}
<body>
${header(current)}
<main id="main" tabindex="-1">
${body}
</main>
${footer()}
${scripts.map((script) => `<script src="${staticAsset(`/assets/js/${script}`)}" defer></script>`).join("\n")}
</body>
</html>
`;
}

function pageHead(tool, eyebrow, intro) {
  return `<section class="page-head"><div class="page-head-inner">
  <nav class="breadcrumbs" aria-label="面包屑"><a href="${asset("/")}">全部工具</a> / <span aria-current="page">${escapeHtml(tool.short)}</span></nav>
  <p class="eyebrow">${eyebrow}</p><h1>${escapeHtml(tool.name)}</h1><p>${intro}</p>
</div></section>`;
}

function dropzone(label, hint) {
  return `<div class="dropzone" id="dropzone">
  <div><strong>${label}</strong><p>${hint}</p><button class="button secondary" type="button" data-file-trigger>选择图片</button><input id="file-input" type="file" tabindex="-1" accept="image/jpeg,image/png,image/webp" aria-label="选择图片文件"></div>
</div><p class="file-summary" id="file-summary" aria-live="polite"></p>`;
}

function preview(kind, emptyText) {
  return `<div class="preview-shell"><span class="preview-empty" id="preview-empty">${emptyText}</span>${kind === "canvas" ? '<canvas id="canvas" hidden>当前浏览器不支持画布预览。</canvas>' : '<img id="preview" alt="原图预览" hidden>'}</div>`;
}

function actions(runLabel) {
  return `<div class="button-row"><button class="button" id="run" type="button" disabled>${runLabel}</button><button class="button ghost" id="reset" type="button" hidden>重新开始</button></div>`;
}

function resultBlock(title, rows) {
  return `<section class="result-block" id="result" aria-labelledby="result-title" hidden>
  <h2 id="result-title">${title}</h2>
  <div class="preview-shell"><img id="result-preview" data-blob-preview alt="处理结果预览"></div>
  ${rows.map(([label, id, labelId]) => `<div class="result-row"><span class="result-label"${labelId ? ` id="${labelId}"` : ""}>${label}</span><strong class="result-value" id="${id}"></strong></div>`).join("\n  ")}
  <div class="result-actions"><button class="button" id="download" type="button">下载结果</button><button class="button secondary" id="open-result" type="button">打开结果</button></div>
</section>`;
}

function related(slugs) {
  return `<section class="section compact related"><h2>相关工具</h2><div class="related-links">${slugs.map((slug) => { const tool = tools.find((item) => item.slug === slug); return `<a href="${asset(`/${slug}/`)}">${tool.name}</a>`; }).join("")}</div></section>`;
}

function toolLayout(tool, eyebrow, intro, panel, article, aside) {
  return `${pageHead(tool, eyebrow, intro)}
<div class="workspace"><div class="tool-panel">
  <noscript><p class="notice">图片处理需要启用 JavaScript；下方使用说明仍可正常阅读。</p></noscript>
  ${panel}
  ${article}
</div><aside class="side-context" aria-label="使用提示">${aside}</aside></div>`;
}

const home = {
  kind: "home", path: "/", title: `${config.siteName}｜图片压缩、水印、尺寸、格式与 EXIF 工具`, ogTitle: `${config.siteName}：浏览器本地图片处理`,
  description: "五个中文图片工具：压缩到指定KB、资料水印、尺寸裁剪、JPG/PNG/WebP转换和EXIF清除。图片处理在当前浏览器完成。"
};
const homeBody = `<section class="tool-directory" id="tools"><div class="tool-directory-inner">
  <div class="home-intro">
    <p class="eyebrow">在线图片工具</p>
    <h1>${escapeHtml(config.siteName)}</h1>
    <p class="home-summary">压缩图片、添加水印、修改尺寸、转换格式和清除照片信息。</p>
    <div class="home-facts" aria-label="服务特点"><span>浏览器本地处理</span><span>无需注册</span><span>免费使用</span></div>
    <div class="home-actions"><a class="button" href="${asset("/compress/")}">开始压缩图片</a><a class="home-text-link" href="#tool-list">查看全部工具</a></div>
  </div>
  <div class="directory-heading"><div><p class="eyebrow">全部工具</p><h2>选择图片处理任务</h2></div><p>支持静态 JPG、PNG 和 WebP，文件由当前浏览器处理。</p></div>
  <div class="tool-grid" id="tool-list">
${tools.map((tool, index) => `<a class="tool-card reveal" href="${asset(`/${tool.slug}/`)}"><span class="tool-symbol" aria-hidden="true">${["KB", "水印", "PX", "格式", "EXIF"][index]}</span><span class="tool-card-copy"><strong>${tool.name}</strong><span>${tool.description}</span></span><span class="tool-arrow" aria-hidden="true">→</span></a>`).join("\n")}
  </div>
</div></section>
<section class="workflow-band"><div class="workflow-band-inner"><img src="${staticAsset("/assets/img/hero-workbench.webp")}" width="1672" height="941" loading="lazy" alt="桌面上的手机、照片、色卡和裁切尺"><div><p class="eyebrow">处理边界</p><h2>图片不经过本站上传接口</h2><p>所选文件在当前浏览器中读取、处理和导出。工具会检查文件类型、像素尺寸和常见异常，并在生成后显示结果信息。</p><a href="${asset("/methodology/")}">查看测试方法 <span aria-hidden="true">→</span></a></div></div></section>
<section class="section compact"><div class="evidence-strip"><div class="evidence-item"><strong>格式先检查</strong><p>识别真实文件类型，拒绝伪装文件和动画图片。</p></div><div class="evidence-item"><strong>结果可核对</strong><p>生成后显示格式、尺寸或体积，再由用户下载。</p></div><div class="evidence-item"><strong>限制写清楚</strong><p>不把重新编码说成无损，不承诺水印绝对有效。</p></div></div></section>`;
await writePage("index.html", pageShell(home, "home", homeBody));

for (const tool of tools) {
  const page = { kind: "tool", tool, path: `/${tool.slug}/`, title: `${tool.name}｜浏览器本地处理 - ${config.siteName}`, ogTitle: tool.name, description: tool.description + " 文件不会被本站代码主动上传。" };
  let body = "";
  if (tool.slug === "compress") body = toolLayout(tool, "文件大小", "输入目标 KB，工具先调整编码质量；仍过大时，可选择逐级缩小像素尺寸。", `${dropzone("选择或拖入一张图片", "支持静态 JPG、PNG、WebP；最大 30 MB、2400 万像素")}${preview("img", "原图预览会显示在这里")}
<div class="controls"><div class="control-grid"><div class="control-group"><label for="target-kb">目标大小（KB）</label><input id="target-kb" type="number" value="100" min="5" max="10240" step="1" inputmode="numeric"><span class="hint">例如 50、100、200 或 500 KB</span></div><div class="control-group"><label for="output-format">输出格式</label><select id="output-format"><option value="image/jpeg">JPG</option><option value="image/webp">WebP</option></select></div><div class="control-group full"><div class="inline-check"><input id="allow-resize" type="checkbox" checked><label for="allow-resize">画质调整仍不够时，允许缩小像素尺寸</label></div></div></div>${actions("开始压缩")}</div>
<div class="status-line" id="status" role="status" aria-live="polite" hidden></div>${resultBlock("压缩结果", [["原文件大小", "original-size"], ["输出大小", "output-size"], ["输出尺寸", "output-dimensions"], ["体积减少", "saving", "saving-label"]])}`, `<article class="article"><h2>怎样压缩到指定 KB</h2><ol><li>输入报名系统或平台要求的大小上限。</li><li>先查看输出尺寸，再放大检查文字边缘和人脸细节。</li><li>如果结果仍过大，可提高目标值或允许缩小尺寸。</li></ol><h2>透明背景如何处理</h2><p>输出 JPG 时透明区域会填充为白色；输出 WebP 时保留浏览器能够编码的透明区域。动画 PNG 和动画 WebP 不会被静默压成单帧，而是直接提示不支持。</p><h2>为什么可能达不到目标</h2><p>图片纹理、噪点和文字边缘都会影响编码体积。工具设置了尺寸和画质下限，避免为了几 KB 生成无法辨认的图片，因此不会承诺每张图都能达到任意目标。</p></article>${related(["resize", "convert", "remove-exif", "watermark"])}`, `<section><h2>本地处理</h2><p>本站代码不主动上传图片。处理期间浏览器会在内存中保存解码结果。</p></section><section><h2>建议顺序</h2><ul><li>先改像素尺寸</li><li>再选择所需格式</li><li>最后压缩到体积上限</li></ul></section>`);
  if (tool.slug === "watermark") body = toolLayout(tool, "资料分享", "添加接收方、用途和日期。水印可以增加直接挪用的成本，但不能替代打码或访问控制。", `${dropzone("选择或拖入一张资料图片", "请先确认接收方确有必要获取这份资料")}${preview("canvas", "水印预览会显示在这里")}
<div class="controls"><div class="control-grid"><div class="control-group full"><label for="watermark-text">水印文字</label><input id="watermark-text" value="仅供资料审核使用" maxlength="80" autocomplete="off"><span class="hint">文字过长时自动缩小并换行，最多三行</span></div><div class="control-group"><label for="font-size">字号 <span id="font-size-value">48</span></label><input id="font-size" type="range" min="18" max="120" value="48"></div><div class="control-group"><label for="opacity">透明度 <span id="opacity-value">38%</span></label><input id="opacity" type="range" min="10" max="90" value="38"></div><div class="control-group"><label for="angle">旋转角度 <span id="angle-value">-25°</span></label><input id="angle" type="range" min="-60" max="60" value="-25"></div><div class="control-group"><label for="color">文字颜色</label><input id="color" type="color" value="#b3261e"></div><div class="control-group"><label for="output-format">输出格式</label><select id="output-format"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></div><div class="control-group"><div class="inline-check"><input id="repeat" type="checkbox" checked><label for="repeat">重复铺满</label></div></div></div>${actions("生成水印图片")}</div>
<div class="status-line" id="status" role="status" aria-live="polite" hidden></div>${resultBlock("导出结果", [["文件大小", "output-size"], ["输出尺寸", "output-dimensions"]])}`, `<article class="article"><h2>资料水印建议怎么写</h2><p>写清接收方、具体用途和当天日期，例如“仅供某平台账户核验使用｜当天日期”。不要把“他用无效”理解为技术或法律上的绝对保护。</p><h2>水印不能解决什么</h2><p>可见水印仍可能被裁剪、覆盖或修复。证件号、住址、人脸等不必要信息应另外打码；确需提交时，也应确认接收方身份和保存期限。</p><h2>导出前检查</h2><ul><li>文字完整，没有超出画布。</li><li>必要信息仍然可读，但水印覆盖范围足够。</li><li>JPG 的透明区域会以白色合成，PNG 和 WebP 可保留透明区域。</li></ul></article>${related(["remove-exif", "compress", "resize", "convert"])}`, `<section><h2>隐私边界</h2><p>当前页面不加载第三方广告或统计脚本；若以后改变，会先更新隐私政策。</p></section><section><h2>重要提醒</h2><p>水印只能降低直接挪用风险，不能保证阻止滥用。</p></section>`);
  if (tool.slug === "resize") body = toolLayout(tool, "像素与比例", "设置目标宽高，选择完整适应、定位裁剪或拉伸。预览使用小画布，下载时才按目标尺寸生成。", `${dropzone("选择或拖入一张图片", "支持静态 JPG、PNG、WebP")}${preview("canvas", "尺寸预览会显示在这里")}
<div class="controls"><div class="control-grid"><div class="control-group"><label for="width">宽度（px）</label><input id="width" type="number" min="1" max="8192" value="800"></div><div class="control-group"><label for="height">高度（px）</label><input id="height" type="number" min="1" max="8192" value="600"></div><div class="control-group"><div class="inline-check"><input id="lock-ratio" type="checkbox" checked><label for="lock-ratio">锁定原图比例</label></div></div><div class="control-group"><label for="fit-mode">适应方式</label><select id="fit-mode"><option value="contain">完整适应</option><option value="cover">定位裁剪</option><option value="stretch">拉伸</option></select></div><div class="control-group full" id="crop-controls" hidden><div class="control-grid"><div class="control-group"><label for="focal-x">水平焦点</label><input id="focal-x" type="range" min="0" max="100" value="50"><span class="hint">向左或向右移动裁剪区域</span></div><div class="control-group"><label for="focal-y">垂直焦点</label><input id="focal-y" type="range" min="0" max="100" value="50"><span class="hint">向上或向下移动裁剪区域</span></div></div></div><div class="control-group"><label for="background">留边背景</label><input id="background" type="color" value="#ffffff"></div><div class="control-group"><label for="output-format">输出格式</label><select id="output-format"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></div><div class="control-group"><div class="inline-check"><input id="transparent-background" type="checkbox"><label for="transparent-background">PNG/WebP 使用透明留边</label></div></div><div class="control-group"><label for="quality">画质 <span id="quality-value">90%</span></label><input id="quality" type="range" min="30" max="100" value="90"></div><div class="control-group full"><span class="control-label">常用预设</span><div class="button-row"><button class="button secondary" type="button" data-preset="295x413">一寸照 295×413</button><button class="button secondary" type="button" data-preset="300x300">方形 300×300</button><button class="button secondary" type="button" data-preset="800x800">方形 800×800</button><button class="button secondary" type="button" data-preset="1920x1080">16:9 1920×1080</button></div></div></div>${actions("生成新尺寸图片")}</div>
<div class="status-line" id="status" role="status" aria-live="polite" hidden></div>${resultBlock("处理结果", [["输出尺寸", "output-dimensions"], ["文件大小", "output-size"]])}`, `<article class="article"><h2>三种适应方式</h2><table><thead><tr><th>方式</th><th>结果</th><th>适合场景</th></tr></thead><tbody><tr><td>完整适应</td><td>保留整张图，比例不同时留边</td><td>商品图、资料截图</td></tr><tr><td>定位裁剪</td><td>保持比例并填满，可调整裁剪焦点</td><td>头像、封面、报名照片</td></tr><tr><td>拉伸</td><td>不裁剪但可能改变比例</td><td>只在系统明确要求时使用</td></tr></tbody></table><h2>放大不会恢复细节</h2><p>增加像素只是插值，不能生成原图中不存在的纹理。报名系统同时限制像素和 KB 时，先完成尺寸处理，再使用压缩工具。</p><h2>画布限制</h2><p>单边最多 8192 像素、总计最多 2400 万像素，极端宽高比会被拒绝。不同移动浏览器的实际内存上限仍可能更低。</p></article>${related(["compress", "convert", "watermark", "remove-exif"])}`, `<section><h2>透明留边</h2><p>JPG 不支持透明；PNG 和 WebP 可选择透明或指定背景色。</p></section><section><h2>裁剪检查</h2><p>定位裁剪后请检查人脸、文字和二维码是否完整。</p></section>`);
  if (tool.slug === "convert") body = toolLayout(tool, "文件格式", "保持像素尺寸，在 JPG、PNG 和 WebP 之间转换。相同格式不会重复编码。", `${dropzone("选择或拖入一张图片", "动画图片不会被静默转换成单帧")}${preview("img", "原图预览会显示在这里")}
<div class="controls"><div class="control-grid"><div class="control-group"><label for="output-format">目标格式</label><select id="output-format"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></div><div class="control-group"><label for="quality">画质 <span id="quality-value">90%</span></label><input id="quality" type="range" min="20" max="100" value="90"><span class="hint">PNG 为无损编码，此设置不生效</span></div><div class="control-group"><label for="background">JPG 透明区域背景</label><input id="background" type="color" value="#ffffff"><span class="hint">仅输出 JPG 时生效</span></div></div>${actions("开始转换")}</div>
<div class="status-line" id="status" role="status" aria-live="polite" hidden></div>${resultBlock("转换结果", [["源格式", "original-format"], ["输出格式", "output-format-name"], ["输出尺寸", "output-dimensions"], ["文件大小", "output-size"]])}`, `<article class="article"><h2>JPG、PNG、WebP 怎么选</h2><table><thead><tr><th>格式</th><th>特点</th><th>常见用途</th></tr></thead><tbody><tr><td>JPG</td><td>照片体积较小，不支持透明</td><td>报名材料、照片</td></tr><tr><td>PNG</td><td>无损，支持透明，体积可能较大</td><td>截图、图标、透明素材</td></tr><tr><td>WebP</td><td>支持透明，网页使用通常更省体积</td><td>网站图片</td></tr></tbody></table><h2>转换会改变什么</h2><p>浏览器会重新编码像素，原始 EXIF、ICC 色彩配置、DPI、XMP 和版权字段通常不会原样保留；Canvas 导出的 DPI 也不应当作印刷尺寸依据。</p><h2>动画和同格式输入</h2><p>动画 PNG 与动画 WebP 会直接提示不支持。源格式与目标格式相同时，工具不会无意义地再次编码；如需减小体积，请使用压缩工具。</p></article>${related(["compress", "resize", "remove-exif", "watermark"])}`, `<section><h2>透明区域</h2><p>输出 WebP 或 PNG 时保留透明通道；输出 JPG 时使用所选背景色。</p></section><section><h2>色彩提醒</h2><p>重新编码可能改变广色域、ICC 配置和印刷 DPI。</p></section>`);
  if (tool.slug === "remove-exif") body = toolLayout(tool, "照片隐私", "先查看浏览器能够识别的常见拍摄信息，再重新编码像素，生成不复制原 EXIF 的新文件。", `${dropzone("选择或拖入一张照片", "GPS 坐标不会自动展开；最大 30 MB")}${preview("img", "照片预览会显示在这里")}
<section id="metadata" aria-labelledby="metadata-title" hidden><h2 id="metadata-title">检测到的信息</h2><table class="meta-table"><tbody id="meta-body"></tbody></table></section>
<div class="controls"><div class="control-grid"><div class="control-group"><label for="output-format">输出格式</label><select id="output-format"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></div><div class="control-group"><label for="quality">画质 <span id="quality-value">92%</span></label><input id="quality" type="range" min="30" max="100" value="92"></div></div>${actions("清除并生成副本")}</div>
<div class="status-line" id="status" role="status" aria-live="polite" hidden></div>${resultBlock("清除结果", [["新文件大小", "output-size"], ["输出格式", "output-format-name"], ["结果检查", "verification"]])}`, `<article class="article"><h2>照片信息可能包括什么</h2><p>常见 EXIF 字段包括拍摄时间、相机或手机型号、镜头、方向、曝光参数和 GPS。精确坐标默认隐藏，只有主动点击后才显示。</p><h2>清除方法与验证</h2><p>工具把可见像素绘制到新画布，再由浏览器编码。JPG 输出会重新检查是否仍存在 EXIF APP1 段；PNG 和 WebP 输出说明为“没有复制原元数据”，不声称进行了完整取证级分析。</p><h2>清除 EXIF 不等于匿名</h2><p>画面中的人脸、门牌、文件编号和环境特征仍可能暴露身份。隐写数据、专有元数据和平台再次写入的信息也不在完整保证范围内。</p></article>${related(["watermark", "compress", "resize", "convert"])}`, `<section><h2>读取范围</h2><p>只读取 JPEG APP1 段内的有限常见标签，并限制字段长度和目录数量。</p></section><section><h2>使用边界</h2><p>不要把输出作为取证材料，也不要删除唯一的原文件。</p></section>`);
  await writePage(`${tool.slug}/index.html`, pageShell(page, tool.slug, body, ["image-core.js", tool.script]));
}

const methodology = { kind: "page", path: "/methodology/", title: `测试方法与处理边界 - ${config.siteName}`, description: "图安工具的自动测试范围、待完成的浏览器检查、隐私边界和已知限制。" };
await writePage("methodology/index.html", pageShell(methodology, "methodology", `<section class="page-head"><div class="page-head-inner"><p class="eyebrow">可复核说明</p><h1>测试方法与处理边界</h1><p>这里区分已经自动验证的项目与仍需人工完成的真实设备检查。</p></div></section><section class="section"><article class="article"><h2>已经自动验证</h2><ul><li>HTML 内部链接、脚本、样式路径、JSON-LD 与站点地图。</li><li>生成文件与当前配置一致，发布目录只包含逐文件白名单。</li><li>JPG、PNG、WebP 文件签名、尺寸、JPEG 填充字节和超长头部。</li><li>动画 PNG、动画 WebP、伪装文件、超限尺寸和损坏 EXIF 的拒绝或提示。</li><li>错误 MIME 修正、零宽水印拒绝和文件切换状态清理。</li></ul><h2>尚需真实设备检查</h2><p>自动测试不等于浏览器兼容结论。发布前仍需在最新版 Chrome、Edge、Firefox、Safari、iOS Safari、Android Chrome，以及微信和 QQ 内置浏览器检查选择文件、处理、打开结果和下载；完成情况记录在代码包的上线清单中。</p><h2>明确限制</h2><ul><li>不处理动画 PNG、动画 WebP、GIF 或多帧照片格式。</li><li>不保证保留 ICC、DPI、XMP、版权字段或完整色彩外观。</li><li>单边上限 8192 像素，总像素上限 2400 万，极端宽高比会被拒绝。</li><li>浏览器 Canvas 编码过程无法可靠中途终止，因此处理期间会锁定参数。</li><li>Canvas 重新编码不是取证级元数据清理。</li></ul><h2>更新记录</h2><p>最近一次重要更新：${config.lastModified}。修正了文件结构解析、任务状态、发布校验、缓存版本和可访问性。</p></article></section>`));

const about = { kind: "page", path: "/about/", title: `关于${config.siteName}`, description: `${config.siteName}提供五个浏览器本地运行的中文图片处理工具，并公开说明功能和隐私边界。` };
await writePage("about/index.html", pageShell(about, "about", `<section class="page-head"><div class="page-head-inner"><p class="eyebrow">关于本站</p><h1>把图片处理留在当前设备</h1><p>${escapeHtml(config.siteName)}由${escapeHtml(config.operatorName)}维护，专注于无需注册、无需上传源图片即可完成的常见任务。</p></div></section><section class="section"><article class="article"><h2>为什么只做五个工具</h2><p>首个版本集中在压缩、水印、尺寸、格式和 EXIF，便于把文件边界、移动端表现和下载流程真正测清楚。只有现有工具稳定、被真实使用后，才会扩展同一主题内的新功能。</p><h2>处理原则</h2><ul><li>本站代码不主动上传用户选择的图片。</li><li>不接入来源不明的运行时依赖。</li><li>不把重新编码描述成无损，也不把水印描述成绝对保护。</li><li>关键限制和测试范围公开在测试方法页。</li></ul><h2>联系与反馈</h2><p>发现损坏文件、浏览器兼容或文案问题，可通过<a href="${escapeHtml(config.contactUrl)}" rel="nofollow">公开反馈渠道</a>联系维护者。请勿在反馈中上传证件、私人照片或其他敏感文件。</p><h2>源代码</h2><p>站点源代码和变更记录发布在<a href="${escapeHtml(config.repositoryUrl)}" rel="nofollow">代码仓库</a>。公开源代码有助于检查处理逻辑，但不代表所有浏览器和文件都没有未知问题。</p></article></section>`));

const privacy = { kind: "page", path: "/privacy/", title: `隐私政策 - ${config.siteName}`, description: `${config.siteName}隐私政策，说明本地图片处理、浏览器临时状态、GitHub Pages托管和第三方服务边界。` };
await writePage("privacy/index.html", pageShell(privacy, "privacy", `<section class="page-head"><div class="page-head-inner"><p class="eyebrow">隐私政策</p><h1>图片由浏览器处理</h1><p>更新日期：${config.lastModified}。本政策描述当前发布版本的实际行为。</p></div></section><section class="section"><article class="article"><h2>本站处理哪些数据</h2><p>用户主动选择的图片、文件名、水印文字和输出参数由页面脚本在当前浏览器中读取。本站代码没有图片上传接口，不会主动把这些内容发送到本站或第三方服务器。</p><h2>浏览器临时状态</h2><p>处理时，浏览器内存会保存解码图片、Canvas 和 Blob 临时地址。页面刷新或关闭后通常会释放；浏览器的前进后退缓存可能在当前会话内短暂保留页面状态。下载后的文件由用户自行管理。</p><h2>托管与访问日志</h2><p>本站使用 GitHub Pages 托管。浏览器访问页面时会连接 GitHub 的基础设施，GitHub 可能处理 IP 地址、请求时间、浏览器信息和访问路径。具体处理方式和保留期限由<a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement" rel="nofollow">GitHub 隐私声明</a>说明。本站会根据实际使用的服务和适用要求维护本政策，不把“图片没有上传”与“页面访问完全不产生网络数据”混为一谈。</p><h2>Cookie、统计与广告</h2><p>当前版本不加载统计、广告或个性化推荐脚本，也不设置本站 Cookie。以后如新增服务，将在启用前说明服务提供方、目的、数据种类、保存期限、退出方式和必要的同意机制。第三方脚本不得与含有文件预览和 Canvas 的工具工作区共享页面权限。</p><h2>联系我们</h2><p>隐私问题可通过<a href="${escapeHtml(config.contactUrl)}" rel="nofollow">本站反馈渠道</a>联系${escapeHtml(config.operatorName)}。请不要发送原始证件或私人照片。</p></article></section>`));

const terms = { kind: "page", path: "/terms/", title: `使用条款与免责声明 - ${config.siteName}`, description: `${config.siteName}的使用范围、用户责任、图片处理限制和服务可用性说明。` };
await writePage("terms/index.html", pageShell(terms, "terms", `<section class="page-head"><div class="page-head-inner"><p class="eyebrow">使用条款</p><h1>先核对结果，再决定使用</h1><p>更新日期：${config.lastModified}。使用本站即表示理解以下功能边界。</p></div></section><section class="section"><article class="article"><h2>工具用途</h2><p>本站提供通用图片处理功能，结果由用户检查后自行决定是否使用。本站不保证输出一定满足报名平台、印刷、取证或特定合规要求。</p><h2>用户责任</h2><p>用户应确保有权处理所选择的图片，不得利用本站侵犯隐私、著作权或其他合法权益。处理证件和敏感资料时，应确认接收方身份、必要性和保存期限。</p><h2>安全边界</h2><p>可见水印不能阻止所有滥用；删除常见 EXIF 不代表完全匿名；图片放大不能恢复原本不存在的细节；重新编码也可能改变色彩配置、DPI 和元数据。</p><h2>服务可用性</h2><p>浏览器格式支持、设备内存和下载策略不同，处理可能失败。请保留原文件，下载后重新打开并检查。本站可能修复问题、调整限制或停止某项功能。</p><h2>禁止用途</h2><p>不得使用本站处理无权持有的敏感材料、规避平台审核、伪造证明或实施其他违法行为。</p><h2>联系</h2><p>条款或功能问题可通过<a href="${escapeHtml(config.contactUrl)}" rel="nofollow">反馈渠道</a>联系${escapeHtml(config.operatorName)}。</p></article></section>`));

const notFound = { kind: "page", path: "/404.html", title: `页面不存在 - ${config.siteName}`, description: "请求的页面不存在。", noindex: true };
await writePage("404.html", pageShell(notFound, "", `<section class="page-head"><div class="page-head-inner"><p class="eyebrow">404</p><h1>这个页面不存在</h1><p>地址可能输入有误，也可能已经调整。</p><div class="button-row"><a class="button" href="${asset("/")}">返回全部工具</a></div></div></section>`));

const urls = ["/", ...tools.map((tool) => `/${tool.slug}/`), "/methodology/", "/about/", "/privacy/", "/terms/"];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((path) => `  <url><loc>${absolute(path)}</loc><lastmod>${config.pageLastModified[path]}</lastmod></url>`).join("\n")}\n</urlset>\n`;
await writeFile(resolve(root, "sitemap.xml"), sitemap);
await writeFile(resolve(root, "robots.txt"), noindex ? "User-agent: *\nDisallow: /\n" : `User-agent: *\nAllow: /\n\nSitemap: ${absolute("/sitemap.xml")}\n`);
generatedFiles.push("sitemap.xml", "robots.txt");
if (config.customDomain) { await writeFile(resolve(root, "CNAME"), String(config.customDomain).trim() + "\n"); generatedFiles.push("CNAME"); }
else await rm(resolve(root, "CNAME"), { force: true });

const generatedHashes = {};
for (const file of generatedFiles) generatedHashes[file] = createHash("sha256").update(await readFile(resolve(root, file))).digest("hex");
const staticHashes = {};
for (const file of staticFiles) staticHashes[file] = createHash("sha256").update(await readFile(resolve(root, file))).digest("hex");
const configHash = createHash("sha256").update(await readFile(resolve(root, "site.config.json"))).digest("hex");
await writeFile(resolve(root, ".generated-manifest.json"), JSON.stringify({ configHash, assetVersion, files: generatedFiles, hashes: generatedHashes, staticHashes }, null, 2) + "\n");
await writeFile(resolve(root, ".publish-manifest.json"), JSON.stringify({ files: [...staticFiles, ...generatedFiles].sort() }, null, 2) + "\n");

async function writePage(relativePath, content) {
  const destination = resolve(root, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, content);
  generatedFiles.push(relativePath);
}
