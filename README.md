# 图安工具

一个面向中文用户的静态图片工具站，包含图片压缩、水印、尺寸修改、格式转换和 EXIF 查看与清除。运行时无第三方依赖，图片由浏览器本地处理。

## 目录

- `index.html` 与各工具目录：由构建脚本生成的可预览页面
- `assets/`：共享样式、图片和原生 JavaScript
- `scripts/generate.mjs`：统一生成页面、SEO 元数据、站点地图和 robots
- `scripts/check.mjs`：配置同步、链接、JSON-LD、站点地图和脚本检查
- `scripts/stage.mjs`：按逐文件白名单复制公开文件到 `_site`
- `tests/run.mjs`：文件结构、任务状态、水印和损坏 EXIF 边界测试
- `site.config.json`：站名、域名、运营主体和联系渠道
- `.github/workflows/pages.yml`：GitHub Pages Actions 部署

README、配置、测试和接入说明不会进入 Pages 发布产物。

## 本地预览

项目不需要安装依赖。先生成页面并运行检查：

```bash
npm run build
npm run check
python3 -m http.server 8080
```

访问 `http://localhost:8080/`。在 `productionReady` 为 `false` 时，生成页面带有 `noindex`，`robots.txt` 也会阻止抓取。

## 上线前配置

编辑 `site.config.json`：

- `siteUrl`：最终公开地址，组织站、项目站或自定义域名均可；
- `operatorName`：真实运营主体或维护者名称；
- `contactUrl`：真实、持续维护的联系入口；
- `repositoryUrl`：公开代码仓库地址；
- `customDomain`：不用自定义域名时留空；
- `lastModified`：内容最近一次重要更新日期；
- `pageLastModified`：每个公开 URL 最近一次重要内容更新日期；
- `productionReady`：必须使用不带引号的布尔值，全部核对完成后改为 `true`。

执行生产构建：

```bash
npm run stage
```

如果生产信息未确认，命令会失败。成功后 `_site/` 是唯一允许部署的目录。

## GitHub Pages 部署

推荐使用仓库自带的 Actions 工作流：

1. 创建组织站仓库 `组织名.github.io`，或普通项目仓库。
2. 把 `siteUrl` 改成实际 Pages 地址；项目站应包含仓库路径。
3. 完成生产配置并把 `productionReady` 改为 `true`。
4. 在仓库 Settings → Pages 中选择 GitHub Actions。
5. Pull Request 会先运行低权限检查；推送到 `main` 后才会生成、复检并发布 `_site/`。

不要改成“从分支根目录发布”，否则 README、测试和内部说明也会作为静态文件公开。

项目站位于 `用户名.github.io/仓库名/` 子路径时，生成器会自动给资源和 404 链接加仓库路径。但搜索引擎只会读取域名根目录的 `robots.txt`；项目站自己的 `robots.txt` 不能替代主机根规则，应通过页面 robots 元数据和站长平台提交 sitemap 管理收录。

## 自定义域名安全顺序

1. 先在 GitHub 账号或组织设置中验证域名并保留 TXT 验证记录。
2. 再在仓库 Pages 设置中添加自定义域名。
3. 最后添加精确的 DNS 记录，避免通配符记录。
4. DNS 生效后启用 Enforce HTTPS。
5. 停用站点时先清理 DNS，避免悬空 CNAME 和域名接管。

同一主域名的多个直接子域名如果分给不同 GitHub 组织，域名验证所有权可能冲突。站群使用一个主域名时，优先让这些仓库归同一组织；否则使用不同主域名或仅使用各组织的 `*.github.io` 地址。

## 中国大陆运营检查

GitHub Pages 是境外托管。正式面向中国大陆用户前，应实际检查移动、联通、电信网络，以及微信、QQ、iOS Safari 和 Android 浏览器中的访问与下载。

如果迁移到境内服务器、对象存储或 CDN，应根据运营主体和接入服务确认 ICP 备案、备案号展示、公安备案及其他适用要求。不要在没有确认托管位置和主体关系时笼统声称“无需备案”。

## 平台边界

GitHub Pages 适合首站验证，但官方不把它定位为免费托管在线业务或商业 SaaS 的长期基础设施，并设有带宽等软限制。流量或商业化扩大前，应准备可迁移的自有域名和其他静态托管方案。

## 运行时隐私

当前页面不调用 `fetch`、XHR、WebSocket 或 `sendBeacon`，不加载统计和广告脚本。图片在浏览器内存、Canvas 和 Blob URL 中处理。

不要把第三方统计或广告 JavaScript 直接加入工具页。外部脚本在当前页面上下文中运行，理论上可以读取文件名、预览图和 Canvas。详细隔离要求见 `INTEGRATIONS.md`。

工具页在 iframe 中会禁用操作，但这只是运行时补充保护。正式域名应通过 CDN 或可配置响应头的托管服务发送 `Content-Security-Policy: frame-ancestors 'none'`；HTML `<meta>` 不能提供这项保护。使用纯 GitHub Pages 时，应上线后实际检查响应头，并在需要严格防嵌入时把自定义域名接入能够设置安全响应头的 CDN。

## 已知边界

- 只处理静态 JPG、PNG 和 WebP；
- 最大 30 MB、单边 8192 像素、总计 2400 万像素；
- 不保证保留 ICC、DPI、XMP、版权字段或完整色彩外观；
- Canvas 重新编码不是取证级元数据清理；
- 浏览器仍可能因设备内存不足拒绝较大画布；
- Canvas 编码过程不能可靠中途终止，处理期间参数会暂时锁定；
- 真实设备检查项目见 `TEST-CHECKLIST.md`。
