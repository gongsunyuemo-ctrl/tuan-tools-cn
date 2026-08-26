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
  { slug: "compress", name: "图片压缩到指定 KB", short: "压缩图片", description: "在线把 JPG、PNG、WebP 图片压缩到 50KB、100KB、200KB 等指定大小，可按需调整画质与像素尺寸。", script: "compress.js", category: "MultimediaApplication" },
  { slug: "watermark", name: "图片加水印（证件与资料）", short: "添加水印", description: "在线给证件、资料和普通图片添加用途水印，支持重复铺满、透明度、角度、颜色和自动换行。", script: "watermark.js", category: "SecurityApplication" },
  { slug: "resize", name: "图片尺寸修改与裁剪", short: "修改尺寸", description: "在线修改图片宽高像素，支持按比例缩放、定位裁剪、完整适应和常用尺寸预设。", script: "resize.js", category: "MultimediaApplication" },
  { slug: "convert", name: "图片格式转换（JPG/PNG/WebP）", short: "转换格式", description: "在线转换 JPG、PNG、WebP 图片格式，支持透明背景处理和画质设置。", script: "convert.js", category: "MultimediaApplication" },
  { slug: "remove-exif", name: "EXIF 查看与清除", short: "清除 EXIF", description: "在线查看并清除照片中的常见 EXIF 信息，包括拍摄设备、时间和可能存在的 GPS 元数据。", script: "exif.js", category: "SecurityApplication" }
];

const faqByTool = {
  compress: [
    ["图片怎么压缩到 100KB 或 200KB？", "选择图片后，把目标大小填写为 100 或 200 KB，再开始压缩。工具会先调整编码质量；如果仍高于目标且允许调整尺寸，会逐步缩小像素尺寸。"],
    ["图片压缩后会变模糊吗？", "有损压缩和缩小像素尺寸都可能降低细节。建议下载前查看预览，并重点检查人脸、文字、二维码和证件边缘是否仍清晰。"],
    ["为什么有时无法压缩到指定 KB？", "图片纹理、噪点、文字边缘和原始尺寸都会影响体积。工具设置了画质和尺寸下限，因此不会为了达到任意 KB 数值而生成难以辨认的图片。"],
    ["JPG 和 WebP 哪个更适合压缩？", "照片类图片通常适合 JPG 或 WebP。WebP 在很多场景下体积更小，但是否可用取决于接收平台是否支持；报名系统明确要求 JPG 时应选择 JPG。"],
    ["图片会上传到服务器吗？", "不会由本站代码主动上传。所选图片在当前浏览器中读取、处理和导出；页面托管服务仍可能记录普通访问日志。"]
  ],
  watermark: [
    ["证件水印应该写什么？", "建议写清接收方、具体用途和日期，例如“仅供某平台账户核验使用｜2026-08-26”。不要把水印写成绝对法律承诺。"],
    ["水印能防止证件被盗用吗？", "不能保证。可见水印可以提高图片被直接挪用的成本，但仍可能被裁剪、覆盖或修复；不必要的证件号、住址等信息仍应另外打码。"],
    ["为什么水印文字会自动换行或缩小？", "工具会根据图片尺寸和水印区域检查文字是否能完整显示，过长时会换行并缩小字号，避免文字超出画布。"],
    ["重复铺满和单个水印怎么选？", "重复铺满更适合需要明显标注用途的资料图片；单个水印更适合只需轻量标记的普通图片。无论哪种方式，都应避免遮挡必要信息。"],
    ["图片会上传到服务器吗？", "不会由本站代码主动上传。水印文字和图片在当前浏览器中处理，生成结果后再由你自行下载。"]
  ],
  resize: [
    ["怎么修改图片像素尺寸？", "输入目标宽度和高度后选择处理方式。需要保留完整画面可用“完整适应”，需要填满固定尺寸可用“定位裁剪”，只有明确要求时才建议使用“拉伸”。"],
    ["修改尺寸会让图片变清晰吗？", "不会。把小图片放大只能通过插值增加像素，不能恢复原图中不存在的真实细节。"],
    ["定位裁剪会裁掉哪些区域？", "工具会按目标比例填满画布，并根据水平和垂直焦点决定保留区域。导出前应检查人脸、文字、二维码和证件边缘是否完整。"],
    ["报名系统同时限制像素和 KB 怎么办？", "通常先把图片调整到要求的像素尺寸，再使用压缩工具控制文件大小，这样更容易得到稳定结果。"],
    ["图片会上传到服务器吗？", "不会由本站代码主动上传。尺寸处理在当前浏览器的 Canvas 中完成。"]
  ],
  convert: [
    ["JPG、PNG、WebP 有什么区别？", "JPG 适合照片且体积通常较小，但不支持透明；PNG 支持透明和无损编码，体积可能较大；WebP 支持透明，在网页场景中通常更省体积。"],
    ["PNG 转 JPG 后透明背景会怎样？", "JPG 不支持透明。输出 JPG 时，透明区域会使用你选择的背景色进行合成。"],
    ["格式转换会改变图片尺寸吗？", "默认保持原像素尺寸，只重新编码格式。如果还需要修改宽高，请先使用尺寸工具。"],
    ["格式转换会保留 EXIF 和 DPI 吗？", "不保证。浏览器重新编码通常不会原样保留 EXIF、ICC、DPI、XMP 和版权字段，因此重要元数据应另行备份。"],
    ["图片会上传到服务器吗？", "不会由本站代码主动上传。格式转换在当前浏览器中完成。"]
  ],
  "remove-exif": [
    ["EXIF 是什么？", "EXIF 是照片文件中常见的一类元数据，可记录拍摄设备、时间、方向、曝光参数，以及在部分照片中可能存在的 GPS 位置信息。"],
    ["照片 EXIF 里一定有 GPS 吗？", "不一定。是否包含 GPS 取决于拍摄设备、系统权限、相机设置以及后续编辑或分享过程。"],
    ["清除 EXIF 会降低照片质量吗？", "该工具通过浏览器重新编码生成新文件，因此可能产生轻微画质或色彩差异。它不是对原文件元数据区域做无损就地删除。"],
    ["删除 EXIF 后就完全匿名了吗？", "不是。人脸、门牌、文件编号、环境特征、隐写数据或平台重新写入的信息仍可能暴露身份或来源。"],
    ["图片会上传到服务器吗？", "不会由本站代码主动上传。EXIF 读取和重新编码都在当前浏览器中完成。"]
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
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": organizationId,
    name: config.siteName,
    url: absolute("/"),
    sameAs: [config.repositoryUrl]
  };

  if (page.kind === "home") {
    items.push(organization);
    items.push({ "@context": "https://schema.org", "@type": "WebSite", name: config.siteName, alternateName: config.shortName, url: absolute("/"), description: page.description, inLanguage: "zh-CN", dateModified: modified, publisher: { "@id": organizationId } });
  }

  if (page.kind === "tool") {
    items.push({ "@context": "https://schema.org", "@type": "WebApplication", name: page.tool.name, url: absolute(`/${page.tool.slug}/`), description: page.description, applicationCategory: page.tool.category, operatingSystem: "支持现代浏览器的桌面与移动设备", browserRequirements: "需要 JavaScript、Canvas、Blob 和本地文件读取能力", isAccessibleForFree: true, offers: { "@type": "Offer", price: 0, priceCurrency: "CNY" }, author: { "@id": organizationId }, publisher: { "@id": organizationId }, dateModified: modified });
    items.push({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "全部工具", item: absolute("/") },
      { "@type": "ListItem", position: 2, name: page.tool.name, item: absolute(`/${page.tool.slug}/`) }
    ] });
    const faq = faqByTool[page.tool.slug] || [];
    if (faq.length) {
      items.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) });
    }
  }

  return items.map((item) => JSON.stringify(item).replace(/[<>&\u2028\u2029]/g, (character) => ({ "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" })[character]));
}

const analyticsId = "G-4QJD4CQ5DT";
const analyticsBootstrap = `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${analyticsId}', { anonymize_ip: true });`;

function head(page) {
  const canonical = absolute(page.path);
  const shouldNoindex = noindex || page.noindex;
  const json = structuredData(page);
  const scriptHashes = [...json.map((item) => `'sha256-${jsonLdHash(item)}'`), `'sha256-${jsonLdHash(analyticsBootstrap)}'`].join(" ");
  const csp = `default-src 'self'; img-src 'self' blob: data: https://www.google-analytics.com https://*.google-analytics.com; script-src 'self' https://www.googletagmanager.com ${scriptHashes}; style-src 'self'; connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
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
    <div class="nav-links" id="site-navigation">${link("/", "全部工具", "home")}${link("/methodology/", "安全与隐私", "methodology")}${link("/about/", "关于", "about")}</div>
  </nav>
</header>`;
}

function footer() {
  return `<footer class="site-footer">
  <div class="footer-inner">
    <span>© <span data-year></span> ${escapeHtml(config.siteName)}</span>
    <div class="footer-links"><a href="${asset("/methodology/")}">安全与隐私</a><a href="${asset("/about/")}">关于本站</a><a href="${asset("/privacy/")}">隐私政策</a><a href="${asset("/terms/")}">使用条款</a></div>
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

function faqSection(slug) {
  const items = faqByTool[slug] || [];
  if (!items.length) return "";
  return `<section class="section compact"><article class="article"><h2>常见问题</h2>${items.map(([question, answer]) => `<h3>${escapeHtml(question)}</h3><p>${escapeHtml(answer)}</p>`).join("")}</article></section>`;
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
  kind: "home", path: "/", title: `在线图片压缩、水印、尺寸与格式转换工具 - ${config.siteName}`, ogTitle: `${config.siteName}：浏览器本地图片处理工具`,
  description: "在线图片压缩到指定KB、添加证件与资料水印、修改尺寸、JPG/PNG/WebP格式转换和EXIF清除。图片在浏览器本地处理，无需注册。"
};
const homeBody = `<section class="tool-directory" id="tools"><div class="tool-directory-inner">
  <div class="home-intro">
    <p class="eyebrow">在线图片工具</p>
    <h1>在线图片压缩、水印、尺寸与格式转换工具</h1>
    <p class="home-summary">${escapeHtml(config.siteName)}提供图片压缩到指定 KB、资料图片加水印、尺寸裁剪、JPG/PNG/WebP 转换和 EXIF 查看清除。图片在当前浏览器中处理，无需上传源文件。</p>
    <div class="home-facts" aria-label="服务特点"><span>浏览器本地处理</span><span>无需注册</span><span>免费使用</span></div>
    <div class="home-actions"><a class="button" href="${asset("/compress/")}">压缩图片到指定 KB</a><a class="home-text-link" href="#tool-list">查看全部工具</a></div>
  </div>
  <div class="directory-heading"><div><p class="eyebrow">全部工具</p><h2>选择要处理的图片任务</h2></div><p>支持静态 JPG、PNG 和 WebP；具体格式和尺寸限制请以各工具页面说明为准。</p></div>
  <div class="tool-grid" id="tool-list">
${tools.map((tool, index) => `<a class="tool-card reveal" href="${asset(`/${tool.slug}/`)}"><span class="tool-symbol" aria-hidden="true">${["KB", "水印", "PX", "格式", "EXIF"][index]}</span><span class="tool-card-copy"><strong>${tool.name}</strong><span>${tool.description}</span></span><span class="tool-arrow" aria-hidden="true">→</span></a>`).join("\n")}
  </div>
</div></section>
<section class="workflow-band"><div class="workflow-band-inner"><img src="${staticAsset("/assets/img/hero-workbench.webp")}" width="1672" height="941" loading="lazy" alt="桌面上的手机、照片、色卡和裁切尺"><div><p class="eyebrow">隐私与处理方式</p><h2>图片在当前浏览器中处理</h2><p>本站代码不设置图片上传接口。所选文件由浏览器读取、处理和导出；页面访问会经过 GitHub Pages，并使用 Google Analytics 统计基础访问数据，但不会把你在工具中选择的图片、图片内容或水印文字作为统计参数发送。</p><a href="${asset("/methodology/")}">了解安全与隐私说明 <span aria-hidden="true">→</span></a></div></div></section>
<section class="section compact"><div class="evidence-strip"><div class="evidence-item"><strong>无需注册</strong><p>打开工具即可使用，不要求创建账号。</p></div><div class="evidence-item"><strong>结果先预览</strong><p>生成后查看格式、尺寸或体积，再决定是否下载。</p></div><div class="evidence-item"><strong>限制公开说明</strong><p>不把重新编码说成无损，也不承诺水印或 EXIF 清除能解决所有隐私风险。</p></div></div></section>
<section class="section compact"><article class="article"><h2>常见图片处理问题</h2><h3>怎么把图片压缩到 100KB 或 200KB？</h3><p>进入图片压缩工具，填写目标 KB 后开始处理。工具会先调整编码质量，必要时再缩小像素尺寸。</p><h3>证件或资料图片怎么加用途水印？</h3><p>进入水印工具后填写接收方、用途和日期，可设置重复铺满、透明度、角度和颜色。水印只能降低直接挪用风险，不能替代打码和访问控制。</p><h3>怎么删除照片里的定位和拍摄信息？</h3><p>EXIF 工具可以查看部分常见元数据，并通过重新编码生成不复制原 EXIF 的新文件。删除 EXIF 不等于完全匿名，画面本身仍可能暴露身份。</p></article></section>`;
await writePage("index.html", pageShell(home, "home", homeBody));

for (const tool of tools) {
  const toolMeta = {
    compress: { title: `图片压缩到指定KB - 在线压缩到100KB/200KB｜${config.siteName}`, description: "在线把 JPG、PNG、WebP 图片压缩到 50KB、100KB、200KB 等指定大小，可自动调整画质与像素尺寸。图片在浏览器本地处理。" },
    watermark: { title: `图片加水印 - 证件与资料用途水印工具｜${config.siteName}`, description: "在线给证件、资料和普通图片添加用途水印，支持重复铺满、透明度、角度、颜色和自动换行。图片在浏览器本地处理。" },
    resize: { title: `图片尺寸修改 - 在线改像素与裁剪图片｜${config.siteName}`, description: "在线修改图片宽高像素，支持按比例缩放、定位裁剪、完整适应和拉伸。图片在浏览器本地处理。" },
    convert: { title: `图片格式转换 - JPG/PNG/WebP在线互转｜${config.siteName}`, description: "在线转换 JPG、PNG、WebP 图片格式，支持透明背景处理和画质设置。图片在浏览器本地完成转换。" },
    "remove-exif": { title: `清除EXIF - 在线删除照片定位与拍摄信息｜${config.siteName}`, description: "在线查看并清除照片中的常见 EXIF 信息，包括拍摄设备、时间和可能存在的 GPS 元数据。图片在浏览器本地处理。" }
  }[tool.slug];
  const page = { kind: "tool", tool, path: `/${tool.slug}/`, title: toolMeta.title, ogTitle: tool.name, description: toolMeta.description };
  let body = "";
  if (tool.slug === "compress") body = toolLayout(tool, "文件大小", "图片压缩是通过调整编码质量、图片格式或像素尺寸来降低文件体积。输入目标 KB 后，工具先调整编码质量；仍过大时，可选择逐级缩小像素尺寸。", `${dropzone("选择或拖入一张图片", "支持静态 JPG、PNG、WebP；最大 30 MB、2400 万像素")}${preview("img", "原图预览会显示在这里")}
<div class="controls"><div class="control-grid"><div class="control-group"><label for="target-kb">目标大小（KB）</label><input id="target-kb" type="number" value="100" min="5" max="10240" step="1" inputmode="numeric"><span class="hint">例如 50、100、200 或 500 KB</span></div><div class="control-group"><label for="output-format">输出格式</label><select id="output-format"><option value="image/jpeg">JPG</option><option value="image/webp">WebP</option></select></div><div class="control-group full"><div class="inline-check"><input id="allow-resize" type="checkbox" checked><label for="allow-resize">画质调整仍不够时，允许缩小像素尺寸</label></div></div></div>${actions("开始压缩")}</div>
<div class="status-line" id="status" role="status" aria-live="polite" hidden></div>${resultBlock("压缩结果", [["原文件大小", "original-size"], ["输出大小", "output-size"], ["输出尺寸", "output-dimensions"], ["体积减少", "saving", "saving-label"]])}`, `<article class="article"><h2>怎样压缩到指定 KB</h2><ol><li>输入报名系统或平台要求的大小上限。</li><li>先查看输出尺寸，再放大检查文字边缘和人脸细节。</li><li>如果结果仍过大，可提高目标值或允许缩小尺寸。</li></ol><h2>透明背景如何处理</h2><p>输出 JPG 时透明区域会填充为白色；输出 WebP 时保留浏览器能够编码的透明区域。动画 PNG 和动画 WebP 不会被静默压成单帧，而是直接提示不支持。</p><h2>为什么可能达不到目标</h2><p>图片纹理、噪点和文字边缘都会影响编码体积。工具设置了尺寸和画质下限，避免为了几 KB 生成无法辨认的图片，因此不会承诺每张图都能达到任意目标。</p></article>${related(["resize", "convert", "remove-exif", "watermark"])}${faqSection("compress")}`, `<section><h2>本地处理</h2><p>本站代码不主动上传图片。处理期间浏览器会在内存中保存解码结果。</p></section><section><h2>建议顺序</h2><ul><li>先改像素尺寸</li><li>再选择所需格式</li><li>最后压缩到体积上限</li></ul></section>`);
  if (tool.slug === "watermark") body = toolLayout(tool, "资料分享", "图片水印是在画面上叠加可见文字，用于标注接收方、用途和日期。水印可以增加直接挪用的成本，但不能替代打码或访问控制。", `${dropzone("选择或拖入一张资料图片", "请先确认接收方确有必要获取这份资料")}${preview("canvas", "水印预览会显示在这里")}
<div class="controls"><div class="control-grid"><div class="control-group full"><label for="watermark-text">水印文字</label><input id="watermark-text" value="仅供资料审核使用" maxlength="80" autocomplete="off"><span class="hint">文字过长时自动缩小并换行，最多三行</span></div><div class="control-group"><label for="font-size">字号 <span id="font-size-value">48</span></label><input id="font-size" type="range" min="18" max="120" value="48"></div><div class="control-group"><label for="opacity">透明度 <span id="opacity-value">38%</span></label><input id="opacity" type="range" min="10" max="90" value="38"></div><div class="control-group"><label for="angle">旋转角度 <span id="angle-value">-25°</span></label><input id="angle" type="range" min="-60" max="60" value="-25"></div><div class="control-group"><label for="color">文字颜色</label><input id="color" type="color" value="#b3261e"></div><div class="control-group"><label for="output-format">输出格式</label><select id="output-format"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></div><div class="control-group"><div class="inline-check"><input id="repeat" type="checkbox" checked><label for="repeat">重复铺满</label></div></div></div>${actions("生成水印图片")}</div>
<div class="status-line" id="status" role="status" aria-live="polite" hidden></div>${resultBlock("导出结果", [["文件大小", "output-size"], ["输出尺寸", "output-dimensions"]])}`, `<article class="article"><h2>资料水印建议怎么写</h2><p>写清接收方、具体用途和当天日期，例如“仅供某平台账户核验使用｜当天日期”。不要把“他用无效”理解为技术或法律上的绝对保护。</p><h2>水印不能解决什么</h2><p>可见水印仍可能被裁剪、覆盖或修复。证件号、住址、人脸等不必要信息应另外打码；确需提交时，也应确认接收方身份和保存期限。</p><h2>导出前检查</h2><ul><li>文字完整，没有超出画布。</li><li>必要信息仍然可读，但水印覆盖范围足够。</li><li>JPG 的透明区域会以白色合成，PNG 和 WebP 可保留透明区域。</li></ul></article>${related(["remove-exif", "compress", "resize", "convert"])}${faqSection("watermark")}`, `<section><h2>隐私边界</h2><p>图片和水印文字在当前浏览器中处理。页面使用 Google Analytics 统计基础访问数据，但不会把图片内容、水印文字或导出文件作为统计参数发送。</p></section><section><h2>重要提醒</h2><p>水印只能降低直接挪用风险，不能保证阻止滥用。</p></section>`);
  if (tool.slug === "resize") body = toolLayout(tool, "像素与比例", "图片尺寸修改是调整图片的像素宽度和高度。设置目标宽高后，可选择完整适应、定位裁剪或拉伸；预览使用小画布，下载时才按目标尺寸生成。", `${dropzone("选择或拖入一张图片", "支持静态 JPG、PNG、WebP")}${preview("canvas", "尺寸预览会显示在这里")}
<div class="controls"><div class="control-grid"><div class="control-group"><label for="width">宽度（px）</label><input id="width" type="number" min="1" max="8192" value="800"></div><div class="control-group"><label for="height">高度（px）</label><input id="height" type="number" min="1" max="8192" value="600"></div><div class="control-group"><div class="inline-check"><input id="lock-ratio" type="checkbox" checked><label for="lock-ratio">锁定原图比例</label></div></div><div class="control-group"><label for="fit-mode">适应方式</label><select id="fit-mode"><option value="contain">完整适应</option><option value="cover">定位裁剪</option><option value="stretch">拉伸</option></select></div><div class="control-group full" id="crop-controls" hidden><div class="control-grid"><div class="control-group"><label for="focal-x">水平焦点</label><input id="focal-x" type="range" min="0" max="100" value="50"><span class="hint">向左或向右移动裁剪区域</span></div><div class="control-group"><label for="focal-y">垂直焦点</label><input id="focal-y" type="range" min="0" max="100" value="50"><span class="hint">向上或向下移动裁剪区域</span></div></div></div><div class="control-group"><label for="background">留边背景</label><input id="background" type="color" value="#ffffff"></div><div class="control-group"><label for="output-format">输出格式</label><select id="output-format"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></div><div class="control-group"><div class="inline-check"><input id="transparent-background" type="checkbox"><label for="transparent-background">PNG/WebP 使用透明留边</label></div></div><div class="control-group"><label for="quality">画质 <span id="quality-value">90%</span></label><input id="quality" type="range" min="30" max="100" value="90"></div><div class="control-group full"><span class="control-label">常用预设</span><div class="button-row"><button class="button secondary" type="button" data-preset="295x413">一寸照 295×413</button><button class="button secondary" type="button" data-preset="300x300">方形 300×300</button><button class="button secondary" type="button" data-preset="800x800">方形 800×800</button><button class="button secondary" type="button" data-preset="1920x1080">16:9 1920×1080</button></div></div></div>${actions("生成新尺寸图片")}</div>
<div class="status-line" id="status" role="status" aria-live="polite" hidden></div>${resultBlock("处理结果", [["输出尺寸", "output-dimensions"], ["文件大小", "output-size"]])}`, `<article class="article"><h2>三种适应方式</h2><table><thead><tr><th>方式</th><th>结果</th><th>适合场景</th></tr></thead><tbody><tr><td>完整适应</td><td>保留整张图，比例不同时留边</td><td>商品图、资料截图</td></tr><tr><td>定位裁剪</td><td>保持比例并填满，可调整裁剪焦点</td><td>头像、封面、报名照片</td></tr><tr><td>拉伸</td><td>不裁剪但可能改变比例</td><td>只在系统明确要求时使用</td></tr></tbody></table><h2>放大不会恢复细节</h2><p>增加像素只是插值，不能生成原图中不存在的纹理。报名系统同时限制像素和 KB 时，先完成尺寸处理，再使用压缩工具。</p><h2>画布限制</h2><p>单边最多 8192 像素、总计最多 2400 万像素，极端宽高比会被拒绝。不同移动浏览器的实际内存上限仍可能更低。</p></article>${related(["compress", "convert", "watermark", "remove-exif"])}${faqSection("resize")}`, `<section><h2>透明留边</h2><p>JPG 不支持透明；PNG 和 WebP 可选择透明或指定背景色。</p></section><section><h2>裁剪检查</h2><p>定位裁剪后请检查人脸、文字和二维码是否完整。</p></section>`);
  if (tool.slug === "convert") body = toolLayout(tool, "文件格式", "图片格式转换是在保持画面内容的前提下，用另一种编码格式生成新文件。这里可在 JPG、PNG 和 WebP 之间转换，相同格式不会重复编码。", `${dropzone("选择或拖入一张图片", "动画图片不会被静默转换成单帧")}${preview("img", "原图预览会显示在这里")}
<div class="controls"><div class="control-grid"><div class="control-group"><label for="output-format">目标格式</label><select id="output-format"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></div><div class="control-group"><label for="quality">画质 <span id="quality-value">90%</span></label><input id="quality" type="range" min="20" max="100" value="90"><span class="hint">PNG 为无损编码，此设置不生效</span></div><div class="control-group"><label for="background">JPG 透明区域背景</label><input id="background" type="color" value="#ffffff"><span class="hint">仅输出 JPG 时生效</span></div></div>${actions("开始转换")}</div>
<div class="status-line" id="status" role="status" aria-live="polite" hidden></div>${resultBlock("转换结果", [["源格式", "original-format"], ["输出格式", "output-format-name"], ["输出尺寸", "output-dimensions"], ["文件大小", "output-size"]])}`, `<article class="article"><h2>JPG、PNG、WebP 怎么选</h2><table><thead><tr><th>格式</th><th>特点</th><th>常见用途</th></tr></thead><tbody><tr><td>JPG</td><td>照片体积较小，不支持透明</td><td>报名材料、照片</td></tr><tr><td>PNG</td><td>无损，支持透明，体积可能较大</td><td>截图、图标、透明素材</td></tr><tr><td>WebP</td><td>支持透明，网页使用通常更省体积</td><td>网站图片</td></tr></tbody></table><h2>转换会改变什么</h2><p>浏览器会重新编码像素，原始 EXIF、ICC 色彩配置、DPI、XMP 和版权字段通常不会原样保留；Canvas 导出的 DPI 也不应当作印刷尺寸依据。</p><h2>动画和同格式输入</h2><p>动画 PNG 与动画 WebP 会直接提示不支持。源格式与目标格式相同时，工具不会无意义地再次编码；如需减小体积，请使用压缩工具。</p></article>${related(["compress", "resize", "remove-exif", "watermark"])}${faqSection("convert")}`, `<section><h2>透明区域</h2><p>输出 WebP 或 PNG 时保留透明通道；输出 JPG 时使用所选背景色。</p></section><section><h2>色彩提醒</h2><p>重新编码可能改变广色域、ICC 配置和印刷 DPI。</p></section>`);
  if (tool.slug === "remove-exif") body = toolLayout(tool, "照片隐私", "EXIF 是照片中常见的一类元数据，可包含拍摄设备、时间、曝光参数和可能存在的 GPS 信息。工具会先查看常见字段，再重新编码像素，生成不复制原 EXIF 的新文件。", `${dropzone("选择或拖入一张照片", "GPS 坐标不会自动展开；最大 30 MB")}${preview("img", "照片预览会显示在这里")}
<section id="metadata" aria-labelledby="metadata-title" hidden><h2 id="metadata-title">检测到的信息</h2><table class="meta-table"><tbody id="meta-body"></tbody></table></section>
<div class="controls"><div class="control-grid"><div class="control-group"><label for="output-format">输出格式</label><select id="output-format"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></div><div class="control-group"><label for="quality">画质 <span id="quality-value">92%</span></label><input id="quality" type="range" min="30" max="100" value="92"></div></div>${actions("清除并生成副本")}</div>
<div class="status-line" id="status" role="status" aria-live="polite" hidden></div>${resultBlock("清除结果", [["新文件大小", "output-size"], ["输出格式", "output-format-name"], ["结果检查", "verification"]])}`, `<article class="article"><h2>照片信息可能包括什么</h2><p>常见 EXIF 字段包括拍摄时间、相机或手机型号、镜头、方向、曝光参数和 GPS。精确坐标默认隐藏，只有主动点击后才显示。</p><h2>清除方法与验证</h2><p>工具把可见像素绘制到新画布，再由浏览器编码。JPG 输出会重新检查是否仍存在 EXIF APP1 段；PNG 和 WebP 输出说明为“没有复制原元数据”，不声称进行了完整取证级分析。</p><h2>清除 EXIF 不等于匿名</h2><p>画面中的人脸、门牌、文件编号和环境特征仍可能暴露身份。隐写数据、专有元数据和平台再次写入的信息也不在完整保证范围内。</p></article>${related(["watermark", "compress", "resize", "convert"])}${faqSection("remove-exif")}`, `<section><h2>读取范围</h2><p>只读取 JPEG APP1 段内的有限常见标签，并限制字段长度和目录数量。</p></section><section><h2>使用边界</h2><p>不要把输出作为取证材料，也不要删除唯一的原文件。</p></section>`);
  await writePage(`${tool.slug}/index.html`, pageShell(page, tool.slug, body, ["image-core.js", tool.script]));
}

const methodology = { kind: "page", path: "/methodology/", title: `图片本地处理与安全说明 - ${config.siteName}`, description: "了解图安工具为什么可以在浏览器本地处理图片、支持哪些格式、有哪些安全与隐私边界，以及哪些情况不适合使用。" };
await writePage("methodology/index.html", pageShell(methodology, "methodology", `<section class="page-head"><div class="page-head-inner"><p class="eyebrow">安全与隐私</p><h1>图片本地处理与安全说明</h1><p>这里说明图片如何在浏览器中处理、哪些数据不会由本站代码主动上传，以及使用工具时需要注意的边界。</p></div></section><section class="section"><article class="article"><h2>为什么图片可以不上传服务器？</h2><p>现代浏览器可以直接读取用户主动选择的本地文件，并通过 Canvas、Blob 和浏览器自带的图片编码能力完成预览、修改和导出。本站工具利用这些浏览器能力处理图片，不设置图片上传接口。</p><h2>页面访问是否完全不产生网络数据？</h2><p>不是。打开网页需要从 GitHub Pages 加载 HTML、CSS、JavaScript 和图片资源；本站还使用 Google Analytics 4 统计基础页面访问情况。GitHub 和 Google 可能处理 IP 地址、访问时间、浏览器或设备信息、访问路径、来源页面及粗略地理位置等技术数据。这里所说的“本地处理”是指你在工具中选择的源图片、图片内容、水印文字和处理结果不会被本站代码作为统计数据主动上传。</p><h2>Google Analytics 会统计什么？</h2><p>本站使用 Google Analytics 4 了解页面访问量、来源、设备类型和页面使用情况，以帮助改进工具和内容。本站不会主动把文件名、图片像素内容、EXIF 内容、GPS 坐标、水印文字或下载后的文件作为 Analytics 事件参数发送。</p><h2>支持哪些图片？</h2><p>当前主要支持静态 JPG、PNG 和 WebP。动画 PNG、动画 WebP、GIF 以及多帧照片格式不在处理范围内。单边最大 8192 像素，总像素上限 2400 万，实际可用上限还会受设备内存和浏览器限制影响。</p><h2>重新编码会改变什么？</h2><p>压缩、格式转换、尺寸修改和 EXIF 清除都可能触发浏览器重新编码。原始 EXIF、ICC 色彩配置、DPI、XMP、版权字段和部分专有元数据不保证原样保留；颜色和细节也可能出现轻微变化。</p><h2>水印和 EXIF 清除能提供什么保护？</h2><p>可见水印可以帮助标注用途并降低图片被直接挪用的风险，但不能保证阻止裁剪、覆盖或修复。清除常见 EXIF 可以减少一部分元数据暴露，但不能消除人脸、门牌、文件编号、环境特征或其他可识别信息。</p><h2>使用前建议</h2><ul><li>保留原文件，不要把处理结果作为唯一副本。</li><li>下载后重新打开，检查文字、人脸、二维码和关键边缘。</li><li>处理证件或隐私资料时，只向确有必要的接收方提供必要信息。</li><li>对取证、医疗、印刷色彩或严格合规场景，不要把浏览器工具当作专业软件的替代品。</li></ul></article></section>`));

const about = { kind: "page", path: "/about/", title: `关于${config.siteName} - 浏览器本地图片工具`, description: `${config.siteName}是一个开源的浏览器端图片处理项目，提供图片压缩、水印、尺寸修改、格式转换和 EXIF 清除工具。` };
await writePage("about/index.html", pageShell(about, "about", `<section class="page-head"><div class="page-head-inner"><p class="eyebrow">关于本站</p><h1>简单、透明的浏览器图片工具</h1><p>${escapeHtml(config.siteName)}是一个开源的浏览器端图片处理项目，专注于无需注册、尽量不上传源图片即可完成的常见图片任务。</p></div></section><section class="section"><article class="article"><h2>我们提供什么</h2><p>目前提供图片压缩到指定 KB、证件与资料图片加水印、图片尺寸修改与裁剪、JPG/PNG/WebP 格式转换，以及 EXIF 查看与清除。工具优先保持操作简单，并明确说明画质、元数据和隐私边界。</p><h2>为什么采用浏览器本地处理</h2><p>很多图片任务并不需要把源文件发送到服务器。利用浏览器的文件读取、Canvas 和 Blob 能力，可以在当前设备完成大部分处理，同时减少敏感图片在网络上传输的必要性。</p><h2>我们的处理原则</h2><ul><li>本站代码不设置图片上传接口。</li><li>不要求注册账号后才能使用核心工具。</li><li>不把重新编码描述成无损，也不把水印或 EXIF 清除描述成绝对保护。</li><li>对文件格式、尺寸、动画图片和元数据处理范围明确说明限制。</li></ul><h2>开源与反馈</h2><p>站点源代码和变更记录发布在<a href="${escapeHtml(config.repositoryUrl)}" rel="nofollow">GitHub 代码仓库</a>，用户可以检查主要图片处理逻辑。发现损坏文件、兼容性或文案问题，可通过<a href="${escapeHtml(config.contactUrl)}" rel="nofollow">公开反馈渠道</a>联系维护者。请勿在反馈中上传证件、私人照片或其他敏感文件。</p></article></section>`));

const privacy = { kind: "page", path: "/privacy/", title: `隐私政策 - ${config.siteName}`, description: `${config.siteName}隐私政策，说明本地图片处理、浏览器临时状态、GitHub Pages托管和第三方服务边界。` };
await writePage("privacy/index.html", pageShell(privacy, "privacy", `<section class="page-head"><div class="page-head-inner"><p class="eyebrow">隐私政策</p><h1>图片由浏览器处理</h1><p>更新日期：${config.lastModified}。本政策描述当前发布版本的实际行为。</p></div></section><section class="section"><article class="article"><h2>本站处理哪些数据</h2><p>用户主动选择的图片、文件名、水印文字和输出参数由页面脚本在当前浏览器中读取。本站代码没有图片上传接口，不会主动把这些内容发送到本站或第三方服务器。</p><h2>浏览器临时状态</h2><p>处理时，浏览器内存会保存解码图片、Canvas 和 Blob 临时地址。页面刷新或关闭后通常会释放；浏览器的前进后退缓存可能在当前会话内短暂保留页面状态。下载后的文件由用户自行管理。</p><h2>托管与访问日志</h2><p>本站使用 GitHub Pages 托管。浏览器访问页面时会连接 GitHub 的基础设施，GitHub 可能处理 IP 地址、请求时间、浏览器信息和访问路径。具体处理方式和保留期限由<a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement" rel="nofollow">GitHub 隐私声明</a>说明。本站会根据实际使用的服务和适用要求维护本政策，不把“图片没有上传”与“页面访问完全不产生网络数据”混为一谈。</p><h2>统计服务</h2><p>本站使用 Google Analytics 4 了解页面访问量、来源、设备类型和基础页面使用情况，以改进工具和内容。Google Analytics 可能向 Google 发送页面地址、来源页面、浏览器和设备信息、IP 地址衍生的粗略地理位置以及相关技术标识。本站不会主动把用户选择的图片、图片内容、文件名、EXIF 内容、GPS 坐标、水印文字或导出文件作为 Analytics 参数发送。</p><p>Google 对相关数据的处理受其隐私政策和服务条款约束。你可以通过浏览器隐私设置、内容拦截工具或 Google 提供的退出机制限制相关统计。若适用法律要求额外同意机制，本站将根据实际运营地区和访问者范围进行调整。</p><h2>Cookie 与广告</h2><p>本站当前不接入广告或个性化推荐服务。Google Analytics 可能根据浏览器、地区和 Google 的当前实现使用 Cookie 或其他技术标识；本站不会利用统计数据建立用户画像，也不会把图片处理内容与统计标识关联。</p><h2>联系我们</h2><p>隐私问题可通过<a href="${escapeHtml(config.contactUrl)}" rel="nofollow">本站反馈渠道</a>联系${escapeHtml(config.operatorName)}。请不要发送原始证件或私人照片。</p></article></section>`));

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
