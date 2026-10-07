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
const staticFiles = [".nojekyll", "assets/css/styles.css", "assets/img/apple-touch-icon.png", "assets/img/favicon.png", "assets/img/icon-192.png", "assets/img/icon-512.png", "assets/img/hero-workbench.webp", "assets/js/image-core.js", "assets/js/site.js", "assets/js/requirements.js", "assets/js/compress.js", "assets/js/batch-compress.js", "assets/js/batch-exif.js", "assets/js/watermark.js", "assets/js/resize.js", "assets/js/convert.js", "assets/js/exif.js", "assets/js/inspect.js"];
const assetVersion = createHash("sha256").update((await Promise.all(staticFiles.map((file) => readFile(resolve(root, file))))).map((item) => createHash("sha256").update(item).digest("hex")).join(":"), "utf8").digest("hex").slice(0, 12);
const staticAsset = (path) => `${asset(path)}?v=${assetVersion}`;

try {
  const previous = JSON.parse(await readFile(resolve(root, ".generated-manifest.json"), "utf8"));
  const configuredPages = new Set(Object.keys(config.pageLastModified).map((path) => path === "/" ? "index.html" : `${path.slice(1)}index.html`));
  const safeGeneratedPaths = new Set(["404.html", "friends/index.html", "robots.txt", "sitemap.xml", "manifest.webmanifest", "service-worker.js", "CNAME", ...configuredPages]);
  for (const file of previous.files || []) {
    if (typeof file !== "string" || !safeGeneratedPaths.has(file)) throw new Error(`旧生成清单包含非法路径：${file}`);
    await rm(resolve(root, file), { force: true });
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const tools = [
  { slug: "inspect", name: "图片检查器", short: "检查图片", description: "本地查看图片格式、文件大小、像素尺寸、宽高比和方向，并根据结果选择后续处理工具。", script: "inspect.js", category: "UtilitiesApplication" },
  { slug: "photo-requirements", name: "按报名平台要求调整照片", short: "报名照片调整", description: "填写目标宽高、最大 KB、输出格式和裁剪方式，一次完成报名或资料图片的尺寸、格式与文件大小处理。", script: "requirements.js", category: "MultimediaApplication" },
  { slug: "compress", name: "图片压缩到指定 KB", short: "压缩图片", description: "在线把 JPG、PNG、WebP 图片压缩到 50KB、100KB、200KB 等指定大小，可按需调整画质与像素尺寸。", script: "compress.js", category: "MultimediaApplication" },
  { slug: "batch-compress", name: "批量图片压缩", short: "批量压缩", description: "一次选择最多 10 张 JPG、PNG、WebP 图片，按同一目标 KB 顺序压缩，并逐项检查结果与下载。", script: "batch-compress.js", category: "MultimediaApplication" },
  { slug: "batch-exif", name: "批量清除图片元数据", short: "批量清元数据", description: "一次选择最多 10 张 JPG、PNG、WebP 图片，通过浏览器重新编码生成不复制原始 EXIF 等元数据的新副本，并支持 ZIP 打包下载。", script: "batch-exif.js", category: "SecurityApplication" },
  { slug: "watermark", name: "图片加水印（证件与资料）", short: "添加水印", description: "在线给证件、资料和普通图片添加用途水印，支持重复铺满、透明度、角度、颜色和自动换行。", script: "watermark.js", category: "SecurityApplication" },
  { slug: "resize", name: "图片尺寸修改与裁剪", short: "修改尺寸", description: "在线修改图片宽高像素，支持按比例缩放、定位裁剪、完整适应和常用尺寸预设。", script: "resize.js", category: "MultimediaApplication" },
  { slug: "convert", name: "图片格式转换（JPG/PNG/WebP）", short: "转换格式", description: "在线转换 JPG、PNG、WebP 图片格式，支持透明背景处理和画质设置。", script: "convert.js", category: "MultimediaApplication" },
  { slug: "remove-exif", name: "EXIF 查看与清除", short: "清除 EXIF", description: "在线查看 JPEG 中可识别的常见 EXIF 字段，并通过重新编码清理 JPG、PNG、WebP 中不随像素重新导出的元数据。", script: "exif.js", category: "SecurityApplication" }
];

const faqByTool = {
  "photo-requirements": [
    ["显示“全部满足”就一定上传成功吗？", "不一定。本站只能核对你填写的宽高、格式和最大 KB；平台还可能检查背景色、人脸位置、DPI、文件命名或其他业务规则，最终仍应在目标平台实际上传确认。"]
  ],
  inspect: [],
  compress: [
    ["100 KB 在这里怎么计算？", "本工具按 1 KB = 1024 字节计算，因此 100 KB 的目标值是 102400 字节。实际导出会尽量不超过目标，但受图片内容、编码器和最低画质限制影响。"],
    ["为什么照片比简单截图更难压小？", "树叶、头发、夜景噪点和密集文字包含更多细碎变化，编码器需要保留更多信息；纯色背景和大面积平坦区域通常更容易压缩。"],
    ["什么时候应该先改尺寸再压 KB？", "当上传平台同时规定像素尺寸和文件大小时，先把宽高调整到要求，再压缩文件体积，通常更稳定，也能避免先压缩后再次缩放造成额外损失。"]
  ],
  "batch-compress": [
    ["一次最多可以处理多少张图片？", "当前一次最多 10 张，总文件大小不超过 80 MB。工具会逐张解码和压缩，避免同时把多张大图完整展开到内存。"],
    ["可以一次下载全部结果吗？", "可以。成功结果既能逐项下载，也能在当前浏览器内存中打包成一个 ZIP；ZIP 不上传服务器，也不写入离线缓存。"],
    ["每张图都会压到完全相同的大小吗？", "不会。目标是每张图尽量不超过同一个 KB 上限；不同画面复杂度会得到不同的实际文件大小和画质。"]
  ],
  "batch-exif": [
    ["批量清除会删除所有可能的元数据吗？", "不能做绝对保证。本工具通过重新绘制可见像素并导出新文件，通常不会复制原始 EXIF、XMP、ICC、DPI 等元数据，但不同浏览器的编码器仍可能写入自身必要的格式信息。"],
    ["为什么输出文件大小可能变化？", "因为这是重新编码，不是只删除一个元数据块。JPG/WebP 的质量设置、PNG 编码器和透明背景都会影响输出体积。"],
    ["ZIP 会上传到服务器生成吗？", "不会。ZIP 在当前浏览器内存中打包，下载后即可丢弃；本站不会把图片或 ZIP 上传服务器。"]
  ],
  watermark: [
    ["证件或资料水印应该写什么？", "优先写清接收方、具体用途和日期，例如“仅供 XX 平台账户核验使用｜YYYY-MM-DD”。不要写与实际用途不符的绝对承诺。"],
    ["重复铺满还是单个水印？", "需要明显限制用途时可用重复铺满；普通资料只做轻量标识时可用单个水印。两种方式都应避开必须清晰可读的关键信息。"],
    ["哪些信息不该只靠水印保护？", "证件号、住址、银行卡号等非必要敏感字段更适合直接打码。水印只能增加直接挪用成本，不能阻止裁剪、覆盖或修复。"]
  ],
  resize: [
    ["报名系统同时限制像素和 KB 怎么办？", "通常先按平台要求调整宽高和比例，再用压缩工具控制文件大小。这样比反复压缩、缩放更容易得到稳定结果。"],
    ["295×413 是所有一寸照的统一标准吗？", "不是。295×413 像素是常见预设之一，但不同报名平台可能要求不同像素、比例、文件大小或背景色，应以具体提交页面要求为准。"]
  ],
  convert: [],
  "remove-exif": [
    ["照片 EXIF 里一定有 GPS 吗？", "不一定。是否包含 GPS 取决于设备、系统权限、相机设置以及照片是否经过编辑或社交平台重新处理。"],
    ["清除 EXIF 会不会完全匿名？", "不会。人脸、门牌、文件编号、环境特征以及其他未被本工具解析的元数据仍可能暴露身份或来源。"],
    ["为什么清除 EXIF 会重新编码？", "本工具把可见像素绘制到新画布后重新导出，不是直接修改原文件的元数据区。因此输出文件可能出现轻微画质、色彩或文件大小变化。"]
  ]
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function jsonLdHash(json) {
  return createHash("sha256").update(json).digest("base64");
}

function structuredData(page) {
  const items = [];
  const modified = config.pageLastModified[page.path] || config.lastModified;
  const organizationId = `${absolute("/")}#organization`;
  const websiteId = `${absolute("/")}#website`;
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": organizationId,
    name: config.siteName,
    url: absolute("/"),
    sameAs: [config.repositoryUrl],
    foundingDate: config.projectStarted
  };

  if (page.kind === "home") {
    items.push(organization);
    items.push({ "@context": "https://schema.org", "@type": "WebSite", "@id": websiteId, name: config.siteName, alternateName: config.shortName, url: absolute("/"), description: page.description, inLanguage: "zh-CN", dateModified: modified, publisher: { "@id": organizationId } });
    items.push({ "@context": "https://schema.org", "@type": "ItemList", name: "在线图片工具", itemListElement: tools.map((tool, index) => ({ "@type": "ListItem", position: index + 1, name: tool.name, url: absolute(`/${tool.slug}/`) })) });
  }

  if (page.kind === "collection") {
    items.push(organization);
    items.push({ "@context": "https://schema.org", "@type": "WebSite", "@id": websiteId, name: config.siteName, url: absolute("/"), inLanguage: "zh-CN", publisher: { "@id": organizationId } });
    items.push({ "@context": "https://schema.org", "@type": "CollectionPage", name: page.h1, url: absolute(page.path), description: page.description, inLanguage: "zh-CN", dateModified: modified, isPartOf: { "@id": websiteId }, publisher: { "@id": organizationId } });
    items.push({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "全部工具", item: absolute("/") },
      { "@type": "ListItem", position: 2, name: page.h1, item: absolute(page.path) }
    ] });
  }

  if (page.kind === "tool") {
    items.push(organization);
    items.push({ "@context": "https://schema.org", "@type": "WebSite", "@id": websiteId, name: config.siteName, url: absolute("/"), inLanguage: "zh-CN", publisher: { "@id": organizationId } });
    items.push({ "@context": "https://schema.org", "@type": "WebApplication", name: page.tool.name, url: absolute(`/${page.tool.slug}/`), description: page.description, applicationCategory: page.tool.category, operatingSystem: "支持现代浏览器的桌面与移动设备", browserRequirements: "需要 JavaScript、Canvas、Blob 和本地文件读取能力", isAccessibleForFree: true, isPartOf: { "@id": websiteId }, offers: { "@type": "Offer", price: 0, priceCurrency: "CNY" }, author: { "@id": organizationId }, publisher: { "@id": organizationId }, dateModified: modified });
    items.push({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "全部工具", item: absolute("/") },
      { "@type": "ListItem", position: 2, name: page.tool.name, item: absolute(`/${page.tool.slug}/`) }
    ] });
  }

  if (page.kind === "article") {
    items.push(organization);
    items.push({ "@context": "https://schema.org", "@type": "WebSite", "@id": websiteId, name: config.siteName, url: absolute("/"), inLanguage: "zh-CN", publisher: { "@id": organizationId } });
    const published = config.pagePublished[page.path];
    items.push({ "@context": "https://schema.org", "@type": "Article", headline: page.h1, description: page.description, mainEntityOfPage: absolute(page.path), inLanguage: "zh-CN", datePublished: published, dateModified: modified, isPartOf: { "@id": websiteId }, author: { "@type": "Organization", "@id": organizationId, name: config.siteName, url: absolute("/about/") }, publisher: { "@id": organizationId } });
    items.push({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "全部工具", item: absolute("/") },
      { "@type": "ListItem", position: 2, name: "使用指南", item: absolute("/guides/") },
      { "@type": "ListItem", position: 3, name: page.h1, item: absolute(page.path) }
    ] });
  }

  return items.map((item) => JSON.stringify(item).replace(/[<>&\u2028\u2029]/g, (character) => ({ "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" })[character]));
}

const analyticsId = "G-40JD4CQ5DT";
const analyticsBootstrap = `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${analyticsId}', { anonymize_ip: true });`;

function head(page) {
  const canonical = absolute(page.path);
  const modified = config.pageLastModified[page.path] || config.lastModified;
  const shouldNoindex = noindex || page.noindex;
  const json = structuredData(page);
  const scriptHashes = [...json.map((item) => `'sha256-${jsonLdHash(item)}'`), `'sha256-${jsonLdHash(analyticsBootstrap)}'`].join(" ");
  const csp = `default-src 'self'; img-src 'self' blob: data: https://www.google-analytics.com https://*.google-analytics.com; script-src 'self' https://www.googletagmanager.com ${scriptHashes}; style-src 'self'; connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f7f5ef">
  <meta name="color-scheme" content="light">
  <meta name="application-name" content="${escapeHtml(config.siteName)}">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="${escapeHtml(config.shortName)}">
  <meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
  <meta name="referrer" content="no-referrer">
  ${shouldNoindex ? `<meta name="robots" content="noindex,${page.follow ? 'follow' : 'nofollow'}">` : '<meta name="robots" content="index,follow,max-image-preview:large">'}
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.description)}">
  <meta name="author" content="${escapeHtml(config.operatorName)}">
  ${page.path === "/404.html" ? "" : `<link rel="canonical" href="${canonical}">`}
  <link rel="icon" href="${staticAsset("/assets/img/favicon.png")}" sizes="32x32">
  <link rel="apple-touch-icon" href="${staticAsset("/assets/img/apple-touch-icon.png")}">
  <link rel="manifest" href="${asset("/manifest.webmanifest")}">
  <meta property="og:type" content="${page.kind === "article" ? "article" : "website"}">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:site_name" content="${escapeHtml(config.siteName)}">
  <meta property="og:title" content="${escapeHtml(page.ogTitle || page.title)}">
  <meta property="og:description" content="${escapeHtml(page.description)}">
  <meta property="og:url" content="${canonical}">
  ${page.kind === "article" ? `<meta property="article:published_time" content="${config.pagePublished[page.path]}T00:00:00+08:00">\n  <meta property="article:modified_time" content="${modified}T00:00:00+08:00">` : ""}
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
  <script async src="https://www.googletagmanager.com/gtag/js?id=${analyticsId}"></script>
  <script>${analyticsBootstrap}</script>
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
    <div class="nav-links" id="site-navigation">${link("/", "全部工具", "home")}${link("/guides/", "使用指南", "guides")}${link("/methodology/", "安全与隐私", "methodology")}${link("/about/", "关于", "about")}</div>
  </nav>
</header>`;
}

function footer(current) {
  const friendLinks = current === "home" ? `<div class="friend-links" aria-label="友情链接"><span class="footer-label">友情链接</span><a href="${asset("/friends/")}">查看友情链接</a></div>` : "";
  return `<footer class="site-footer">
  <div class="footer-inner">
    <span>© <span data-year></span> ${escapeHtml(config.siteName)}</span>
    <div class="footer-groups"><div class="footer-links"><a href="${asset("/guides/")}">使用指南</a><a href="${asset("/methodology/")}">安全与隐私</a><a href="${asset("/about/")}">关于本站</a><a href="${asset("/privacy/")}">隐私政策</a><a href="${asset("/terms/")}">使用条款</a><button class="footer-install" type="button" data-install-app hidden>安装到设备</button></div>${friendLinks}</div>
  </div>
</footer>
<script src="${staticAsset("/assets/js/site.js")}" defer></script>`;
}

function pageShell(page, current, body, scripts = []) {
  const modified = config.pageLastModified[page.path] || config.lastModified;
  let enhancedBody = body;
  if (page.kind === "article") {
    const published = config.pagePublished[page.path];
    const meta = published === modified ? `发布于 <time datetime="${published}">${published}</time>` : `发布于 <time datetime="${published}">${published}</time> · 更新于 <time datetime="${modified}">${modified}</time>`;
    enhancedBody = enhancedBody.replace("</div></section>", `<p class="article-meta">${meta}</p></div></section>`);
    enhancedBody = enhancedBody.replace("</article>", `<div class="article-actions"><button class="button secondary" type="button" data-share-page>分享本文</button><a class="home-text-link" href="${asset("/guides/")}">返回使用指南</a></div></article>`);
  }
  const noScriptNotice = page.kind === "tool" ? `<noscript><div class="noscript-note" role="note">这个工具需要 JavaScript 才能在浏览器本地处理图片。请启用 JavaScript 后重新打开页面；页面中的说明内容仍可正常阅读。</div></noscript>` : "";
  return `${head(page)}
<body>
${header(current)}
<div class="offline-notice" data-offline-notice role="status" aria-live="polite" hidden>当前处于离线模式：已缓存的核心工具仍可打开，页面访问统计和外部链接可能不可用。</div>
${noScriptNotice}
<main id="main" tabindex="-1">
${enhancedBody}
</main>
${footer(current)}
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

function guideLinks(slug) {
  const links = {
    inspect: [["/guides/photo-requirements/", "报名照片像素、KB、比例怎么一起看？"], ["/guides/image-kb-pixels/", "KB、像素和分辨率有什么区别？"]],
    "photo-requirements": [["/guides/photo-requirements/", "看懂平台给出的像素、KB与比例要求"], ["/guides/photo-upload-too-large/", "照片上传提示“文件过大”怎么办？"], ["/guides/jpg-png-webp/", "JPG、PNG、WebP 应该怎么选？"]],
    compress: [["/guides/photo-upload-too-large/", "照片上传提示“文件过大”怎么办？"], ["/guides/compressed-image-blurry/", "图片压缩后模糊怎么办？"], ["/guides/image-kb-pixels/", "KB、像素和分辨率有什么区别？"]],
    "batch-compress": [["/guides/photo-upload-too-large/", "照片上传提示“文件过大”怎么办？"], ["/guides/compressed-image-blurry/", "批量压缩后画质怎么检查？"], ["/guides/image-kb-pixels/", "KB、像素和分辨率有什么区别？"]],
    "batch-exif": [["/guides/remove-photo-location/", "照片定位信息怎么检查和清除？"], ["/guides/id-watermark/", "分享证件图片时还应注意什么？"]],
  watermark: [["/guides/id-watermark/", "证件图片水印怎么写更合适？"], ["/guides/remove-photo-location/", "照片定位信息怎么检查和清除？"]],
    resize: [["/guides/photo-requirements/", "报名照片像素、KB、比例怎么一起看？"], ["/guides/image-kb-pixels/", "KB、像素和分辨率有什么区别？"], ["/guides/photo-upload-too-large/", "同时限制像素和 KB 应该先改什么？"]],
    convert: [["/guides/jpg-png-webp/", "JPG、PNG、WebP 应该怎么选？"], ["/guides/png-to-jpg-white-background/", "PNG 转 JPG 为什么会变成白底？"], ["/guides/photo-upload-too-large/", "格式不支持和文件过大怎么区分？"]],
    "remove-exif": [["/guides/remove-photo-location/", "照片定位信息怎么检查和清除？"], ["/guides/id-watermark/", "分享证件图片时水印怎么写？"]]
  }[slug] || [];
  if (!links.length) return "";
  return `<section class="section compact related"><h2>进一步了解</h2><div class="related-links">${links.map(([href, label]) => `<a href="${asset(href)}">${label}</a>`).join("")}</div></section>`;
}

function faqSection(slug) {
  const items = faqByTool[slug] || [];
  if (!items.length) return "";
  return `<section class="section compact"><article class="article"><h2>常见问题</h2>${items.map(([question, answer]) => `<h3>${escapeHtml(question)}</h3><p>${escapeHtml(answer)}</p>`).join("")}</article></section>`;
}

function promotionBanner() {
  return `<section class="promotion-band" aria-label="推广">
  <div class="promotion-inner">
    <a class="promotion-banner" href="https://huyuejsq.co/" target="_blank" rel="sponsored noopener noreferrer" aria-label="推广：访问虎跃加速网站">
      <span class="promotion-label">推广</span>
      <span class="promotion-copy"><strong>虎跃加速</strong><span>多平台网络连接工具，查看产品介绍与下载方式</span></span>
      <span class="promotion-action">访问网站 <span aria-hidden="true">→</span></span>
    </a>
  </div>
</section>`;
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
  kind: "home", path: "/", title: `报名照片处理与在线图片工具 - 尺寸、KB、格式｜${config.siteName}`, ogTitle: `${config.siteName}：浏览器本地图片处理工具`,
  description: "按报名或上传平台要求一次处理图片宽高、最大KB和格式，并提供图片检查、单张/批量压缩、水印、尺寸、格式转换和EXIF清除。图片在浏览器本地处理。"
};
const homeBody = `<section class="tool-directory" id="tools"><div class="tool-directory-inner">
  <div class="home-intro">
    <p class="eyebrow">在线图片工具</p>
    <h1>报名照片按要求处理：尺寸、KB、格式一次完成</h1>
    <p class="home-summary">${escapeHtml(config.siteName)}可以直接按上传平台给出的宽高、最大 KB 和格式处理图片，也提供图片检查、单张与批量压缩、资料水印、尺寸裁剪、格式转换和 EXIF 清理。图片在当前浏览器中处理，无需上传源文件。</p>
    <div class="home-facts" aria-label="服务特点"><span>浏览器本地处理</span><span>无需注册</span><span>免费使用</span></div>
    <div class="home-actions"><a class="button" href="${asset("/photo-requirements/")}">按上传要求处理</a><a class="home-text-link" href="${asset("/inspect/")}">先检查图片</a></div>
  </div>
  <div class="directory-heading"><div><p class="eyebrow">全部工具</p><h2>选择要处理的图片任务</h2></div><p>支持静态 JPG、PNG 和 WebP；具体格式和尺寸限制请以各工具页面说明为准。</p></div>
  <div class="tool-grid" id="tool-list">
${tools.map((tool, index) => `<a class="tool-card reveal" href="${asset(`/${tool.slug}/`)}"><span class="tool-symbol" aria-hidden="true">${["检查", "要求", "KB", "批压", "批净", "水印", "PX", "格式", "EXIF"][index]}</span><span class="tool-card-copy"><strong>${tool.name}</strong><span>${tool.description}</span></span><span class="tool-arrow" aria-hidden="true">→</span></a>`).join("\n")}
  </div>
</div></section>
<section class="section compact task-guide" aria-labelledby="task-guide-title"><div class="article"><p class="eyebrow">不知道该选哪个？</p><h2 id="task-guide-title">按你现在遇到的问题选择</h2><div class="task-grid"><a href="${asset("/photo-requirements/")}"><strong>已经知道平台要求</strong><span>填写宽高、最大 KB 和格式，一次处理</span></a><a href="${asset("/inspect/")}"><strong>不知道图片哪里不符合要求</strong><span>先查看格式、KB、像素、比例和方向</span></a><a href="${asset("/compress/")}"><strong>文件太大、上传失败</strong><span>单张压缩到 50KB、100KB、200KB 等指定大小</span></a><a href="${asset("/batch-compress/")}"><strong>多张图片都要压到同一上限</strong><span>一次选择最多 10 张，逐张压缩和下载</span></a><a href="${asset("/resize/")}"><strong>宽高或比例不符合要求</strong><span>修改像素、裁剪或给图片留边</span></a><a href="${asset("/convert/")}"><strong>平台只接受 JPG / PNG / WebP</strong><span>转换图片格式并处理透明背景</span></a><a href="${asset("/watermark/")}"><strong>需要发送证件或资料图片</strong><span>添加接收方、用途和日期水印</span></a><a href="${asset("/remove-exif/")}"><strong>担心照片带定位或拍摄信息</strong><span>先查看常见 EXIF，再生成清理后的副本</span></a><a href="${asset("/batch-exif/")}"><strong>多张照片都要减少元数据</strong><span>批量重新编码，并可 ZIP 下载</span></a></div></div></section>
<section class="section compact"><article class="article"><p class="eyebrow">使用指南</p><h2>先判断问题，再选择处理方式</h2><div class="related-links"><a href="${asset("/guides/image-kb-pixels/")}">图片 KB、像素、分辨率有什么区别？</a><a href="${asset("/guides/photo-upload-too-large/")}">照片上传提示“文件过大”怎么办？</a><a href="${asset("/guides/id-watermark/")}">证件图片水印怎么写更合适？</a><a href="${asset("/guides/remove-photo-location/")}">照片定位信息怎么检查和清除？</a><a href="${asset("/guides/jpg-png-webp/")}">JPG、PNG、WebP 应该怎么选？</a><a href="${asset("/guides/photo-requirements/")}">报名照片像素、KB、比例怎么一起看？</a><a href="${asset("/guides/png-to-jpg-white-background/")}">PNG 转 JPG 为什么会变白底？</a><a href="${asset("/guides/compressed-image-blurry/")}">图片压缩后模糊怎么办？</a></div><p><a href="${asset("/guides/")}">查看全部图片处理指南 →</a></p></article></section>
${promotionBanner()}
<section class="workflow-band"><div class="workflow-band-inner"><img src="${staticAsset("/assets/img/hero-workbench.webp")}" width="1672" height="941" loading="lazy" alt="桌面上的手机、照片、色卡和裁切尺"><div><p class="eyebrow">隐私与处理方式</p><h2>图片在当前浏览器中处理</h2><p>本站代码不设置图片上传接口。所选文件由浏览器读取、处理和导出；页面访问会经过 GitHub Pages，并使用 Google Analytics 统计基础访问数据，但不会把你在工具中选择的图片、图片内容或水印文字作为统计参数发送。</p><a href="${asset("/methodology/")}">了解安全与隐私说明 <span aria-hidden="true">→</span></a></div></div></section>
<section class="section compact"><div class="evidence-strip"><div class="evidence-item"><strong>无需注册</strong><p>打开工具即可使用，不要求创建账号。</p></div><div class="evidence-item"><strong>结果先预览</strong><p>生成后查看格式、尺寸或体积，再决定是否下载。</p></div><div class="evidence-item"><strong>限制公开说明</strong><p>不把重新编码说成无损，也不承诺水印或 EXIF 清除能解决所有隐私风险。</p></div></div></section>
<section class="section compact"><article class="article"><h2>常见图片处理问题</h2><h3>怎么把图片压缩到 100KB 或 200KB？</h3><p>进入图片压缩工具，填写目标 KB 后开始处理。工具会先调整编码质量，必要时再缩小像素尺寸。</p><h3>证件或资料图片怎么加用途水印？</h3><p>进入水印工具后填写接收方、用途和日期，可设置重复铺满、透明度、角度和颜色。水印只能降低直接挪用风险，不能替代打码和访问控制。</p><h3>怎么删除照片里的定位和拍摄信息？</h3><p>EXIF 工具可以查看部分常见元数据，并通过重新编码生成不复制原 EXIF 的新文件。删除 EXIF 不等于完全匿名，画面本身仍可能暴露身份。</p></article></section>`;
await writePage("index.html", pageShell(home, "home", homeBody));

for (const tool of tools) {
  const toolMeta = {
    inspect: { title: `图片检查器 - 在线查看图片格式、KB与像素｜${config.siteName}`, description: "在线查看 JPG、PNG、WebP 图片的格式、文件大小、像素尺寸、宽高比与方向，并根据结果选择压缩、改尺寸或格式转换。图片仅在浏览器本地读取。" },
    "photo-requirements": { title: `报名照片在线调整 - 尺寸、KB、格式一次完成｜${config.siteName}`, description: "按报名、考试或资料上传平台给出的宽高像素、最大KB和图片格式，一次完成裁剪/留边、格式转换与文件大小控制。图片在浏览器本地处理。" },
    compress: { title: `图片压缩到指定KB - 在线压缩到100KB/200KB｜${config.siteName}`, description: "在线把 JPG、PNG、WebP 图片压缩到 50KB、100KB、200KB 等指定大小，可自动调整画质与像素尺寸。图片在浏览器本地处理。" },
    "batch-compress": { title: `批量图片压缩 - 多张图片批量压缩到指定KB｜${config.siteName}`, description: "在线批量压缩 JPG、PNG、WebP 图片，一次最多 10 张，可统一压到 100KB、200KB 等指定上限并逐项或 ZIP 下载。图片在浏览器本地处理。" },
    "batch-exif": { title: `批量清除图片EXIF与元数据｜${config.siteName}`, description: "在线批量重新编码 JPG、PNG、WebP 图片，一次最多 10 张，生成不复制原始 EXIF 等元数据的新副本，并支持 ZIP 下载。图片仅在浏览器本地处理。" },
    watermark: { title: `图片加水印 - 证件与资料用途水印工具｜${config.siteName}`, description: "在线给证件、资料和普通图片添加用途水印，支持重复铺满、透明度、角度、颜色和自动换行。图片在浏览器本地处理。" },
    resize: { title: `图片尺寸修改 - 在线改像素与裁剪图片｜${config.siteName}`, description: "在线修改图片宽高像素，支持按比例缩放、定位裁剪、完整适应和拉伸。图片在浏览器本地处理。" },
    convert: { title: `图片格式转换 - JPG/PNG/WebP在线互转｜${config.siteName}`, description: "在线转换 JPG、PNG、WebP 图片格式，支持透明背景处理和画质设置。图片在浏览器本地完成转换。" },
    "remove-exif": { title: `清除EXIF - 在线删除照片定位与拍摄信息｜${config.siteName}`, description: "在线查看 JPEG 中可识别的常见 EXIF 字段，并通过重新编码清理 JPG、PNG、WebP 中不随像素重新导出的元数据。图片在浏览器本地处理。" }
  }[tool.slug];
  const page = { kind: "tool", tool, path: `/${tool.slug}/`, title: toolMeta.title, ogTitle: tool.name, description: toolMeta.description };
  let body = "";
  if (tool.slug === "inspect") body = toolLayout(tool, "先检查，再处理", "如果你只知道“图片上传失败”，但不确定问题是 KB、像素、比例还是格式，可以先在这里查看当前图片的基本状态，再决定下一步。", `${dropzone("选择或拖入一张图片", "支持静态 JPG、PNG、WebP；最大 30 MB、2400 万像素")}${preview("img", "图片预览会显示在这里")}
<div class="controls"><div class="button-row"><button class="button ghost" id="reset" type="button" hidden>检查另一张</button></div></div>
<div class="status-line" id="status" role="status" aria-live="polite" hidden></div><section class="result-block inspection-report" id="inspection-report" aria-labelledby="inspection-title" hidden><h2 id="inspection-title">图片检查结果</h2><div class="result-row"><span class="result-label">格式</span><strong class="result-value" id="inspect-format"></strong></div><div class="result-row"><span class="result-label">文件大小</span><strong class="result-value" id="inspect-size"></strong></div><div class="result-row"><span class="result-label">像素尺寸</span><strong class="result-value" id="inspect-dimensions"></strong></div><div class="result-row"><span class="result-label">总像素</span><strong class="result-value" id="inspect-megapixels"></strong></div><div class="result-row"><span class="result-label">预计解码内存</span><strong class="result-value" id="inspect-memory"></strong></div><div class="result-row"><span class="result-label">宽高比</span><strong class="result-value" id="inspect-ratio"></strong></div><div class="result-row"><span class="result-label">方向</span><strong class="result-value" id="inspect-orientation"></strong></div><div class="result-row"><span class="result-label">透明像素</span><strong class="result-value" id="inspect-transparency"></strong></div><div class="result-actions"><button class="button secondary" id="copy-report" type="button">复制检查结果</button></div><h3>根据当前图片，可以继续做什么</h3><ul class="inspection-suggestions"><li id="suggest-compress" hidden>文件超过 1 MB；如果平台限制 KB/MB，可使用<a href="${asset("/compress/")}">图片压缩工具</a>。</li><li id="suggest-resize" hidden>图片长边超过 2000 像素；如果平台限制宽高，可使用<a href="${asset("/resize/")}">尺寸修改工具</a>。</li><li id="suggest-format" hidden>当前不是 JPG；如果平台只接受 JPG，可使用<a href="${asset("/convert/")}">格式转换工具</a>。</li><li id="suggest-transparency" hidden>检测到透明像素；如果需要转 JPG，请先确认透明区域应填充什么背景色，可使用<a href="${asset("/convert/")}">格式转换工具</a>。</li><li id="suggest-privacy">如果是手机拍摄的证件或资料照片，可再用<a href="${asset("/remove-exif/")}">EXIF 工具</a>检查是否带有拍摄或定位信息。</li></ul></section>`, `<article class="article"><h2>检查器能回答什么</h2><p>它会直接读取文件格式、体积、像素宽高、总像素、宽高比和横竖方向，并按 RGBA 4 字节/像素给出一个粗略的解码内存估算。这些信息通常足以判断上传失败到底更像是“文件太大”“尺寸不符”还是“格式不支持”。</p><h2>它不会替你猜平台规则</h2><p>不同报名、考试、证件或业务系统的要求并不统一。检查器不会把 295×413、100 KB 或 JPG 当成通用答案，而是先告诉你当前图片是什么，再由你对照平台要求处理。</p><h2>建议的处理顺序</h2><p>如果平台同时限制多项，通常先调整构图和像素，再转换格式，最后压缩文件体积。这样可以减少重复编码和不必要的画质损失。</p></article>${related(["compress", "resize", "convert", "remove-exif"])}${guideLinks("inspect")}${faqSection("inspect")}`, `<section><h2>本地读取</h2><p>检查器不会生成新文件，也不会把图片内容、KB、像素或比例作为 Analytics 参数发送。</p></section><section><h2>下一步</h2><p>先对照目标平台的实际要求，再选择压缩、改尺寸、转换格式或清理 EXIF。</p></section>`);
  if (tool.slug === "photo-requirements") body = toolLayout(tool, "把平台要求直接填进来", "如果提交页面已经明确写了宽度、高度、最大文件大小和格式，可以在这里一次完成尺寸、格式与体积处理。示例参数只是输入参考，不代表任何平台的统一标准。", `${dropzone("选择或拖入一张图片", "支持静态 JPG、PNG、WebP；最大 30 MB、2400 万像素")}${preview("img", "原图预览会显示在这里")}
<div class="controls"><div class="control-grid"><div class="control-group"><label for="target-width">目标宽度（px）</label><input id="target-width" type="number" min="1" max="8192" step="1" value="295"><span class="hint">直接填写平台要求的像素宽度</span></div><div class="control-group"><label for="target-height">目标高度（px）</label><input id="target-height" type="number" min="1" max="8192" step="1" value="413"><span class="hint">直接填写平台要求的像素高度</span></div><div class="control-group"><label for="target-kb">最大文件大小（KB）</label><input id="target-kb" type="number" min="5" max="10240" step="1" value="100"><span class="hint">按 1 KB = 1024 字节计算</span></div><div class="control-group"><label for="output-format">输出格式</label><select id="output-format"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></div><div class="control-group"><label for="fit-mode">构图方式</label><select id="fit-mode"><option value="cover">裁剪填满</option><option value="contain">完整适应（可能留边）</option><option value="stretch">拉伸到目标比例</option></select><span class="hint">证件/报名照片通常不建议拉伸人物比例</span></div><div class="control-group"><label for="background">JPG / 留边背景色</label><input id="background" type="color" value="#ffffff"><span class="hint">JPG 会使用此背景；PNG/WebP 完整适应时可保留透明留边</span></div><div class="control-group"><label for="focal-x">裁剪水平焦点</label><input id="focal-x" type="range" min="0" max="100" value="50"><span class="hint">仅“裁剪填满”生效；50% 为水平居中</span></div><div class="control-group"><label for="focal-y">裁剪垂直焦点</label><input id="focal-y" type="range" min="0" max="100" value="42"><span class="hint">仅“裁剪填满”生效；人物照片可略向上保留头部</span></div><div class="control-group full"><span class="control-label">示例参数（请以平台实际要求为准）</span><div class="button-row"><button class="button ghost" type="button" data-requirement-preset="295x413" data-kb="100" data-format="image/jpeg">295×413 / 100KB / JPG</button><button class="button ghost" type="button" data-requirement-preset="480x640" data-kb="200" data-format="image/jpeg">480×640 / 200KB / JPG</button></div></div></div>${actions("按要求处理")}</div>
<div class="status-line" id="status" role="status" aria-live="polite" hidden></div><section class="result-block" id="result" aria-labelledby="result-title" hidden><h2 id="result-title">处理结果</h2><div class="preview-shell"><img id="result-preview" data-blob-preview alt="按要求处理后的图片预览"></div><div class="result-row"><span class="result-label">你填写的要求</span><strong class="result-value" id="requirement-target"></strong></div><div class="result-row"><span class="result-label">实际输出</span><strong class="result-value" id="requirement-output"></strong></div><div class="result-row"><span class="result-label">宽高</span><strong class="result-value" id="requirement-dimensions"></strong></div><div class="result-row"><span class="result-label">文件大小</span><strong class="result-value" id="requirement-size"></strong></div><div class="result-row"><span class="result-label">格式</span><strong class="result-value" id="requirement-format"></strong></div><div class="result-row"><span class="result-label">综合结果</span><strong class="result-value" id="requirement-status"></strong></div><p class="notice" id="requirement-note"></p><div class="result-actions"><button class="button" id="download" type="button">下载结果</button><button class="button secondary" id="open-result" type="button">新窗口查看</button></div></section>`, `<article class="article"><h2>这和分别使用尺寸、格式、压缩工具有什么不同？</h2><p>这个页面面向已经拿到明确上传要求的用户。你只需要填写平台给出的宽高、最大 KB 和格式，工具会先按目标尺寸重新构图，再用所选格式导出，并在 JPG/WebP 下尽量寻找不超过 KB 上限的较高质量。</p><h2>为什么不自动猜“报名照标准”？</h2><p>不同考试、学校、签证、招聘和业务系统可能使用完全不同的像素、比例、背景色和文件大小要求。本站不会把某组常见数字包装成统一标准；示例按钮只是减少输入，不代表目标平台一定接受。</p><h2>“全部满足”代表什么？</h2><p>只代表输出文件满足你在本页填写的像素宽高、格式和最大 KB。平台还可能检查人脸位置、背景色、DPI、命名规则或其他业务条件，因此下载后仍应在目标平台实际上传确认。</p><h2>PNG 为什么可能无法达到很小的 KB？</h2><p>浏览器导出 PNG 时没有类似 JPG/WebP 的有损质量参数。如果平台同时强制固定宽高、PNG 格式和很小的 KB，上限可能在浏览器端无法满足；此时应该重新核对平台规则，而不是无休止降低不存在的“PNG 质量”。</p></article>${related(["inspect", "resize", "compress", "convert"])}${guideLinks("photo-requirements")}${faqSection("photo-requirements")}`, `<section><h2>按规则处理，不猜规则</h2><p>请复制目标平台的真实要求。示例参数只用于演示输入方式。</p></section><section><h2>本地完成</h2><p>原图、处理参数和结果不会作为 Analytics 参数发送；下载前可以直接检查是否达标。</p></section>`);
  if (tool.slug === "compress") body = toolLayout(tool, "文件大小", "图片压缩是通过调整编码质量、图片格式或像素尺寸来降低文件体积。输入目标 KB 后，工具先调整编码质量；仍过大时，可选择逐级缩小像素尺寸。", `${dropzone("选择或拖入一张图片", "支持静态 JPG、PNG、WebP；最大 30 MB、2400 万像素")}${preview("img", "原图预览会显示在这里")}
<div class="controls"><div class="control-grid"><div class="control-group"><label for="target-kb">目标大小（KB）</label><input id="target-kb" type="number" value="100" min="5" max="10240" step="1" inputmode="numeric"><span class="hint">按 1 KB = 1024 字节计算</span><div class="quick-values" aria-label="常用目标大小"><button type="button" class="chip-button" data-target-kb="50">50 KB</button><button type="button" class="chip-button" data-target-kb="100">100 KB</button><button type="button" class="chip-button" data-target-kb="200">200 KB</button><button type="button" class="chip-button" data-target-kb="500">500 KB</button></div></div><div class="control-group"><label for="output-format">输出格式</label><select id="output-format"><option value="image/jpeg">JPG</option><option value="image/webp">WebP</option></select></div><div class="control-group full"><div class="inline-check"><input id="allow-resize" type="checkbox" checked><label for="allow-resize">画质调整仍不够时，允许缩小像素尺寸</label></div></div></div>${actions("开始压缩")}</div>
<div class="status-line" id="status" role="status" aria-live="polite" hidden></div>${resultBlock("压缩结果", [["原文件大小", "original-size"], ["原始尺寸", "original-dimensions"], ["目标上限", "target-limit"], ["输出大小", "output-size"], ["输出尺寸", "output-dimensions"], ["是否达标", "target-status"], ["体积减少", "saving", "saving-label"]]).replace('<div class="result-actions">', `<div class="compare-block" id="compare-block" aria-labelledby="compare-title"><h3 id="compare-title">原图与压缩结果对比</h3><p class="hint">拖动滑块查看同一位置的细节变化。对比仅在当前浏览器中完成。</p><div class="compare-stage"><img id="compare-original" alt="原图对比"><div class="compare-output" id="compare-output-wrap"><img id="compare-output" alt="压缩结果对比"></div><span class="compare-label compare-label-left">原图</span><span class="compare-label compare-label-right">压缩后</span><span class="compare-divider" id="compare-divider" aria-hidden="true"></span></div><label class="compare-control" for="compare-range">对比位置 <input id="compare-range" type="range" min="0" max="100" value="50" aria-label="调整原图与压缩结果对比位置"></label></div><div class="result-actions">`)}`, `<article class="article"><h2>怎样压缩到指定 KB</h2><p>本工具把你输入的 KB 按 1024 字节换算。以 100 KB 为例，目标值是 102400 字节。处理时会先在较高和较低画质之间反复试算，寻找尽量清晰且不超过目标的结果；如果仍然过大，并且你允许调整尺寸，才会逐步缩小像素。</p><ol><li>先按上传平台要求填写目标大小。</li><li>如果平台同时规定宽高，建议先用<a href="${asset("/resize/")}">图片尺寸修改工具</a>把像素调整到要求，再压缩 KB。</li><li>导出前放大检查人脸、文字、二维码和证件边缘，不要只看“文件大小达标”。</li></ol><h2>为什么同样像素的图片，体积差很多</h2><p>纯色海报和简单截图通常比较容易压小；树叶、头发、夜景噪点、密集文字等细节很多的图片，需要编码器保留更多变化，因此即使宽高相同，文件大小也可能相差明显。</p><h2>透明背景如何处理</h2><p>输出 JPG 时透明区域会填充为白色；输出 WebP 时保留浏览器能够编码的透明区域。动画 PNG 和动画 WebP 不会被静默压成单帧，而是直接提示不支持。</p><h2>为什么可能达不到目标</h2><p>工具设置了画质和尺寸下限，不会为了几 KB 把图片压到难以辨认。如果平台给的是“100 KB 以内”而不是“必须正好 100 KB”，只要结果不超过限制且内容清晰，就没有必要继续追求更小。</p></article>${related(["batch-compress", "resize", "convert", "remove-exif"])}${guideLinks("compress")}${faqSection("compress")}`, `<section><h2>本地处理</h2><p>本站代码不主动上传图片。处理期间浏览器会在内存中保存解码结果。</p></section><section><h2>建议顺序</h2><ul><li>先改像素尺寸</li><li>再选择所需格式</li><li>最后压缩到体积上限</li></ul></section>`);
  if (tool.slug === "batch-compress") body = toolLayout(tool, "多张一起处理", "当多张图片需要满足同一个文件大小上限时，可以一次选择最多 10 张，由浏览器按顺序逐张压缩。这样比每张重复选择参数更省操作，也能避免同时解码多张大图占用过多内存。", `<div class="dropzone" id="batch-dropzone"><div><strong>选择或拖入多张图片</strong><p>支持静态 JPG、PNG、WebP；最多 10 张，总大小不超过 80 MB</p><button class="button secondary" type="button" id="batch-trigger">选择多张图片</button><input id="batch-input" type="file" multiple tabindex="-1" accept="image/jpeg,image/png,image/webp" aria-label="选择多张图片文件"></div></div><p class="file-summary" id="batch-summary" aria-live="polite"></p><ul class="batch-file-list" id="batch-file-list"></ul>
<div class="controls"><div class="control-grid"><div class="control-group"><label for="target-kb">每张目标上限（KB）</label><input id="target-kb" type="number" value="200" min="5" max="10240" step="1" inputmode="numeric"><span class="hint">按 1 KB = 1024 字节计算</span><div class="quick-values" aria-label="常用目标大小"><button type="button" class="chip-button" data-target-kb="100">100 KB</button><button type="button" class="chip-button" data-target-kb="200">200 KB</button><button type="button" class="chip-button" data-target-kb="500">500 KB</button><button type="button" class="chip-button" data-target-kb="1024">1 MB</button></div></div><div class="control-group"><label for="output-format">统一输出格式</label><select id="output-format"><option value="image/jpeg">JPG</option><option value="image/webp">WebP</option></select></div><div class="control-group full"><div class="inline-check"><input id="allow-resize" type="checkbox" checked><label for="allow-resize">画质调整仍不够时，允许逐张缩小像素尺寸</label></div></div></div>${actions("开始批量压缩").replace('</div>', '<button class="button ghost" id="cancel" type="button" hidden>停止处理</button></div>')}</div>
<div class="batch-progress" id="batch-progress-wrap" hidden><label for="batch-progress">处理进度 <span id="batch-progress-text" aria-live="polite">0 / 0</span></label><progress id="batch-progress" value="0" max="1"></progress></div>
<div class="status-line" id="status" role="status" aria-live="polite" hidden></div><section class="result-block batch-results" id="batch-results" aria-labelledby="batch-results-title" hidden><h2 id="batch-results-title">批量压缩结果</h2><p class="hint">结果只保存在当前页面内存中。请逐项检查是否达到目标并下载；刷新或关闭页面后不会保留。</p><div class="batch-result-list" id="batch-result-list"></div><div class="result-actions"><button class="button" id="download-all" type="button" hidden>下载全部 ZIP</button><button class="button secondary" id="retry-failed" type="button" hidden>重试失败项</button></div></section>`, `<article class="article"><h2>什么时候适合批量压缩</h2><p>如果一组活动照片、商品图或报名材料都要满足同一个文件大小上限，批量处理可以省去重复设置参数。每张图片仍会独立编码，实际输出大小不会完全相同。</p><h2>为什么按顺序逐张处理</h2><p>大尺寸图片解码后会占用远高于文件本身的内存。当前版本一次最多选择 10 张、总大小不超过 80 MB，并逐张解码、压缩和释放原图，优先保证手机和普通电脑浏览器稳定。</p><h2>结果为什么要逐项下载</h2><p>批量任务里可能有少数图片因为纹理复杂而仍高于目标。逐项展示可以让你先确认“是否达标”和输出尺寸，再决定下载哪些结果；下载全部 ZIP 也在浏览器内存中完成，不依赖第三方打包库；结果不会持久缓存到浏览器。</p><h2>画质检查仍然不能省</h2><p>批量设置只代表目标一致，不代表每张图都适合同一画质。证件文字、二维码、截图和复杂照片对压缩的敏感程度不同。关键图片建议再用<a href="${asset("/compress/")}">单张压缩工具</a>查看原图/结果对比。</p></article>${related(["compress", "resize", "convert", "inspect"])}${guideLinks("batch-compress")}${faqSection("batch-compress")}`, `<section><h2>本地顺序处理</h2><p>多张图片不会上传服务器，也不会同时全部解码到画布。处理结果只保存在当前页面内存。</p></section><section><h2>批量上限</h2><p>一次最多 10 张、总文件大小不超过 80 MB；单张仍遵守 30 MB 与 2400 万像素限制。</p></section>`);
  if (tool.slug === "batch-exif") body = toolLayout(tool, "多张一起重新编码", "当你需要分享或提交一组图片，并希望减少原始 EXIF、XMP、ICC、DPI 等元数据随文件继续传播的机会时，可以批量生成新的像素副本。它不是匿名化工具，仍要检查画面本身是否包含敏感信息。", `<div class="dropzone" id="batch-dropzone"><div><strong>选择或拖入多张图片</strong><p>支持静态 JPG、PNG、WebP；最多 10 张，总大小不超过 80 MB</p><button class="button secondary" type="button" id="batch-trigger">选择多张图片</button><input id="batch-input" type="file" multiple tabindex="-1" accept="image/jpeg,image/png,image/webp" aria-label="选择多张图片文件"></div></div><p class="file-summary" id="batch-summary" aria-live="polite"></p><ul class="batch-file-list" id="batch-file-list"></ul>
<div class="control-grid"><label class="control-group"><span>输出格式</span><select id="output-format"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label><label class="control-group"><span>JPG / WebP 质量 <output id="quality-value">92%</output></span><input id="quality" type="range" min="40" max="100" value="92"></label></div>
<div class="button-row"><button class="button" id="run" type="button" disabled>批量清除元数据</button><button class="button ghost" id="cancel" type="button" hidden>停止处理</button><button class="button secondary" id="reset" type="button" hidden>重置</button></div><div class="batch-progress" id="batch-progress-wrap" hidden><label for="batch-progress">处理进度 <span id="batch-progress-text" aria-live="polite">0 / 0</span></label><progress id="batch-progress" value="0" max="1"></progress></div><div class="status-line" id="status" role="status" aria-live="polite" hidden></div><section class="result-block batch-results" id="batch-results" aria-labelledby="batch-results-title" hidden><h2 id="batch-results-title">批量清理结果</h2><p class="hint">这里的“清除”指重新绘制可见像素后导出新文件，不代表画面匿名，也不承诺消除所有可能的格式信息。</p><div class="batch-result-list" id="batch-result-list"></div><div class="result-actions"><button class="button" id="download-all" type="button" hidden>下载全部 ZIP</button><button class="button secondary" id="retry-failed" type="button" hidden>重试失败项</button></div></section>`, `<article class="article"><h2>批量清理实际做了什么</h2><p>浏览器会逐张解码图片，把可见像素绘制到新的 Canvas，再按你选择的格式导出。这个过程通常不会把原文件里的 EXIF、XMP、ICC、DPI、相机型号或 GPS 字段原样复制到新文件。</p><h2>为什么不能说“完全匿名”</h2><p>门牌、人脸、工牌、文件编号、屏幕内容和拍摄环境仍然直接存在于像素中；此外浏览器编码器也可能写入格式所需的信息。重要资料应在下载后重新检查，不要只依赖“清元数据”。</p><h2>为什么逐张处理</h2><p>一次最多 10 张、总大小不超过 80 MB，工具按顺序解码和释放，避免多张高分辨率照片同时占用大量内存。成功结果可以逐项下载，也可以在浏览器中打包成 ZIP。</p><h2>单张需要先看具体 EXIF 怎么办</h2><p>如果你需要先确认 JPEG 是否包含 GPS、设备型号或拍摄时间，可使用<a href="${asset("/remove-exif/")}">EXIF 查看与清除</a>逐张查看，再决定是否批量处理。</p></article>${related(["remove-exif", "inspect", "batch-compress", "watermark"])}${guideLinks("batch-exif")}${faqSection("batch-exif")}`, `<section><h2>本地处理</h2><p>图片和 ZIP 都只在当前浏览器中生成，不会上传服务器或写入离线缓存。</p></section><section><h2>输出提醒</h2><p>重新编码可能改变文件大小、色彩配置和细节。请保留原文件并检查导出结果。</p></section>`);
  if (tool.slug === "watermark") body = toolLayout(tool, "资料分享", "图片水印是在画面上叠加可见文字，用于标注接收方、用途和日期。水印可以增加直接挪用的成本，但不能替代打码或访问控制。", `${dropzone("选择或拖入一张资料图片", "请先确认接收方确有必要获取这份资料")}${preview("canvas", "水印预览会显示在这里")}
<div class="controls"><fieldset class="template-builder"><legend>快速生成用途水印（可选）</legend><div class="control-grid"><div class="control-group"><label for="template-recipient">接收方</label><input id="template-recipient" maxlength="24" autocomplete="off" placeholder="例如：XX 平台"></div><div class="control-group"><label for="template-purpose">用途</label><select id="template-purpose"><option value="账户核验">账户核验</option><option value="实名认证">实名认证</option><option value="入职材料审核">入职材料审核</option><option value="资料审核">资料审核</option></select></div><div class="control-group"><label for="template-date">日期</label><input id="template-date" type="date"></div><div class="control-group template-action"><button class="button secondary" type="button" id="build-watermark">填入水印文字</button></div></div><p class="hint">生成后仍可自由修改。敏感字段若非必要提供，应优先直接打码，而不是只依赖水印。</p></fieldset><div class="control-grid"><div class="control-group full"><label for="watermark-text">水印文字</label><input id="watermark-text" value="仅供资料审核使用" maxlength="80" autocomplete="off"><span class="hint">文字过长时自动缩小并换行，最多三行</span></div><div class="control-group"><label for="font-size">字号 <span id="font-size-value">48</span></label><input id="font-size" type="range" min="18" max="120" value="48"></div><div class="control-group"><label for="opacity">透明度 <span id="opacity-value">38%</span></label><input id="opacity" type="range" min="10" max="90" value="38"></div><div class="control-group"><label for="angle">旋转角度 <span id="angle-value">-25°</span></label><input id="angle" type="range" min="-60" max="60" value="-25"></div><div class="control-group"><label for="color">文字颜色</label><input id="color" type="color" value="#b3261e"></div><div class="control-group"><label for="output-format">输出格式</label><select id="output-format"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></div><div class="control-group"><div class="inline-check"><input id="repeat" type="checkbox" checked><label for="repeat">重复铺满</label></div></div></div>${actions("生成水印图片")}</div>
<div class="status-line" id="status" role="status" aria-live="polite" hidden></div>${resultBlock("导出结果", [["文件大小", "output-size"], ["输出尺寸", "output-dimensions"]])}`, `<article class="article"><h2>资料水印建议怎么写</h2><p>优先写“接收方 + 具体用途 + 日期”，例如“仅供 XX 平台账户核验使用｜YYYY-MM-DD”。这样比“仅供资料审核”更容易说明这张图片为什么被提供，也不用在静态页面里写一个很快过期的固定日期。</p><p>如果准备分享手机拍摄的证件或资料，可以先用<a href="${asset("/remove-exif/")}">EXIF 查看与清除工具</a>检查是否带有拍摄设备、时间或 GPS 信息，再决定是否需要生成清理后的副本。</p><h2>水印不能解决什么</h2><p>可见水印仍可能被裁剪、覆盖或修复。证件号、住址、人脸等不必要信息应另外打码；确需提交时，也应确认接收方身份和保存期限。</p><h2>导出前检查</h2><ul><li>文字完整，没有超出画布。</li><li>必要信息仍然可读，但水印覆盖范围足够。</li><li>JPG 的透明区域会以白色合成，PNG 和 WebP 可保留透明区域。</li></ul></article>${related(["remove-exif", "compress", "resize", "convert"])}${guideLinks("watermark")}${faqSection("watermark")}`, `<section><h2>隐私边界</h2><p>图片和水印文字在当前浏览器中处理。页面使用 Google Analytics 统计基础访问数据，但不会把图片内容、水印文字或导出文件作为统计参数发送。</p></section><section><h2>重要提醒</h2><p>水印只能降低直接挪用风险，不能保证阻止滥用。</p></section>`);
  if (tool.slug === "resize") body = toolLayout(tool, "像素与比例", "图片尺寸修改是调整图片的像素宽度和高度。设置目标宽高后，可选择完整适应、定位裁剪或拉伸；预览使用小画布，下载时才按目标尺寸生成。", `${dropzone("选择或拖入一张图片", "支持静态 JPG、PNG、WebP")}${preview("canvas", "尺寸预览会显示在这里")}
<div class="controls"><div class="control-grid"><div class="control-group"><label for="width">宽度（px）</label><input id="width" type="number" min="1" max="8192" value="800"></div><div class="control-group"><label for="height">高度（px）</label><input id="height" type="number" min="1" max="8192" value="600"></div><div class="control-group"><div class="inline-check"><input id="lock-ratio" type="checkbox" checked><label for="lock-ratio">锁定原图比例</label></div></div><div class="control-group"><label for="fit-mode">适应方式</label><select id="fit-mode"><option value="contain">完整适应</option><option value="cover">定位裁剪</option><option value="stretch">拉伸</option></select><span class="hint" id="fit-mode-hint">保留完整画面；比例不同时会留边。</span></div><div class="control-group full" id="crop-controls" hidden><div class="control-grid"><div class="control-group"><label for="focal-x">水平焦点</label><input id="focal-x" type="range" min="0" max="100" value="50"><span class="hint">向左或向右移动裁剪区域</span></div><div class="control-group"><label for="focal-y">垂直焦点</label><input id="focal-y" type="range" min="0" max="100" value="50"><span class="hint">向上或向下移动裁剪区域</span></div></div></div><div class="control-group"><label for="background">留边背景</label><input id="background" type="color" value="#ffffff"></div><div class="control-group"><label for="output-format">输出格式</label><select id="output-format"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></div><div class="control-group"><div class="inline-check"><input id="transparent-background" type="checkbox"><label for="transparent-background">PNG/WebP 使用透明留边</label></div></div><div class="control-group"><label for="quality">画质 <span id="quality-value">90%</span></label><input id="quality" type="range" min="30" max="100" value="90"></div><div class="control-group full"><span class="control-label">常用预设</span><div class="button-row"><button class="button secondary" type="button" data-preset="295x413">常见一寸照 295×413</button><button class="button secondary" type="button" data-preset="300x300">方形 300×300</button><button class="button secondary" type="button" data-preset="800x800">方形 800×800</button><button class="button secondary" type="button" data-preset="1920x1080">16:9 1920×1080</button></div><span class="hint">证件照尺寸并非所有平台统一，请以实际提交页面要求为准。</span></div></div>${actions("生成新尺寸图片")}</div>
<div class="status-line" id="status" role="status" aria-live="polite" hidden></div>${resultBlock("处理结果", [["输出尺寸", "output-dimensions"], ["文件大小", "output-size"]])}`, `<article class="article"><h2>三种适应方式</h2><table><thead><tr><th>方式</th><th>结果</th><th>适合场景</th></tr></thead><tbody><tr><td>完整适应</td><td>保留整张图，比例不同时留边</td><td>商品图、资料截图</td></tr><tr><td>定位裁剪</td><td>保持比例并填满，可调整裁剪焦点</td><td>头像、封面、报名照片</td></tr><tr><td>拉伸</td><td>不裁剪但可能改变比例</td><td>只在系统明确要求时使用</td></tr></tbody></table><h2>放大不会恢复细节</h2><p>增加像素只是插值，不能生成原图中不存在的纹理。报名系统同时限制像素和 KB 时，先完成尺寸处理，再使用压缩工具。</p><h2>画布限制</h2><p>单边最多 8192 像素、总计最多 2400 万像素，极端宽高比会被拒绝。不同移动浏览器的实际内存上限仍可能更低。</p></article>${related(["compress", "convert", "watermark", "remove-exif"])}${guideLinks("resize")}${faqSection("resize")}`, `<section><h2>透明留边</h2><p>JPG 不支持透明；PNG 和 WebP 可选择透明或指定背景色。</p></section><section><h2>裁剪检查</h2><p>定位裁剪后请检查人脸、文字和二维码是否完整。</p></section>`);
  if (tool.slug === "convert") body = toolLayout(tool, "文件格式", "图片格式转换是在保持画面内容的前提下，用另一种编码格式生成新文件。这里可在 JPG、PNG 和 WebP 之间转换，相同格式不会重复编码。", `${dropzone("选择或拖入一张图片", "动画图片不会被静默转换成单帧")}${preview("img", "原图预览会显示在这里")}
<div class="controls"><div class="control-grid"><div class="control-group"><label for="output-format">目标格式</label><select id="output-format"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></div><div class="control-group"><label for="quality">画质 <span id="quality-value">90%</span></label><input id="quality" type="range" min="20" max="100" value="90"><span class="hint">PNG 为无损编码，此设置不生效</span></div><div class="control-group"><label for="background">JPG 透明区域背景</label><input id="background" type="color" value="#ffffff"><span class="hint">仅输出 JPG 时生效</span></div></div>${actions("开始转换")}</div>
<div class="status-line" id="status" role="status" aria-live="polite" hidden></div>${resultBlock("转换结果", [["源格式", "original-format"], ["输出格式", "output-format-name"], ["输出尺寸", "output-dimensions"], ["文件大小", "output-size"]])}`, `<article class="article"><h2>JPG、PNG、WebP 怎么选</h2><table><thead><tr><th>格式</th><th>特点</th><th>常见用途</th></tr></thead><tbody><tr><td>JPG</td><td>照片体积较小，不支持透明</td><td>报名材料、照片</td></tr><tr><td>PNG</td><td>无损，支持透明，体积可能较大</td><td>截图、图标、透明素材</td></tr><tr><td>WebP</td><td>支持透明，网页使用通常更省体积</td><td>网站图片</td></tr></tbody></table><h2>转换会改变什么</h2><p>浏览器会重新编码像素，原始 EXIF、ICC 色彩配置、DPI、XMP 和版权字段通常不会原样保留；Canvas 导出的 DPI 也不应当作印刷尺寸依据。</p><h2>格式转换和压缩不是一回事</h2><p>转换格式解决的是“平台要 JPG/PNG/WebP 哪一种”的问题，不保证文件一定变小。如果你的目标只是把图片压到 100KB、200KB 等上限，应直接使用<a href="${asset("/compress/")}">图片压缩工具</a>。</p><h2>动画和同格式输入</h2><p>动画 PNG 与动画 WebP 会直接提示不支持。源格式与目标格式相同时，工具不会无意义地再次编码；如需减小体积，请使用压缩工具。</p></article>${related(["compress", "resize", "remove-exif", "watermark"])}${guideLinks("convert")}${faqSection("convert")}`, `<section><h2>透明区域</h2><p>输出 WebP 或 PNG 时保留透明通道；输出 JPG 时使用所选背景色。</p></section><section><h2>色彩提醒</h2><p>重新编码可能改变广色域、ICC 配置和印刷 DPI。</p></section>`);
  if (tool.slug === "remove-exif") body = toolLayout(tool, "照片隐私", "EXIF 是照片中常见的一类元数据，可包含拍摄设备、时间、曝光参数和可能存在的 GPS 信息。当前查看器会解析 JPEG 中可识别的常见 EXIF 字段；清理时则通过重新编码像素生成不复制原元数据的新文件。", `${dropzone("选择或拖入一张照片", "GPS 坐标不会自动展开；最大 30 MB")}${preview("img", "照片预览会显示在这里")}
<section id="metadata" aria-labelledby="metadata-title" hidden><h2 id="metadata-title">检测到的信息</h2><table class="meta-table"><tbody id="meta-body"></tbody></table></section>
<div class="controls"><div class="control-grid"><div class="control-group"><label for="output-format">输出格式</label><select id="output-format"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></div><div class="control-group"><label for="quality">画质 <span id="quality-value">92%</span></label><input id="quality" type="range" min="30" max="100" value="92"></div></div>${actions("清除并生成副本")}</div>
<div class="status-line" id="status" role="status" aria-live="polite" hidden></div>${resultBlock("清除结果", [["新文件大小", "output-size"], ["输出格式", "output-format-name"], ["结果检查", "verification"]])}`, `<article class="article"><h2>照片信息可能包括什么</h2><p>EXIF 并不等于“定位信息”，它是一组可能随照片保存的元数据。不同设备和编辑软件写入的字段不一样，照片也不一定包含 GPS。</p><table><thead><tr><th>常见信息</th><th>可能看到的内容</th><th>需要注意什么</th></tr></thead><tbody><tr><td>拍摄时间</td><td>DateTimeOriginal 等</td><td>可能暴露活动时间</td></tr><tr><td>设备信息</td><td>手机/相机品牌、型号、镜头</td><td>可能暴露使用设备</td></tr><tr><td>GPS</td><td>经纬度、方向等</td><td>存在时可能暴露拍摄位置</td></tr><tr><td>曝光参数</td><td>ISO、快门、光圈</td><td>通常隐私风险较低</td></tr></tbody></table><p>本工具只展示有限的常见字段。精确 GPS 坐标默认隐藏，只有主动点击后才显示。</p><h2>清除方法与验证</h2><p>工具把可见像素绘制到新画布，再由浏览器编码。JPG 输出会重新检查是否仍存在 EXIF APP1 段；PNG 和 WebP 输出说明为“没有复制原元数据”，不声称进行了完整取证级分析。</p><h2>清除 EXIF 不等于匿名</h2><p>画面中的人脸、门牌、文件编号和环境特征仍可能暴露身份。隐写数据、专有元数据和平台再次写入的信息也不在完整保证范围内。</p></article>${related(["watermark", "compress", "resize", "convert"])}${guideLinks("remove-exif")}${faqSection("remove-exif")}`, `<section><h2>读取范围</h2><p>只读取 JPEG APP1 段内的有限常见标签，并限制字段长度和目录数量。</p></section><section><h2>使用边界</h2><p>不要把输出作为取证材料，也不要删除唯一的原文件。</p></section>`);
  await writePage(`${tool.slug}/index.html`, pageShell(page, tool.slug, body, ["image-core.js", tool.script]));
}

const guidesHub = { kind: "collection", path: "/guides/", h1: "图片处理指南", title: `图片处理指南 - 压缩、尺寸、水印、格式与EXIF｜${config.siteName}`, description: "图片处理实用指南：解释KB与像素、上传文件过大、证件水印、照片定位信息以及JPG/PNG/WebP格式选择。" };
await writePage("guides/index.html", pageShell(guidesHub, "guides", `<section class="page-head"><div class="page-head-inner"><p class="eyebrow">使用指南</p><h1>图片处理指南</h1><p>按实际问题找答案：上传失败、画质、格式与隐私分别处理，不需要从一长排文章里猜。</p></div></section><section class="section"><div class="article"><h2>上传与报名照片</h2><div class="related-links"><a href="${asset("/guides/photo-requirements/")}">怎么看懂报名照片的像素、KB、比例和格式要求</a><a href="${asset("/guides/photo-upload-too-large/")}">照片上传提示“文件过大”怎么办</a><a href="${asset("/guides/image-kb-pixels/")}">KB、像素、分辨率有什么区别</a></div><h2>画质与压缩</h2><div class="related-links"><a href="${asset("/guides/compressed-image-blurry/")}">图片压缩后模糊怎么办</a></div><h2>图片格式</h2><div class="related-links"><a href="${asset("/guides/jpg-png-webp/")}">JPG、PNG、WebP 怎么选</a><a href="${asset("/guides/png-to-jpg-white-background/")}">PNG 透明背景转 JPG 为什么变白底</a></div><h2>隐私与资料分享</h2><div class="related-links"><a href="${asset("/guides/id-watermark/")}">证件图片水印怎么写</a><a href="${asset("/guides/remove-photo-location/")}">照片定位信息怎么检查和清除</a></div></div></section>`));

const guideKbPixels = { kind: "article", path: "/guides/image-kb-pixels/", h1: "图片 KB、像素、分辨率有什么区别？", title: `图片KB、像素、分辨率有什么区别？怎么按要求改图片 - ${config.siteName}`, description: "解释图片文件大小KB、像素宽高和分辨率的区别，以及上传平台同时限制像素和文件大小时应该先改什么。" };
await writePage("guides/image-kb-pixels/index.html", pageShell(guideKbPixels, "", `<section class="page-head"><div class="page-head-inner"><nav class="breadcrumbs" aria-label="面包屑"><a href="${asset("/")}">全部工具</a> / <a href="${asset("/guides/")}">使用指南</a> / <span aria-current="page">图片 KB、像素与分辨率</span></nav><p class="eyebrow">图片基础</p><h1>${guideKbPixels.h1}</h1><p>“100 KB”“800×600 像素”和“300 DPI”说的是不同事情。把它们混在一起，是图片上传反复失败最常见的原因之一。</p></div></section><section class="section"><article class="article"><h2>先看结论：KB 管文件体积，像素管画面尺寸</h2><table><thead><tr><th>指标</th><th>它表示什么</th><th>什么时候最重要</th></tr></thead><tbody><tr><td>KB / MB</td><td>文件占多少存储空间</td><td>平台限制“文件不超过 100KB/2MB”</td></tr><tr><td>像素</td><td>图片宽和高，例如 800×600</td><td>报名照、头像、封面要求固定宽高</td></tr><tr><td>宽高比</td><td>宽度与高度的比例</td><td>需要 1:1、4:3、16:9 等构图</td></tr><tr><td>DPI / PPI</td><td>像素与物理尺寸之间的密度描述</td><td>印刷场景更常见；普通网页上传通常更看像素和 KB</td></tr></tbody></table><h2>100 KB 对应多少像素？没有固定答案</h2><p>同样是 1000×1000 像素，纯色图、截图和夜景照片的文件大小可以差很多。格式、画面细节、噪点和压缩质量都会影响体积，所以不能把“100 KB”换算成一个固定像素尺寸。</p><p>如果平台只要求“100 KB 以内”，直接使用<a href="${asset("/compress/")}">图片压缩到指定 KB</a>即可。如果平台同时要求“295×413 像素且不超过 100 KB”，先完成尺寸，再压文件大小。</p><h2>同时限制像素和 KB 时，顺序怎么选</h2><ol><li>先确认目标宽高、比例和允许的格式。</li><li>用<a href="${asset("/resize/")}">图片尺寸修改与裁剪</a>完成像素要求。</li><li>需要 JPG/PNG/WebP 指定格式时，再用<a href="${asset("/convert/")}">格式转换工具</a>。</li><li>最后用压缩工具把文件控制到平台上限以内。</li></ol><p>这样做的原因很简单：如果先压到很低的画质，再去裁剪或放大，后一步还要重新编码，容易把已经损失的细节再次处理。</p><h2>DPI 为什么经常让人困惑</h2><p>一张 1000×1000 像素的图片，即使文件里写着不同 DPI，屏幕显示时仍然是同一组像素。DPI 更常用于描述打印时这些像素应该铺在多大的物理尺寸上。普通网页、报名系统或头像上传如果明确给了“像素”和“KB”，优先按页面写明的这两个要求处理，不要仅凭 DPI 推测尺寸。</p><h2>一个实用判断</h2><p>看到“文件太大”先看 KB；看到“尺寸不符合”先看像素；看到“格式不支持”再处理 JPG、PNG 或 WebP。三个问题分别解决，通常比来回试参数快得多。</p></article></section>`));

const guideUpload = { kind: "article", path: "/guides/photo-upload-too-large/", h1: "照片上传提示“文件过大”怎么办？", title: `照片上传提示文件过大怎么办？图片压缩与尺寸处理顺序 - ${config.siteName}`, description: "照片或报名图片上传提示文件过大时，判断是KB超限、像素不符还是格式不支持，并按正确顺序处理。" };
await writePage("guides/photo-upload-too-large/index.html", pageShell(guideUpload, "", `<section class="page-head"><div class="page-head-inner"><nav class="breadcrumbs" aria-label="面包屑"><a href="${asset("/")}">全部工具</a> / <a href="${asset("/guides/")}">使用指南</a> / <span aria-current="page">照片上传文件过大</span></nav><p class="eyebrow">上传排错</p><h1>${guideUpload.h1}</h1><p>先看报错到底限制了文件大小、像素还是格式。三种限制看起来很像，但处理方法不同。</p></div></section><section class="section"><article class="article"><h2>只提示“文件不能超过 100KB / 200KB”</h2><p>这种情况优先处理文件体积，不必先随意修改像素。打开<a href="${asset("/compress/")}">图片压缩工具</a>，输入平台给出的 KB 上限，导出后再确认文字、人脸和二维码仍然清楚。如果多张图片都要满足同一个上限，可改用<a href="${asset("/batch-compress/")}">批量图片压缩</a>，统一参数后逐项检查结果。</p><h2>同时要求固定宽高和文件大小</h2><p>先改尺寸，再压 KB。例如页面同时要求 300×400 像素、不超过 200 KB，先把图片裁剪或留边到 300×400，再压缩到 200 KB 以内。反过来操作，尺寸修改时还会再次编码，可能让文件大小重新变化。</p><h2>提示“尺寸过大”不是同一件事</h2><p>“尺寸过大”通常指像素宽高，例如照片是 4000×3000，而平台只接受较小尺寸。这时应该用<a href="${asset("/resize/")}">尺寸修改工具</a>。如果报错写的是“文件过大”“超过 2 MB”，才主要看 KB/MB。</p><h2>平台不接受 WebP、PNG 或 JPG</h2><p>如果文件大小和尺寸都符合，但上传仍提示格式不支持，检查文件扩展名和平台允许的格式。需要转换时可用<a href="${asset("/convert/")}">JPG/PNG/WebP 格式转换</a>。注意：格式转换不等于压缩，转成另一种格式后文件可能变大也可能变小。</p><h2>为什么压到目标大小后看起来变糊</h2><p>如果原图非常大，而目标文件又很小，编码器只能通过降低画质或减少像素来换取体积。对于证件、报名材料和带文字的截图，先把像素调整到平台真正需要的尺寸，通常比把一张超大原图直接压到几十 KB 更容易保住可读性。</p><h2>上传前最后检查</h2><ul><li>文件大小是否不超过平台上限。</li><li>像素宽高和比例是否符合要求。</li><li>格式是否是平台允许的 JPG、PNG 或其他格式。</li><li>人脸、文字、二维码和证件边缘是否清楚完整。</li></ul></article></section>`));

const guideWatermark = { kind: "article", path: "/guides/id-watermark/", h1: "证件图片水印怎么写更合适？", title: `证件图片水印怎么写？用途水印示例与注意事项 - ${config.siteName}`, description: "证件和资料图片水印的实用写法：如何组合接收方、用途和日期，什么时候应该打码，以及平铺水印和单个水印怎么选。" };
await writePage("guides/id-watermark/index.html", pageShell(guideWatermark, "guides", `<section class="page-head"><div class="page-head-inner"><nav class="breadcrumbs" aria-label="面包屑"><a href="${asset("/")}">全部工具</a> / <a href="${asset("/guides/")}">使用指南</a> / <span aria-current="page">证件图片水印</span></nav><p class="eyebrow">资料分享</p><h1>${guideWatermark.h1}</h1><p>水印的作用不是“让图片绝对安全”，而是把接收方和用途写清楚，降低图片被直接挪作其他用途的便利程度。</p></div></section><section class="section"><article class="article"><h2>最实用的写法：接收方 + 具体用途 + 日期</h2><p>比起只写“仅供审核”，更建议写清楚谁接收、为什么使用、什么时候提供。对比起来更容易判断：</p><table><thead><tr><th>写法</th><th>问题 / 优点</th></tr></thead><tbody><tr><td>仅供使用</td><td>接收方和用途都不清楚，离开原聊天记录后几乎没有上下文</td></tr><tr><td>仅供 XX 平台账户核验使用｜YYYY-MM-DD</td><td>接收方、用途和时间都明确，更容易识别图片原本的提交场景</td></tr><tr><td>禁止盗用，他用无效</td><td>语气很强，但不能自动形成技术访问控制</td></tr></tbody></table><p>日期应按你真正提交资料的当天填写，不需要为了“像正式文件”写一个固定日期。</p><h2>水印不要写得太绝对</h2><p>“他用无效”“禁止任何复制”之类文字并不能自动产生技术上的访问控制。更有用的是把用途写具体，让图片离开原场景后仍然能看出它原本为什么被提供。</p><h2>哪些信息应该直接打码</h2><p>如果接收方并不需要看到某些字段，例如部分证件号码、住址或其他非必要信息，直接遮盖往往比只加水印更有效。水印是用途标识，不是打码的替代品。</p><h2>平铺水印还是单个水印</h2><table><thead><tr><th>方式</th><th>优点</th><th>适合场景</th></tr></thead><tbody><tr><td>重复平铺</td><td>覆盖面积大，直接裁掉更困难</td><td>证件、证明材料、包含多处敏感区域的图片</td></tr><tr><td>单个水印</td><td>画面更干净</td><td>普通资料、截图、只需要轻量标识的图片</td></tr></tbody></table><h2>发送前还要检查什么</h2><ul><li>确认接收方身份和提交页面是否可信。</li><li>只提供完成业务真正需要的信息。</li><li>手机拍摄的照片可先检查是否带有 EXIF/GPS 元数据。</li><li>导出后放大查看，确保水印没有遮住必须识别的文字、人脸或二维码。</li></ul><p><a href="${asset("/watermark/")}">打开图片加水印工具</a>；如需检查照片元数据，可先使用<a href="${asset("/remove-exif/")}">EXIF 查看与清除工具</a>。</p></article></section>`));

const guideLocation = { kind: "article", path: "/guides/remove-photo-location/", h1: "照片定位信息怎么检查和清除？", title: `照片定位信息怎么删除？EXIF与GPS检查方法 - ${config.siteName}`, description: "解释照片EXIF和GPS定位信息从哪里来、为什么不是每张照片都有GPS，以及分享前如何检查并清除常见元数据。" };
await writePage("guides/remove-photo-location/index.html", pageShell(guideLocation, "guides", `<section class="page-head"><div class="page-head-inner"><nav class="breadcrumbs" aria-label="面包屑"><a href="${asset("/")}">全部工具</a> / <a href="${asset("/guides/")}">使用指南</a> / <span aria-current="page">照片定位信息</span></nav><p class="eyebrow">照片隐私</p><h1>${guideLocation.h1}</h1><p>照片可能在 EXIF 元数据里保存拍摄时间、设备信息，部分照片还可能包含 GPS 坐标。是否存在这些字段取决于设备、权限、相机设置和后续编辑过程。</p></div></section><section class="section"><article class="article"><h2>不是每张照片都有 GPS</h2><p>相机或手机只有在拍摄时获得定位权限、并把坐标写入照片时，才可能出现 GPS 字段。截图、经过部分社交平台处理的图片、关闭定位权限后拍摄的照片，都可能没有 GPS。</p><h2>EXIF 里常见的是什么</h2><table><thead><tr><th>字段类型</th><th>可能包含的信息</th><th>注意点</th></tr></thead><tbody><tr><td>拍摄时间</td><td>照片创建或拍摄时间</td><td>可能暴露活动时间</td></tr><tr><td>设备信息</td><td>相机/手机厂商、型号</td><td>可能暴露设备类型</td></tr><tr><td>GPS</td><td>经纬度等定位字段</td><td>可能暴露拍摄位置</td></tr><tr><td>方向</td><td>图片旋转方向</td><td>通常主要影响显示</td></tr></tbody></table><h2>分享前怎么处理</h2><ol><li>先检查照片是否确实存在需要清除的元数据。</li><li>生成去除常见 EXIF 的新副本，不覆盖唯一原图。</li><li>重新打开输出文件，确认画面和方向正常。</li><li>再检查画面本身是否包含门牌、地址、文件编号等可识别信息。</li></ol><p>本站的<a href="${asset("/remove-exif/")}">EXIF 查看与清除工具</a>会读取有限的常见 JPEG EXIF 标签，并通过重新编码生成新文件。多张图片只需要减少原始元数据传播时，可使用<a href="${asset("/batch-exif/")}">批量清除图片元数据</a>。这些工具都不是取证级元数据分析器。</p><h2>删除 EXIF 不等于匿名</h2><p>即使文件里不再有常见 EXIF，画面中的人脸、门牌、屏幕内容、文件编号、地标和环境细节仍可能暴露身份或地点。对于敏感资料，还应判断是否需要打码或减少分享范围。</p></article></section>`));

const guideFormats = { kind: "article", path: "/guides/jpg-png-webp/", h1: "JPG、PNG、WebP 应该怎么选？", title: `JPG、PNG、WebP有什么区别？图片格式选择指南 - ${config.siteName}`, description: "比较JPG、PNG、WebP在照片、截图、透明背景和文件大小上的差异，帮助判断上传、分享和网页图片该选哪种格式。" };
await writePage("guides/jpg-png-webp/index.html", pageShell(guideFormats, "guides", `<section class="page-head"><div class="page-head-inner"><nav class="breadcrumbs" aria-label="面包屑"><a href="${asset("/")}">全部工具</a> / <a href="${asset("/guides/")}">使用指南</a> / <span aria-current="page">JPG、PNG、WebP</span></nav><p class="eyebrow">格式选择</p><h1>${guideFormats.h1}</h1><p>没有一种格式在所有场景都最好。照片、截图、透明背景和上传平台兼容性，关注点并不相同。</p></div></section><section class="section"><article class="article"><h2>先用这张表快速判断</h2><table><thead><tr><th>格式</th><th>透明背景</th><th>典型优势</th><th>常见用途</th></tr></thead><tbody><tr><td>JPG</td><td>不支持</td><td>照片压缩效率高、兼容性广</td><td>照片、报名图、普通上传图片</td></tr><tr><td>PNG</td><td>支持</td><td>无损、文字和锐利边缘稳定</td><td>截图、图标、透明素材</td></tr><tr><td>WebP</td><td>支持</td><td>通常能兼顾较小体积和较好画质</td><td>网页图片、现代平台上传</td></tr></tbody></table><h2>照片优先考虑 JPG 或 WebP</h2><p>真实照片包含大量颜色和纹理，JPG 和 WebP 的有损压缩通常更容易把文件体积降下来。若目标平台只明确接受 JPG，直接按平台要求使用 JPG，不必为了“更先进”强行改成 WebP。</p><h2>截图和透明图更适合 PNG</h2><p>带文字、界面线条、图标或透明背景的图片通常更适合 PNG。把透明 PNG 转为 JPG 时，透明区域必须与某个背景颜色合成，因此不能继续保持透明。</p><h2>格式转换不等于压缩</h2><p>把 PNG 改成 JPG 可能明显变小，也可能因为画面特点和参数不同出现其他结果。格式只是影响文件体积的因素之一；像素尺寸、画面复杂度和编码质量同样重要。</p><h2>上传平台明确格式时，以平台要求为准</h2><p>如果报名系统写“仅支持 JPG/JPEG”，即使 WebP 文件更小也没有意义。先满足平台格式，再处理像素和文件大小，通常更省时间。</p><p>需要实际转换时可使用<a href="${asset("/convert/")}">JPG/PNG/WebP 格式转换工具</a>；如果目标只是降低 KB，使用<a href="${asset("/compress/")}">图片压缩工具</a>更直接。</p></article></section>`));

const guideRequirements = { kind: "article", path: "/guides/photo-requirements/", h1: "报名照片要求里的像素、KB、比例怎么一起看？", title: `报名照片像素、KB、比例怎么设置？上传要求解读 - ${config.siteName}`, description: "教你看懂报名照片中的像素、比例、文件大小和格式要求，并按正确顺序处理，减少反复压缩和上传失败。" };
await writePage("guides/photo-requirements/index.html", pageShell(guideRequirements, "guides", `<section class="page-head"><div class="page-head-inner"><nav class="breadcrumbs" aria-label="面包屑"><a href="${asset("/")}">全部工具</a> / <a href="${asset("/guides/")}">使用指南</a> / <span aria-current="page">报名照片要求</span></nav><p class="eyebrow">上传要求</p><h1>${guideRequirements.h1}</h1><p>“295×413 像素、JPG、100KB 以内”其实是三类不同要求：画面尺寸、文件格式和文件体积。把它们混在一起处理，最容易出现反复修改仍然上传失败。</p></div></section><section class="section"><article class="article"><h2>先把要求拆成四项</h2><table><thead><tr><th>平台写法</th><th>它限制的是什么</th><th>对应处理</th></tr></thead><tbody><tr><td>295×413 px</td><td>像素宽高</td><td><a href="${asset("/resize/")}">修改尺寸</a></td></tr><tr><td>宽高比 / 证件照比例</td><td>画面构图</td><td>裁剪或完整适应</td></tr><tr><td>JPG/JPEG</td><td>文件编码格式</td><td><a href="${asset("/convert/")}">转换格式</a></td></tr><tr><td>100 KB 以内</td><td>文件体积</td><td><a href="${asset("/compress/")}">压缩 KB</a></td></tr></tbody></table><h2>通常按“尺寸 → 格式 → KB”处理</h2><p>如果平台同时限制多项，先确定构图和宽高，再转换成要求的格式，最后控制文件体积。这样能减少后续步骤再次改变文件大小或画质。如果平台已经明确写出这些要求，也可以直接使用<a href="${asset("/photo-requirements/")}">按上传要求处理图片</a>一次完成。</p><h2>不要把“像素”和“KB”当成一回事</h2><p>同样是 295×413 像素，纯色背景证件照和细节复杂的照片，文件大小仍然可能不同。像素决定画面的采样尺寸，KB/MB 是编码后的文件体积，两者相关但不是固定换算关系。</p><h2>“一寸照”不是统一的数字答案</h2><p>不同报名、考试或证件系统可能给出不同像素、比例、背景色和文件大小限制。看到本站的常用预设时，应把它当作快捷输入，而不是替代具体平台要求。</p><h2>上传前做最后检查</h2><ul><li>文件扩展名和实际格式一致。</li><li>宽高没有写反，人物没有被裁掉。</li><li>文件大小符合“以内”或具体上下限。</li><li>放大查看眼睛、文字、边缘是否还能清晰辨认。</li></ul><p>如果你还分不清 KB、像素和 DPI，可以先看<a href="${asset("/guides/image-kb-pixels/")}">KB、像素、分辨率有什么区别</a>。</p></article></section>`));

const guideTransparent = { kind: "article", path: "/guides/png-to-jpg-white-background/", h1: "PNG 透明背景转 JPG，为什么会变成白底？", title: `PNG转JPG为什么变白底？透明背景与JPG格式说明 - ${config.siteName}`, description: "解释PNG透明背景转成JPG时为什么必须出现背景色，如何选择白底或其他背景，以及什么时候应继续使用PNG或WebP。" };
await writePage("guides/png-to-jpg-white-background/index.html", pageShell(guideTransparent, "guides", `<section class="page-head"><div class="page-head-inner"><nav class="breadcrumbs" aria-label="面包屑"><a href="${asset("/")}">全部工具</a> / <a href="${asset("/guides/")}">使用指南</a> / <span aria-current="page">PNG 转 JPG</span></nav><p class="eyebrow">透明背景</p><h1>${guideTransparent.h1}</h1><p>原因不是“转换失败”，而是 JPG 本身没有透明通道。原本透明的像素在导出 JPG 前必须先与一个实际颜色合成。</p></div></section><section class="section"><article class="article"><h2>透明不是白色</h2><p>PNG 和 WebP 可以记录“这个像素是透明的”，JPG 只能记录实际颜色。因此透明 PNG 转 JPG 时，程序必须决定透明区域最终显示成白色、黑色或其他背景色。</p><h2>半透明边缘为什么最容易看出变化</h2><p>Logo、抠图人物和图标边缘常常不是“完全透明 / 完全不透明”两种状态，而是包含半透明抗锯齿像素。转成 JPG 时，这些像素会先与所选背景色混合，所以同一个透明 PNG 合成白底和深色底时，边缘观感可能不同。导出后应重点检查细线、头发和文字边缘。</p><h2>什么时候用白底</h2><p>报名照片、商品图或普通文档系统如果明确要求 JPG，白色通常是最安全的中性背景选择。但如果平台规定蓝底、红底或其他颜色，应按平台要求处理，不能默认白底。</p><h2>想保留透明，就不要转成 JPG</h2><p>图标、Logo、抠图素材等需要透明边缘时，继续使用 PNG，或在目标平台支持的情况下使用 WebP。把它们转成 JPG 后，透明信息无法保留。</p><h2>转换时还会发生什么</h2><p>浏览器重新编码可能不保留原始 EXIF、ICC、DPI、XMP 等元数据。格式转换主要解决兼容性问题，并不保证文件一定更小。</p><p>需要实际转换时，可以使用<a href="${asset("/convert/")}">JPG/PNG/WebP 格式转换工具</a>并选择透明区域的背景颜色。</p></article></section>`));

const guideBlur = { kind: "article", path: "/guides/compressed-image-blurry/", h1: "图片压缩后变模糊，应该怎么处理？", title: `图片压缩后模糊怎么办？画质、像素与重复压缩排查 - ${config.siteName}`, description: "图片压缩后模糊时，判断是编码质量太低、像素被缩小还是重复压缩造成，并给出更清晰的处理顺序。" };
await writePage("guides/compressed-image-blurry/index.html", pageShell(guideBlur, "guides", `<section class="page-head"><div class="page-head-inner"><nav class="breadcrumbs" aria-label="面包屑"><a href="${asset("/")}">全部工具</a> / <a href="${asset("/guides/")}">使用指南</a> / <span aria-current="page">压缩后模糊</span></nav><p class="eyebrow">画质排查</p><h1>${guideBlur.h1}</h1><p>压缩后“糊”不只有一个原因。最常见的是编码质量太低、像素尺寸被缩小，或者图片已经经历了多次有损重新编码。</p></div></section><section class="section"><article class="article"><h2>先判断是哪一种模糊</h2><table><thead><tr><th>现象</th><th>常见原因</th><th>处理方向</th></tr></thead><tbody><tr><td>文字边缘出现方块或脏边</td><td>有损质量过低</td><td>提高质量，必要时接受更大文件</td></tr><tr><td>整张图细节明显变少</td><td>像素尺寸被缩小</td><td>保留更大的宽高</td></tr><tr><td>每次编辑都更糊</td><td>反复有损编码</td><td>回到原图重新处理</td></tr></tbody></table><h2>平台只限制 KB 时，不要先主动缩小像素</h2><p>如果没有宽高要求，先只调编码质量通常能保留更多细节。只有质量已经降到不合适、文件仍然超限时，再考虑逐步缩小尺寸。</p><h2>平台同时限制像素和 KB 时，先定尺寸</h2><p>先把宽高调整到平台要求，再只做一次最终压缩。反过来先压缩、再缩放、再压缩，会增加重复编码。</p><h2>用两次导出来判断该牺牲什么</h2><p>如果平台只限制文件大小，可以先做两个结果对比：一个保留原像素、降低编码质量；另一个适度缩小像素、保留更高编码质量。不要只看 KB，重点比较人脸、文字、二维码和细线。不同照片最合适的方案不同，这种对比比盯着单一“质量百分比”更可靠。</p><h2>从原图重新做，比继续救已压缩文件更有效</h2><p>有损压缩丢掉的细节不能通过再次提高“质量百分比”恢复。手头如果还有原始照片，应从原图重新设置尺寸和压缩参数。</p><h2>对文字和二维码要更谨慎</h2><p>证件文字、表格、二维码和细线对压缩伪影更敏感。导出后最好按实际大小和放大两种方式检查，而不是只确认文件体积达标。</p><p>需要重新处理时，可回到<a href="${asset("/compress/")}">图片压缩到指定 KB</a>，并先取消“允许缩小像素尺寸”观察结果。</p></article></section>`));

const methodology = { kind: "page", path: "/methodology/", title: `图片本地处理与安全说明 - ${config.siteName}`, description: "了解图安工具为什么可以在浏览器本地处理图片、支持哪些格式、有哪些安全与隐私边界，以及哪些情况不适合使用。" };
await writePage("methodology/index.html", pageShell(methodology, "methodology", `<section class="page-head"><div class="page-head-inner"><p class="eyebrow">安全与隐私</p><h1>图片本地处理与安全说明</h1><p>这里说明图片如何在浏览器中处理、哪些数据不会由本站代码主动上传，以及使用工具时需要注意的边界。</p></div></section><section class="section"><article class="article"><h2>为什么图片可以不上传服务器？</h2><p>现代浏览器可以直接读取用户主动选择的本地文件，并通过 Canvas、Blob 和浏览器自带的图片编码能力完成预览、修改和导出。本站工具利用这些浏览器能力处理图片，不设置图片上传接口。</p><h2>离线能力会缓存什么？</h2><p>支持 Service Worker 的浏览器在成功访问后，会缓存本站核心页面、CSS、JavaScript 和图标，用于网络不稳定时继续打开工具。离线缓存不包含你选择的本地图片、Canvas 内容、Blob 处理结果或 Google Analytics 请求；浏览器仍可按自身策略清理缓存。</p><h2>页面访问是否完全不产生网络数据？</h2><p>不是。打开网页需要从 GitHub Pages 加载 HTML、CSS、JavaScript 和图片资源；本站还使用 Google Analytics 4 统计基础页面访问情况。GitHub 和 Google 可能处理 IP 地址、访问时间、浏览器或设备信息、访问路径、来源页面及粗略地理位置等技术数据。这里所说的“本地处理”是指你在工具中选择的源图片、图片内容、水印文字和处理结果不会被本站代码作为统计数据主动上传。</p><h2>Google Analytics 会统计什么？</h2><p>本站使用 Google Analytics 4 了解页面访问量、来源、设备类型和页面使用情况，以帮助改进工具和内容。工具页还会记录“选择文件、开始处理、处理成功、下载结果”等动作以及对应工具名称，用于判断功能是否真正被使用。本站不会主动把文件名、图片尺寸内容、图片像素、EXIF 内容、GPS 坐标、水印文字、导出参数或下载后的文件作为 Analytics 事件参数发送。</p><h2>支持哪些图片？</h2><p>当前主要支持静态 JPG、PNG 和 WebP。动画 PNG、动画 WebP、GIF 以及多帧照片格式不在处理范围内。单边最大 8192 像素，总像素上限 2400 万，实际可用上限还会受设备内存和浏览器限制影响。</p><h2>重新编码会改变什么？</h2><p>压缩、格式转换、尺寸修改和 EXIF 清除都可能触发浏览器重新编码。原始 EXIF、ICC 色彩配置、DPI、XMP、版权字段和部分专有元数据不保证原样保留；颜色和细节也可能出现轻微变化。</p><h2>水印和 EXIF 清除能提供什么保护？</h2><p>可见水印可以帮助标注用途并降低图片被直接挪用的风险，但不能保证阻止裁剪、覆盖或修复。清除常见 EXIF 可以减少一部分元数据暴露，但不能消除人脸、门牌、文件编号、环境特征或其他可识别信息。</p><h2>使用前建议</h2><ul><li>保留原文件，不要把处理结果作为唯一副本。</li><li>下载后重新打开，检查文字、人脸、二维码和关键边缘。</li><li>处理证件或隐私资料时，只向确有必要的接收方提供必要信息。</li><li>对取证、医疗、印刷色彩或严格合规场景，不要把浏览器工具当作专业软件的替代品。</li></ul><h2>技术参考</h2><p>本站对浏览器图片导出和格式能力的说明可对照 MDN 的 <a href="https://developer.mozilla.org/zh-CN/docs/Web/API/HTMLCanvasElement/toBlob">HTMLCanvasElement.toBlob()</a> 与 <a href="https://developer.mozilla.org/zh-CN/docs/Web/Media/Guides/Formats/Image_types">图像文件类型与格式指南</a>。浏览器实现和格式支持会随版本变化，实际能力仍以用户当前浏览器为准。</p></article></section>`));

const about = { kind: "page", path: "/about/", title: `关于${config.siteName} - 浏览器本地图片工具`, description: `${config.siteName}是一个开源的浏览器端图片处理项目，提供图片压缩、水印、尺寸修改、格式转换和 EXIF 清除工具。` };
await writePage("about/index.html", pageShell(about, "about", `<section class="page-head"><div class="page-head-inner"><p class="eyebrow">关于本站</p><h1>简单、透明的浏览器图片工具</h1><p>${escapeHtml(config.siteName)}是一个开源的浏览器端图片处理项目，专注于无需注册、尽量不上传源图片即可完成的常见图片任务。</p></div></section><section class="section"><article class="article"><h2>项目信息</h2><table><tbody><tr><th>项目名称</th><td>${escapeHtml(config.siteName)}</td></tr><tr><th>当前版本</th><td>${escapeHtml(config.currentVersion)}</td></tr><tr><th>首次公开</th><td>${escapeHtml(config.projectStarted)}</td></tr><tr><th>主要维护主体</th><td>${escapeHtml(config.operatorName)}</td></tr><tr><th>源代码</th><td><a href="${escapeHtml(config.repositoryUrl)}" rel="nofollow">GitHub 代码仓库</a></td></tr><tr><th>问题反馈</th><td><a href="${escapeHtml(config.contactUrl)}" rel="nofollow">公开反馈渠道</a></td></tr></tbody></table><p>版本号、变更记录和主要处理逻辑都随公开仓库维护。涉及证件或私人照片的问题，请只描述现象，不要把原始敏感文件上传到 Issue。</p><h2>我们提供什么</h2><p>目前提供按上传要求一站式处理、图片检查、单张与批量压缩、证件与资料图片加水印、图片尺寸修改与裁剪、JPG/PNG/WebP 格式转换、单张 EXIF 查看与清除，以及批量元数据清理。工具优先保持操作简单，并明确说明画质、元数据和隐私边界。</p><h2>为什么采用浏览器本地处理</h2><p>很多图片任务并不需要把源文件发送到服务器。利用浏览器的文件读取、Canvas 和 Blob 能力，可以在当前设备完成大部分处理，同时减少敏感图片在网络上传输的必要性。</p><h2>我们的处理原则</h2><ul><li>本站代码不设置图片上传接口。</li><li>不要求注册账号后才能使用核心工具。</li><li>不把重新编码描述成无损，也不把水印或 EXIF 清除描述成绝对保护。</li><li>对文件格式、尺寸、动画图片和元数据处理范围明确说明限制。</li></ul><h2>开源与反馈</h2><p>站点源代码和变更记录发布在<a href="${escapeHtml(config.repositoryUrl)}" rel="nofollow">GitHub 代码仓库</a>，用户可以检查主要图片处理逻辑。发现损坏文件、兼容性或文案问题，可通过<a href="${escapeHtml(config.contactUrl)}" rel="nofollow">公开反馈渠道</a>联系维护者。请勿在反馈中上传证件、私人照片或其他敏感文件。</p></article></section>`));

const friends = { kind: "page", path: "/friends/", title: `友情链接 - ${config.siteName}`, description: "图安工具的友情链接页面。", noindex: true, follow: true };
await writePage("friends/index.html", pageShell(friends, "", `<section class="page-head"><div class="page-head-inner"><p class="eyebrow">友情链接</p><h1>友情链接</h1><p>这里集中列出与本站有友情链接关系的网站。外部网站的内容、可用性和隐私规则由其各自运营者负责。</p></div></section><section class="section"><article class="article"><ul><li><a href="https://ciyuan-toolbox.pages.dev/" target="_blank" rel="noopener noreferrer">次元工具箱</a></li><li><a href="https://agoodvpn.github.io/vpn-guide/" target="_blank" rel="noopener noreferrer">VPN指南</a></li><li><a href="https://jigen-pocket.proud-2531.chatgpt.site/" target="_blank" rel="noopener noreferrer">次元口袋</a></li></ul><p><a href="${asset("/")}">返回图安工具</a></p></article></section>`));

const privacy = { kind: "page", path: "/privacy/", title: `隐私政策 - ${config.siteName}`, description: `${config.siteName}隐私政策，说明本地图片处理、浏览器临时状态、GitHub Pages托管和第三方服务边界。` };
await writePage("privacy/index.html", pageShell(privacy, "privacy", `<section class="page-head"><div class="page-head-inner"><p class="eyebrow">隐私政策</p><h1>图片由浏览器处理</h1><p>更新日期：${config.lastModified}。本政策描述当前发布版本的实际行为。</p></div></section><section class="section"><article class="article"><h2>本站处理哪些数据</h2><p>用户主动选择的图片、文件名、水印文字和输出参数由页面脚本在当前浏览器中读取。本站代码没有图片上传接口，不会主动把这些内容发送到本站或第三方服务器。</p><h2>离线缓存</h2><p>支持 Service Worker 的浏览器可能缓存本站自己的公开 HTML、CSS、JavaScript 和图标，以便网络不稳定时继续打开已访问过的核心工具。该缓存不包含用户选择的图片、图片处理结果、Canvas 像素或 Blob 临时地址，也不会缓存 Google Analytics 等第三方请求。用户可通过浏览器站点数据设置清除这些缓存。</p><h2>浏览器临时状态</h2><p>处理时，浏览器内存会保存解码图片、Canvas 和 Blob 临时地址。页面刷新或关闭后通常会释放；浏览器的前进后退缓存可能在当前会话内短暂保留页面状态。下载后的文件由用户自行管理。</p><h2>托管与访问日志</h2><p>本站使用 GitHub Pages 托管。浏览器访问页面时会连接 GitHub 的基础设施，GitHub 可能处理 IP 地址、请求时间、浏览器信息和访问路径。具体处理方式和保留期限由<a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement" rel="nofollow">GitHub 隐私声明</a>说明。本站会根据实际使用的服务和适用要求维护本政策，不把“图片没有上传”与“页面访问完全不产生网络数据”混为一谈。</p><h2>统计服务</h2><p>本站使用 Google Analytics 4 了解页面访问量、来源、设备类型和基础页面使用情况，以改进工具和内容。工具页会额外记录选择文件、开始处理、处理成功和下载结果等动作，并只附带对应工具名称；这些事件用于判断功能是否被真实使用。Google Analytics 可能向 Google 发送页面地址、来源页面、浏览器和设备信息、IP 地址衍生的粗略地理位置以及相关技术标识。本站不会主动把用户选择的图片、图片内容、文件名、图片尺寸、EXIF 内容、GPS 坐标、水印文字、输出参数或导出文件作为 Analytics 参数发送。</p><p>Google 对相关数据的处理受其隐私政策和服务条款约束。你可以通过浏览器隐私设置、内容拦截工具或 Google 提供的退出机制限制相关统计。若适用法律要求额外同意机制，本站将根据实际运营地区和访问者范围进行调整。</p><h2>Cookie、统计、推广与友情链接</h2><p>本站首页展示一条标明“推广”的虎跃加速网站链接，友情链接集中放在单独的友情链接页面。横幅由本站自己的 HTML 和 CSS 绘制，不加载对方图片、脚本或 iframe，也不会把你选择的图片、文件名、水印文字或处理结果发送给推广网站。只有在你主动点击后，浏览器才会打开外部网站；离开本站后的数据处理以对方网站的隐私说明为准。</p><p>Google Analytics 可能根据浏览器、地区和 Google 的当前实现使用 Cookie 或其他技术标识；本站不会利用统计数据建立用户画像，也不会把图片处理内容与统计标识关联。</p><h2>联系我们</h2><p>隐私问题可通过<a href="${escapeHtml(config.contactUrl)}" rel="nofollow">本站反馈渠道</a>联系${escapeHtml(config.operatorName)}。请不要发送原始证件或私人照片。</p></article></section>`));

const terms = { kind: "page", path: "/terms/", title: `使用条款与免责声明 - ${config.siteName}`, description: `${config.siteName}的使用范围、用户责任、图片处理限制和服务可用性说明。` };
await writePage("terms/index.html", pageShell(terms, "terms", `<section class="page-head"><div class="page-head-inner"><p class="eyebrow">使用条款</p><h1>先核对结果，再决定使用</h1><p>更新日期：${config.lastModified}。使用本站即表示理解以下功能边界。</p></div></section><section class="section"><article class="article"><h2>工具用途</h2><p>本站提供通用图片处理功能，结果由用户检查后自行决定是否使用。本站不保证输出一定满足报名平台、印刷、取证或特定合规要求。</p><h2>用户责任</h2><p>用户应确保有权处理所选择的图片，不得利用本站侵犯隐私、著作权或其他合法权益。处理证件和敏感资料时，应确认接收方身份、必要性和保存期限。</p><h2>安全边界</h2><p>可见水印不能阻止所有滥用；删除常见 EXIF 不代表完全匿名；图片放大不能恢复原本不存在的细节；重新编码也可能改变色彩配置、DPI 和元数据。</p><h2>推广链接</h2><p>首页标有“推广”的横幅会打开第三方网站。该链接不代表本站对第三方服务的速度、可用性、价格或适用性作出保证；是否访问、下载或使用由用户自行判断，并应先查看对方的条款和隐私说明。</p><h2>服务可用性</h2><p>浏览器格式支持、设备内存和下载策略不同，处理可能失败。请保留原文件，下载后重新打开并检查。本站可能修复问题、调整限制或停止某项功能。</p><h2>禁止用途</h2><p>不得使用本站处理无权持有的敏感材料、规避平台审核、伪造证明或实施其他违法行为。</p><h2>联系</h2><p>条款或功能问题可通过<a href="${escapeHtml(config.contactUrl)}" rel="nofollow">反馈渠道</a>联系${escapeHtml(config.operatorName)}。</p></article></section>`));

const notFound = { kind: "page", path: "/404.html", title: `页面不存在 - ${config.siteName}`, description: "请求的页面不存在。", noindex: true };
await writePage("404.html", pageShell(notFound, "", `<section class="page-head"><div class="page-head-inner"><p class="eyebrow">404</p><h1>这个页面不存在</h1><p>地址可能输入有误，也可能已经调整。可以先回到图片检查器确认当前文件，再选择对应工具。</p><div class="button-row"><a class="button" href="${asset("/inspect/")}">先检查图片</a><a class="button secondary" href="${asset("/")}">返回全部工具</a></div></div></section><section class="section compact"><div class="task-grid"><a href="${asset("/compress/")}"><strong>文件太大</strong><span>压缩到指定 KB</span></a><a href="${asset("/resize/")}"><strong>尺寸不符合</strong><span>修改像素或裁剪</span></a><a href="${asset("/convert/")}"><strong>格式不支持</strong><span>转换 JPG / PNG / WebP</span></a><a href="${asset("/remove-exif/")}"><strong>担心照片隐私</strong><span>查看并清除常见 EXIF</span></a></div></section>`));


const manifest = {
  name: config.siteName,
  short_name: config.shortName,
  description: "浏览器本地按上传要求处理图片，并提供检查、单张与批量压缩、水印、尺寸、格式转换、EXIF 查看与批量元数据清理工具。",
  lang: "zh-CN",
  id: `${basePath || ""}/`,
  start_url: `${basePath || ""}/`,
  scope: `${basePath || ""}/`,
  display: "standalone",
  background_color: "#f7f5ef",
  theme_color: "#f7f5ef",
  shortcuts: [
    { name: "按上传要求处理", short_name: "按要求处理", url: `${basePath || ""}/photo-requirements/` },
    { name: "检查图片", short_name: "检查", url: `${basePath || ""}/inspect/` },
    { name: "压缩到指定 KB", short_name: "压缩", url: `${basePath || ""}/compress/` },
    { name: "批量压缩", short_name: "批量压缩", url: `${basePath || ""}/batch-compress/` },
    { name: "EXIF 查看与清除", short_name: "清 EXIF", url: `${basePath || ""}/remove-exif/` }
  ],
  icons: [
    { src: `${basePath || ""}/assets/img/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: `${basePath || ""}/assets/img/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" }
  ]
};
await writeFile(resolve(root, "manifest.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");

const offlineUrls = [
  `${basePath || ""}/`,
  `${basePath || ""}/photo-requirements/`,
  `${basePath || ""}/inspect/`,
  `${basePath || ""}/compress/`,
  `${basePath || ""}/batch-compress/`,
  `${basePath || ""}/batch-exif/`,
  `${basePath || ""}/watermark/`,
  `${basePath || ""}/resize/`,
  `${basePath || ""}/convert/`,
  `${basePath || ""}/remove-exif/`,
  `${basePath || ""}/guides/`,
  `${basePath || ""}/methodology/`,
  `${basePath || ""}/404.html`,
  `${basePath || ""}/manifest.webmanifest`,
  `${basePath || ""}/assets/css/styles.css`,
  `${basePath || ""}/assets/js/image-core.js`,
  `${basePath || ""}/assets/js/site.js`,
  `${basePath || ""}/assets/js/requirements.js`,
  `${basePath || ""}/assets/js/inspect.js`,
  `${basePath || ""}/assets/js/compress.js`,
  `${basePath || ""}/assets/js/batch-compress.js`,
  `${basePath || ""}/assets/js/batch-exif.js`,
  `${basePath || ""}/assets/js/watermark.js`,
  `${basePath || ""}/assets/js/resize.js`,
  `${basePath || ""}/assets/js/convert.js`,
  `${basePath || ""}/assets/js/exif.js`,
  `${basePath || ""}/assets/img/favicon.png`,
  `${basePath || ""}/assets/img/apple-touch-icon.png`,
  `${basePath || ""}/assets/img/hero-workbench.webp`,
  `${basePath || ""}/assets/img/icon-192.png`,
  `${basePath || ""}/assets/img/icon-512.png`
];
const serviceWorker = `"use strict";
const CACHE_NAME = "tuan-tools-${assetVersion}";
const OFFLINE_URLS = ${JSON.stringify(offlineUrls)};
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS)));
});
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("tuan-tools-") && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match(${JSON.stringify((basePath || "") + "/")}))));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  })));
});
`;
await writeFile(resolve(root, "service-worker.js"), serviceWorker);
generatedFiles.push("manifest.webmanifest", "service-worker.js");

const urls = Object.keys(config.pageLastModified);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((path) => `  <url><loc>${absolute(path)}</loc><lastmod>${config.pageLastModified[path]}</lastmod></url>`).join("\n")}\n</urlset>\n`;
await writeFile(resolve(root, "sitemap.xml"), sitemap);
await writeFile(resolve(root, "robots.txt"), noindex ? "User-agent: *\nDisallow: /\n" : `User-agent: *\nAllow: /\n\nUser-agent: OAI-SearchBot\nAllow: /\n\nSitemap: ${absolute("/sitemap.xml")}\n`);
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
