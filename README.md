# 图安工具

图安工具是一个面向中文用户的开源静态图片工具站。核心图片处理在浏览器本地完成，不要求注册账号，也不设置图片上传接口。

当前提供：

- 按上传要求处理图片：填写目标宽高、最大 KB、格式和构图方式，并可调整裁剪焦点，一次完成尺寸、格式与体积处理；
- 图片检查器：查看格式、文件大小、像素、宽高比、方向、透明像素和预计解码内存；
- 图片压缩到指定 KB；
- 批量图片压缩：一次最多 10 张，统一目标 KB，显示处理进度，可中途停止并保留已完成结果；失败项可一键重试，支持逐项或 ZIP 下载；
- 批量清除图片元数据：一次最多 10 张，通过重新编码生成新副本，显示处理进度，可中途停止并保留已完成结果；失败项可一键重试，支持逐项或 ZIP 下载；
- 证件与资料图片用途水印；
- 图片尺寸修改、裁剪与常用尺寸预设；
- JPG / PNG / WebP 格式转换；
- JPEG 常见 EXIF 查看，以及 JPG / PNG / WebP 重新编码清理；
- 围绕图片大小、像素、格式、上传失败、照片隐私等问题的使用指南；
- PWA / Service Worker 离线基础：访问过核心资源后，可在网络不稳定时继续打开已缓存工具；支持的 Chromium 浏览器在满足安装条件时会显示“安装到设备”入口。

> 本地处理不等于页面完全离线。页面资源由托管平台提供，站点使用 Google Analytics 4 统计基础访问和不含图片内容的工具动作。详见下方“隐私与第三方服务”。

## 项目目标

这个项目优先解决三件事：

1. **工具能真正完成任务**：不为了 SEO 牺牲操作体验，也不把重新编码、可见水印或 EXIF 清除描述成绝对安全。
2. **公开页面容易理解和发现**：每个工具对应清晰搜索意图，指南解决不同问题，避免批量制造只有关键词不同的薄页面。
3. **发布过程可核验**：页面、canonical、sitemap、结构化数据、静态资源版本和公开文件均由脚本生成或检查，避免手工发布时遗漏。

## 功能与边界

| 能力 | 当前实现 | 主要边界 |
| --- | --- | --- |
| 按上传要求处理 | 按用户填写的宽高、最大 KB、格式与构图方式一次完成处理，并逐项显示宽高、文件大小、格式是否满足 | 只核对用户填写的技术条件，不代替平台的人脸、背景、DPI、命名等业务规则 |
| 图片检查 | 本地读取格式、文件大小、像素、宽高比、方向、透明像素，并粗略估算 RGBA 解码内存；检查结果可复制为纯文本 | 不替代具体平台的上传规则，也不做内容识别 |
| 指定 KB 压缩 | 调整编码质量，必要时逐步缩小像素，并提供原图/结果拖动对比 | 无法保证任意图片都能在可接受画质下达到极小目标 |
| 批量图片压缩 | 最多 10 张、统一目标 KB、逐张顺序压缩，显示进度且可停止，可逐项或 ZIP 下载；混入坏文件时会跳过无效项而保留可处理图片 | 总文件大小最多 80 MB；关键图片仍应单独检查画质 |
| 批量元数据清理 | 最多 10 张，逐张重新编码，显示进度且可停止；失败项可一键重试；混入坏文件时跳过无效项，完成结果可逐项或 ZIP 下载 | 不是完全匿名工具；重新编码可能改变体积、色彩和细节 |
| 图片水印 | 单个/平铺、角度、透明度、颜色、自动换行 | 水印只能降低直接挪用便利度，不能阻止裁剪或修复 |
| 尺寸修改 | 等比、完整适应、定位裁剪、拉伸 | 放大不能恢复原本不存在的细节 |
| 格式转换 | JPG / PNG / WebP | JPG 不支持透明；重新编码可能改变元数据与色彩表现 |
| EXIF 查看/清除 | 读取有限的常见 JPEG EXIF 标签；JPG / PNG / WebP 可重新编码生成不复制原元数据的新文件 | PNG / WebP 当前不做完整 EXIF/XMP/ICC 解析；不是取证级元数据分析或彻底匿名工具 |

通用单文件限制：静态 JPG、PNG、WebP；最大 30 MB；单边最大 8192 像素；总像素最多 2400 万。批量压缩与批量元数据清理额外限制为一次最多 10 张、所选文件总大小不超过 80 MB。实际可处理上限还取决于浏览器和设备内存。

## 技术结构

项目没有运行时后端，也不依赖前端框架。

```text
.
├── assets/
│   ├── css/styles.css
│   ├── img/
│   └── js/                 # 图片检查、处理与站点交互
├── scripts/
│   ├── config.mjs          # 配置验证
│   ├── generate.mjs        # 页面、SEO、sitemap、robots 生成
│   ├── check.mjs           # HTML/链接/Schema/JS/发布一致性检查
│   └── stage.mjs           # 白名单复制到 _site
├── tests/run.mjs           # 图片边界与核心逻辑测试
├── site.config.json        # 公开站点配置与逐页更新时间
├── manifest.webmanifest    # PWA 安装元数据（生成产物）
├── service-worker.js       # 离线缓存逻辑（生成产物）
├── INTEGRATIONS.md         # 第三方脚本与隐私隔离规则
├── TEST-CHECKLIST.md       # 上线前真实设备检查
├── CHANGELOG.md            # 版本变更
└── _site/                  # 生产部署产物；不要手工编辑
```

根目录和工具目录中的 HTML 是生成产物，**内容修改应优先落在 `scripts/generate.mjs`、静态资源或配置中**。直接改生成后的 HTML，会在下一次 `npm run build` 时被覆盖。

## 环境要求

- Node.js `>=22 <25`
- Python 3 仅用于 README 中示例的本地静态服务器；构建本身不依赖 Python
- 无 npm 第三方依赖

检查当前 Node 版本：

```bash
node --version
```

## 本地开发

生成页面并执行全部检查：

```bash
npm run build
npm run check
```

本地预览：

```bash
python3 -m http.server 8080
```

访问：

```text
http://localhost:8080/
```

开发阶段如果 `productionReady` 为 `false`，生成页面会使用 `noindex`，`robots.txt` 也会阻止抓取，避免测试地址进入搜索结果。

## 可用命令

```bash
npm run build        # 生成 HTML、robots、sitemap、PWA 文件和发布清单
npm run test         # 运行核心逻辑与边界测试
npm run check        # 检查页面、链接、Schema、脚本、配置与测试
npm run stage        # 生产生成 -> 测试 -> 检查 -> 复制 _site -> 再检查
npm run check:stage  # 只检查 _site 生产目录
```

正式发布前应使用 `npm run stage`，而不是只运行 `build`。


## PWA 与离线缓存

生产构建会生成 `manifest.webmanifest` 和 `service-worker.js`。支持 Service Worker 的浏览器在 HTTPS 环境访问后，会缓存核心工具页、样式、脚本和站点图标。

离线设计遵循以下边界：

- 只缓存本站同源公开资源；
- 不缓存 Google Analytics 或其他第三方请求；
- 不缓存用户选择的本地图片、文件内容、Canvas 像素、Blob URL 或处理结果；
- 导航请求优先尝试网络，网络失败时再使用已缓存页面；
- 新版本通过资源哈希生成新的缓存名称；新 Service Worker 安装完成后页面会提示“刷新使用新版”，用户可以立即刷新，也可以选择“稍后”，避免正在处理图片时被打断；网络断开时页面会显示“当前处于离线模式”，恢复联网后自动隐藏；
- 在支持 `beforeinstallprompt` 的浏览器中，站点满足安装条件时页脚会出现“安装到设备”；不支持该事件或已经以 standalone 模式运行时不会显示；
- Service Worker 属于渐进增强，注册失败不会影响在线工具正常工作。
- 批量压缩页和对应脚本属于核心离线资源；离线打开后仍只处理用户当次主动选择的本地文件。
- 批量压缩与批量元数据清理失败项可单独重试，不要求整批重新选择文件；重试结果仍只存在当前页面内存。

调试离线功能时应使用 HTTPS 生产地址，或自行在浏览器允许的本地安全上下文中验证；不要把“页面可离线打开”描述成“首次访问也完全不需要网络”。

## 站点配置

所有正式站点信息集中在 `site.config.json`。

```json
{
  "siteName": "图安工具",
  "shortName": "图安",
  "siteUrl": "https://example.com",
  "operatorName": "真实运营主体",
  "contactUrl": "https://example.com/contact",
  "repositoryUrl": "https://github.com/example/repo",
  "customDomain": "example.com",
  "currentVersion": "3.1.0",
  "projectStarted": "2026-08-24",
  "lastModified": "YYYY-MM-DD",
  "pageLastModified": {
    "/": "YYYY-MM-DD"
  },
  "pagePublished": {
    "/guides/example/": "YYYY-MM-DD"
  },
  "productionReady": false
}
```

配置规则：

- `siteUrl` 必须是最终公开地址；GitHub Pages 项目站需要包含仓库子路径；
- `operatorName` 应填写真实、可持续维护的主体名称；
- `contactUrl` 应长期有效，不要使用临时链接；
- `repositoryUrl` 用于 About 页面和 Organization structured data；
- `customDomain` 未使用自定义域名时留空；
- `pageLastModified` 必须覆盖每一个可索引公开 URL，只在页面正文、功能或事实说明发生实质变化时更新；
- `pagePublished` 记录指南首次发布日期，发布后不要随版本构建重写；
- `currentVersion` 与 `package.json` 的发布版本保持一致；
- `projectStarted` 记录项目首次公开日期；
- `lastModified` 必须等于所有公开页面中最新的实质内容修改日期；
- `productionReady` 必须是 JSON 布尔值。只有上线信息全部核对完成后才能设为 `true`。

不要为了“显得新”每天刷新 `lastModified`。只有正文、功能、事实说明或其他会影响用户理解的内容发生实质变化时才更新对应日期。

## 新增工具页面

新增工具时至少需要同步：

1. 在 `scripts/generate.mjs` 的工具配置中定义名称、slug、描述、脚本和应用类别；
2. 增加对应工具 UI 和前端脚本；
3. 在 `site.config.json > pageLastModified` 增加 URL；
4. 加入合适的首页、正文或相关工具内链；
5. 为真实搜索意图写独立页面说明，不复制其他工具页的固定 FAQ 模板；
6. 在 `tests/` 与 `scripts/check.mjs` 中增加需要长期保证的 DOM/逻辑约束；
7. 运行 `npm run stage`。

不要仅为 50KB、100KB、200KB 等数字创建正文几乎相同的独立落地页。只有搜索意图、功能默认值、案例和解决方案都足够独立时，才适合拆分 URL。

## 新增指南

指南应该解决一个独立问题，而不是承担关键词占位作用。

新增时：

1. 在生成器中定义 `kind: "article"`、`path`、H1、title、description 和正文；
2. 将 URL 加入 `pageLastModified`；
3. 从至少一个相关工具页或指南中心提供上下文内链；
4. 如果内容涉及浏览器能力、格式规范、政策、价格或其他会变化的信息，优先引用官方或一手来源；
5. 检查文章是否真的比现有页面多解决了一个问题；
6. 不强制添加 FAQ、总结或固定小标题模板。

文章页面会自动生成 Article、Breadcrumb structured data，同时输出 `datePublished`、`dateModified`，并在前台区分首次发布与实质更新时间。

### 批量 ZIP

批量压缩和批量元数据清理的 ZIP 由本站自己的无压缩 ZIP 生成逻辑在浏览器内存中创建，不依赖第三方打包库。ZIP 和其中的图片结果不得写入 Cache Storage、IndexedDB 或 Analytics。

## 核心任务流：按上传要求处理

`/photo-requirements/` 是 v3.0 的核心差异化页面，面向已经拿到明确平台要求的用户。它把原本需要依次进入“尺寸 → 格式 → 压缩”的操作合并为一次处理。

设计边界：

- 用户必须自己填写目标平台给出的宽度、高度、最大 KB 和格式；
- 示例参数只用于演示输入，不代表统一报名照标准；
- JPG / WebP 会在固定目标尺寸下搜索尽量高的可接受质量；
- PNG 不伪造“质量压缩”能力，如果固定尺寸与 PNG 格式下仍超过 KB 上限，会明确提示无法保证达到；
- “全部满足”只代表本页填写的技术条件满足，不代表第三方平台一定接受；
- 用户填写的宽高、KB、格式与其他处理参数不得加入 Analytics。

## SEO 与 GEO 设计

项目当前自动处理：

- 每页唯一的 title、description、H1 和 canonical；
- `index/follow` 与开发环境 `noindex`；
- sitemap 的逐页 `lastmod`；
- Organization、WebSite、WebApplication、CollectionPage、Article、BreadcrumbList 等 JSON-LD；
- Open Graph 与 Twitter 分享元数据；
- 首页工具 ItemList；
- 可抓取的普通 `<a href>` 内链；
- `OAI-SearchBot` 允许规则；
- 指南可见更新时间和分享按钮。

内容原则：

- 先回答真实用户问题，再考虑关键词；
- 工具页负责“完成任务”，指南页负责“解释问题”；
- 优先给出数字、限制、例子、失败条件和判断方法；
- 不机械要求每个页面有 FAQ；
- 不在前台暴露 SEO 计划、编辑备注、维护记录或内容策略；
- 不声称任何结构化数据、robots 规则或 AI crawler 配置能够保证排名或被 AI 引用。

上线后应使用 Google Search Console / Bing Webmaster Tools 检查真实抓取和索引状态，而不是只根据 `site:` 查询判断。

## 隐私与第三方服务

图片处理脚本不调用 `fetch`、`XMLHttpRequest`、`WebSocket` 或 `sendBeacon` 上传用户图片。图片主要在浏览器内存、Canvas 和 Blob URL 中处理。

站点当前使用 Google Analytics 4。除页面访问外，只允许以下工具/内容动作事件。图片检查器只发送动作名和 `tool_name=inspect`，按上传要求处理只发送 `tool_name=photo-requirements`，批量压缩只发送 `tool_name=batch-compress`；不会发送检测出的 KB、像素、文件数量、文件名、宽高比、格式或用户填写的目标参数：

- `tool_file_selected`
- `tool_run`
- `tool_success`
- `tool_download`
- `tool_cancel`
- `guide_share`
- `guide_copy_link`

工具事件只附带受白名单限制的工具名称。**禁止**把以下信息加入 Analytics、自定义广告脚本或其他第三方请求：

- 文件名；
- 图片二进制内容、Data URL、Blob；
- EXIF / GPS 内容；
- 水印文字；
- 用户填写的输出参数；
- Canvas 像素；
- 下载后的文件。

首页存在一个静态推广横幅。它由本站 HTML/CSS 渲染，不嵌入第三方 iframe、图片或脚本；只有用户主动点击时才打开第三方网站。

### 友情链接

友情链接集中放在 `/friends/` 页面，首页页脚只保留“友情链接”入口。该页面使用 `noindex,follow`，仅使用普通 HTML 外链，不加载对方脚本、图片或 iframe：

- [次元工具箱](https://ciyuan-toolbox.pages.dev/)
- [VPN指南](https://agoodvpn.github.io/vpn-guide/)
- [次元口袋](https://jigen-pocket.proud-2531.chatgpt.site/)

友情链接页中的外链使用 `target="_blank"` 与 `rel="noopener noreferrer"`。除非存在真实赞助或付费关系，否则不要使用 `rel="sponsored"`；若未来链接性质发生变化，应同步调整链接属性与相关说明。


新增任何第三方脚本前，必须先阅读并更新 `INTEGRATIONS.md`、隐私政策和 CSP。工具页中的第三方 JavaScript 理论上可以读取用户已经选择的文件信息或 Canvas，因此默认不允许随意增加统计、客服、广告或 A/B 测试 SDK。

## 安全说明

当前 HTML 使用 CSP 限制脚本、连接、对象和 frame 来源，并使用 `referrer=no-referrer` 减少外链时泄露当前页面地址。

需要注意：`frame-ancestors` 不能通过 HTML `<meta>` CSP 实现。如果正式站点要求严格禁止被第三方 iframe 嵌入，应在 CDN / 反向代理 / 可设置响应头的托管层发送：

```text
Content-Security-Policy: frame-ancestors 'none'
```

也可以同时评估适合部署环境的 `X-Content-Type-Options`、`Permissions-Policy` 等响应头。不要在不了解兼容性和实际资源依赖时直接复制一套安全头到生产环境。

## GitHub Pages 部署

仓库工作流位于：

```text
.github/workflows/pages.yml
```

推荐流程：

1. 修改代码和配置；
2. 本地运行 `npm run stage`；
3. 提交 Pull Request；
4. PR 自动执行构建和检查；
5. 合并到 `main` 后，Actions 再次生成 `_site` 并部署；
6. 在站长平台检查 sitemap、canonical 和核心 URL 索引状态。

**只部署 `_site/`。** 不要配置成从仓库根目录发布，否则 README、测试、维护说明和其他不应公开的文件也可能成为静态资源。

### GitHub Pages 项目子路径

如果网站位于：

```text
https://username.github.io/repository/
```

`siteUrl` 必须包含 `/repository`。生成器会给站内资源、导航和 404 链接加正确 base path。

项目站自己的 `robots.txt` 位于子路径，不能代替主机根目录 `https://username.github.io/robots.txt` 的规则。项目站仍应依赖页面 robots 元数据、canonical 和站长平台 sitemap 提交来管理收录。

## 自定义域名

建议在站点开始积累外链和品牌搜索前确定稳定域名，避免后续迁移增加重定向和 canonical 管理成本。

GitHub Pages 使用自定义域名时建议：

1. 先验证域名所有权并保留验证记录；
2. 再在 Pages 设置添加自定义域名；
3. 配置精确 DNS，不使用不必要的通配符记录；
4. DNS 生效后启用 HTTPS；
5. 确认 `siteUrl`、`customDomain`、canonical、sitemap 和站长平台属性全部切换；
6. 如果旧地址已有收录，制定迁移和重定向方案，不要仅靠改 canonical。

- 批量工具支持在处理前逐张移除已选有效图片；运行期间会锁定选择列表。

## 发布前检查清单

每次正式发布至少确认：

- [ ] `siteUrl`、运营主体、联系地址正确；
- [ ] 新增公开 URL 已加入 `pageLastModified`；
- [ ] `lastModified` 等于最新页面的实质更新日期；
- [ ] 页面没有编辑备注、SEO 操作说明或测试文案；
- [ ] 事实、日期、产品能力和示例没有过期；
- [ ] 新内容没有与旧页面重复搜索意图；
- [ ] 工具在手机和桌面至少各跑一次真实文件；
- [ ] 下载结果重新打开后正常；
- [ ] 隐私政策与实际第三方服务一致；
- [ ] `npm run stage` 全部通过；
- [ ] `_site/` 是本次真正准备部署的产物。

更细的人工测试见 `TEST-CHECKLIST.md`。

## 维护原则

- 不直接编辑 `_site/`；
- 不手工修改构建生成的 canonical、sitemap 或资源 hash；
- 不因为 SEO 需求而牺牲事实准确性；
- 不把“浏览器本地处理”写成“完全不联网”；
- 不用固定 FAQ 数量或统一文章模板；
- 不创建只有关键词或数字变化的批量薄页；
- 对政策、价格、浏览器兼容性、第三方产品功能等易变信息，上线前重新核对；
- 先看 Search Console、Analytics 的真实数据，再决定扩哪类页面。

## 版本与变更

版本号见 `package.json`，重要改动记录在 `CHANGELOG.md`。

本仓库的 README、测试、配置和维护文档不会进入正常 Pages 发布产物；`scripts/stage.mjs` 仅按生成的逐文件白名单复制公开文件。

## License

许可证见 `LICENSE`。


## 搜索数据驱动的内容维护

站点进入稳定运营后，不应继续凭感觉批量增加文章或尺寸/KB 落地页。优先根据 Google Search Console 的真实查询词、展示量、排名和点击率决定：扩充现有页面、调整标题，还是创建新的独立搜索意图页面。工具页负责“完成任务”，指南页负责“解释问题”，两者标题和正文应长期保持清楚边界。
