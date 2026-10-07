import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const REQUIRED_PATHS = ["/", "/compress/", "/watermark/", "/resize/", "/convert/", "/remove-exif/", "/methodology/", "/about/", "/privacy/", "/terms/"];

export async function loadConfig(root, production) {
  const config = JSON.parse(await readFile(resolve(root, "site.config.json"), "utf8"));
  const required = ["siteName", "shortName", "siteUrl", "operatorName", "contactUrl", "repositoryUrl", "lastModified", "currentVersion", "projectStarted"];
  const missing = required.filter((key) => typeof config[key] !== "string" || !config[key].trim());
  if (typeof config.productionReady !== "boolean") throw new Error("productionReady 必须是 JSON 布尔值 true 或 false，不能加引号。");
  if (missing.length) throw new Error("配置缺少有效文本字段：" + missing.join(", "));

  const requireHttps = production || config.productionReady;
  const site = validatedUrl(config.siteUrl, "siteUrl", requireHttps);
  validatedUrl(config.contactUrl, "contactUrl", requireHttps);
  validatedUrl(config.repositoryUrl, "repositoryUrl", requireHttps);
  if (site.username || site.password || site.search || site.hash) throw new Error("siteUrl 不能包含账号、密码、查询参数或片段。");
  if (site.pathname.includes("//")) throw new Error("siteUrl 路径不能包含连续斜杠。");
  validateDate(config.lastModified, "lastModified");
  validateDate(config.projectStarted, "projectStarted");
  if (!/^\d+\.\d+\.\d+$/.test(config.currentVersion)) throw new Error("currentVersion 必须使用语义化版本号，例如 3.1.0。");

  if (!config.pageLastModified || typeof config.pageLastModified !== "object" || Array.isArray(config.pageLastModified)) {
    throw new Error("pageLastModified 必须为逐页日期对象。");
  }
  for (const path of REQUIRED_PATHS) validateDate(config.pageLastModified[path], `pageLastModified[${path}]`);
  const pageEntries = Object.entries(config.pageLastModified);
  if (!pageEntries.length) throw new Error("pageLastModified 不能为空。");
  for (const [path, date] of pageEntries) {
    if (path !== "/" && !/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/$/.test(path)) throw new Error(`pageLastModified 路径格式无效：${path}`);
    validateDate(date, `pageLastModified[${path}]`);
  }
  const newestPageDate = pageEntries.map(([, date]) => date).sort().at(-1);
  if (config.lastModified !== newestPageDate) throw new Error(`lastModified 应等于最新页面日期 ${newestPageDate}。`);

  if (!config.pagePublished || typeof config.pagePublished !== "object" || Array.isArray(config.pagePublished)) throw new Error("pagePublished 必须为文章首次发布日期对象。");
  for (const [path, date] of Object.entries(config.pagePublished)) {
    if (!path.startsWith("/guides/") || !path.endsWith("/")) throw new Error(`pagePublished 只应记录指南文章：${path}`);
    validateDate(date, `pagePublished[${path}]`);
    if (!config.pageLastModified[path]) throw new Error(`pagePublished 对应页面未出现在 pageLastModified：${path}`);
    if (date > config.pageLastModified[path]) throw new Error(`pagePublished 不能晚于 pageLastModified：${path}`);
  }

  if (config.customDomain) {
    const labels = typeof config.customDomain === "string" ? config.customDomain.split(".") : [];
    if (labels.length < 2 || config.customDomain.length > 253 || labels.some((label) => !/^(?!-)[a-z0-9-]{1,63}(?<!-)$/i.test(label))) {
      throw new Error("customDomain 必须是纯主机名，不能包含协议、路径或端口。");
    }
    if (site.hostname.toLowerCase() !== config.customDomain.toLowerCase()) throw new Error("customDomain 必须与 siteUrl 的主机名一致。");
    if (site.port) throw new Error("自定义域名的 siteUrl 不能包含端口。");
    if (site.pathname !== "/") throw new Error("自定义域名的 siteUrl 不应包含项目子路径。");
  }
  if (production && !config.productionReady) throw new Error("生产部署被阻止：请完成核对后将 productionReady 设为布尔值 true。");
  return config;
}

function validatedUrl(value, label, production) {
  let url;
  try { url = new URL(value); }
  catch (_) { throw new Error(`${label} 不是有效的绝对 URL。`); }
  if (!['https:', ...(production ? [] : ['http:'])].includes(url.protocol)) throw new Error(`${label} ${production ? "生产环境必须使用 HTTPS" : "只能使用 HTTP 或 HTTPS"}。`);
  return url;
}

function validateDate(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} 必须使用 YYYY-MM-DD。`);
  const date = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`${label} 不是有效日期。`);
}

export { REQUIRED_PATHS };
