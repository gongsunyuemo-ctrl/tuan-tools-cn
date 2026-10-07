# 图安工具

图安工具是一个面向中文用户的开源静态图片工具站。核心图片处理在浏览器本地完成，不要求注册账号，也不设置图片上传接口。

当前重点解决两类问题：

- **已经拿到平台要求**：填写目标宽高、最大 KB、输出格式和构图方式，一次完成尺寸、格式与体积处理；
- **不知道图片哪里不符合要求**：先检查格式、文件大小、像素、宽高比、方向、透明像素和预计解码内存，再选择合适的处理工具。

在线地址：<https://gongsunyuemo-ctrl.github.io/tuan-tools-cn/>

> 本地处理不等于页面完全离线。页面资源仍由托管平台提供，站点使用 Google Analytics 4 统计基础访问和不含图片内容的工具动作。隐私边界见 [隐私与安全文档](docs/PRIVACY-SECURITY.md)。

## 核心能力

- 按平台要求一次处理图片尺寸、格式和文件大小；
- 单张 / 批量压缩到目标 KB，支持前后对比、失败重试和 ZIP 下载；
- 图片检查、JPEG 常见 EXIF 查看，以及单张 / 批量元数据清理；
- 证件与资料图片用途水印；
- 图片尺寸修改、裁剪和常用尺寸预设；
- JPG / PNG / WebP 格式转换；
- PWA 安装与核心工具离线再次访问；
- 围绕图片大小、像素、格式、上传失败和照片隐私的使用指南。

## 核心任务流：按上传要求处理

`/photo-requirements/` 是当前最主要的一站式入口。用户把目标平台给出的要求填进页面后，工具会在浏览器本地完成尺寸调整、构图、格式转换和文件大小控制，并逐项显示结果是否满足。

设计边界：

- 用户应以目标平台公布的宽度、高度、最大 KB 和格式要求为准；
- 页面里的示例参数只用于演示，不代表统一报名照标准；
- JPG / WebP 会在固定目标尺寸下寻找尽量高且满足大小上限的质量；
- PNG 不伪造“质量压缩”能力，如果固定尺寸与 PNG 格式下仍超过上限，会明确提示未满足；
- “全部满足”只表示本页填写的技术条件满足，不代表第三方平台的人脸、背景、DPI、命名等业务规则一定通过。

## 功能与边界

| 能力 | 当前实现 | 主要边界 |
| --- | --- | --- |
| 按上传要求处理 | 宽高、最大 KB、格式、构图和裁剪焦点一次处理 | 只核对用户填写的技术条件 |
| 图片检查 | 格式、文件大小、像素、宽高比、方向、透明像素、预计解码内存 | 不做内容识别，也不替代第三方平台规则 |
| 指定 KB 压缩 | 调整编码质量，必要时逐步缩小像素，并提供原图/结果对比 | 无法保证任意图片都能在可接受画质下达到极小目标 |
| 批量图片压缩 | 最多 10 张、总大小 80 MB、逐张处理、进度/停止/重试、ZIP 下载 | 关键图片仍建议单独检查画质 |
| 批量元数据清理 | 最多 10 张、重新编码、进度/停止/重试、ZIP 下载 | 不是彻底匿名工具，重新编码也可能改变体积、色彩和细节 |
| 图片水印 | 单个/平铺、角度、透明度、颜色、自动换行 | 只能降低直接挪用便利度，不能阻止裁剪或修复 |
| 尺寸修改 | 等比、完整适应、定位裁剪、拉伸 | 放大不能恢复原本不存在的细节 |
| 格式转换 | JPG / PNG / WebP | JPG 不支持透明；重新编码可能改变元数据与色彩表现 |
| EXIF 查看/清除 | 查看有限的常见 JPEG EXIF；JPG / PNG / WebP 可重新编码生成新文件 | PNG / WebP 当前不做完整 EXIF/XMP/ICC 解析 |

通用单文件限制：静态 JPG、PNG、WebP；最大 30 MB；单边最大 8192 像素；总像素最多 2400 万。实际可处理上限还取决于浏览器和设备内存。

## 隐私设计

图片主要在浏览器内存、Canvas 和 Blob URL 中处理。工具代码不会主动把用户图片、文件名、EXIF/GPS 内容、水印文字、输出参数或处理结果发送给 Analytics。

PWA 的离线缓存只保存本站公开页面、脚本、样式和图标，不持久缓存用户选择或生成的图片。

更完整的第三方服务、Analytics、PWA 缓存和安全约束见：

- [隐私与安全](docs/PRIVACY-SECURITY.md)
- [第三方集成规则](INTEGRATIONS.md)

## 技术概览

项目没有运行时后端，也不依赖前端框架。

```text
.
├── assets/                 # CSS、图片与浏览器端工具脚本
├── scripts/                # 配置验证、页面生成、检查与发布 staging
├── tests/                  # 图片边界与核心逻辑测试
├── docs/                   # 开发、部署、SEO/GEO、隐私与安全文档
├── site.config.json        # 正式站点配置与页面日期
├── INTEGRATIONS.md         # 第三方脚本与隐私隔离规则
├── TEST-CHECKLIST.md       # 上线前真实设备检查
├── CHANGELOG.md            # 版本变更
└── _site/                  # 生产部署产物；不要手工编辑
```

页面 HTML、`manifest.webmanifest`、`service-worker.js`、`robots.txt` 和 `sitemap.xml` 都由构建流程生成。**不要直接编辑 `_site/` 或生成后的页面文件**；内容修改应落在生成器、静态资源或配置中。

## 环境要求

- Node.js `>=22 <25`
- 无 npm 第三方依赖
- Python 3 仅用于下面示例中的本地静态服务器，构建本身不依赖 Python

## 快速开始

```bash
npm run build
npm run check
python3 -m http.server 8080
```

然后访问：

```text
http://localhost:8080/
```

正式发布前建议直接运行：

```bash
npm run stage
```

`stage` 会完成生产生成、测试、源码检查、复制 `_site/` 和生产目录二次检查。

## 常用命令

```bash
npm run build        # 生成 HTML、robots、sitemap、PWA 文件和发布清单
npm run test         # 运行核心逻辑与边界测试
npm run check        # 检查页面、链接、Schema、脚本、配置与测试
npm run stage        # 完整生产发布前流程
npm run check:stage  # 只检查 _site 生产目录
```

## 站点配置

正式站点信息集中在 `site.config.json`。最常维护的字段包括：

```json
{
  "siteName": "图安工具",
  "siteUrl": "https://example.com",
  "operatorName": "真实运营主体",
  "contactUrl": "https://example.com/contact",
  "repositoryUrl": "https://github.com/example/repo",
  "currentVersion": "3.1.5",
  "projectStarted": "2026-08-24",
  "productionReady": false
}
```

`operatorName` 应填写真实、可持续使用的个人、组织或项目主体，不要为了显得正式而虚构公司或团队。页面发布日期、实质更新时间、canonical、sitemap 和生产环境切换等详细规则见维护文档。

## 项目文档

- [开发与页面维护](docs/DEVELOPMENT.md)
- [部署与域名迁移](docs/DEPLOYMENT.md)
- [SEO / GEO 与内容维护](docs/SEO-GEO.md)
- [隐私、安全与 PWA](docs/PRIVACY-SECURITY.md)
- [第三方集成规则](INTEGRATIONS.md)
- [上线测试清单](TEST-CHECKLIST.md)
- [版本变更](CHANGELOG.md)

如果新增工具或指南，优先从 `docs/DEVELOPMENT.md` 开始；如果调整 canonical、sitemap、文章日期或搜索内容结构，阅读 `docs/SEO-GEO.md`；如果增加第三方脚本或改变缓存行为，必须同时检查 `docs/PRIVACY-SECURITY.md` 与 `INTEGRATIONS.md`。

## 部署

GitHub Pages 工作流位于 `.github/workflows/pages.yml`。发布时只部署 `_site/`，不要把仓库根目录作为 Pages 发布目录，否则 README、测试与维护文档也可能成为公开静态资源。

更完整的 GitHub Pages 子路径、自定义域名、HTTPS 与迁移注意事项见 [部署文档](docs/DEPLOYMENT.md)。

## License

许可证见 [LICENSE](LICENSE)。
