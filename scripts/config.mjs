import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const REQUIRED_PATHS = ["/", "/compress/", "/watermark/", "/resize/", "/convert/", "/remove-exif/", "/methodology/", "/about/", "/privacy/", "/terms/"];

export async function loadConfig(root, production) {
  const config = JSON.parse(await readFile(resolve(root, "site.config.json"), "utf8"));
  const required = ["siteName", "shortName", "siteUrl", "operatorName", "contactUrl", "repositoryUrl", "lastModified"];
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

  if (!config.pageLastModified || typeof config.pageLastModified !== "object" || Array.isArray(config.pageLastModified)) {
    throw new Error("pageLastModified 必须为逐页日期对象。");
  }
  for (const path of REQUIRED_PATHS) validateDate(config.pageLastModified[path], `pageLastModified[${path}]`);

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
