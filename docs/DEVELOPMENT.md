# 开发与页面维护

这份文档用于维护图安工具的生成器、工具页面、指南和自动检查。公开项目介绍请看根目录 `README.md`。

## 基本原则

- 不直接编辑 `_site/`；
- 不把生成后的 HTML 当作长期内容源；
- 页面内容优先修改 `scripts/generate.mjs`、`site.config.json` 和 `assets/`；
- 新功能必须同步补充必要的自动检查与真实设备测试；
- 不为了统一外观强迫每个页面拥有 FAQ、总结或固定小标题。

## 项目结构

```text
assets/                 浏览器端样式、图片和工具脚本
scripts/config.mjs      站点配置验证
scripts/generate.mjs    HTML、robots、sitemap、PWA 等生成
scripts/check.mjs       页面、链接、Schema、JS 与发布一致性检查
scripts/stage.mjs       白名单复制到 _site
tests/run.mjs           核心图片逻辑与边界测试
site.config.json        公开站点配置与页面日期
```

## 开发命令

```bash
npm run build
npm run test
npm run check
npm run stage
npm run check:stage
```

正式发布前使用 `npm run stage`。

## 新增工具页面

新增工具时至少同步：

1. 在生成器的工具配置中定义名称、slug、description、脚本和应用类别；
2. 增加 UI 与浏览器端脚本；
3. 在 `site.config.json > pageLastModified` 增加 URL；
4. 从首页、相关工具或指南提供自然内链；
5. 只写和该工具真实搜索意图相关的说明，不复制其他工具页固定模板；
6. 在 `tests/` 和 `scripts/check.mjs` 中增加需要长期保证的 DOM/逻辑约束；
7. 运行 `npm run stage`。

工具页负责“完成任务”。不要仅为 50KB、100KB、200KB 等数字创建正文几乎相同的独立页面。

## 新增指南

指南应该解决一个独立问题，而不是承担关键词占位作用。

新增时：

1. 在生成器中定义 `kind: "article"`、path、H1、title、description 与正文；
2. 在 `pagePublished` 写入真实首次发布日期；
3. 在 `pageLastModified` 写入当前实质更新时间；
4. 从相关工具页或指南中心提供上下文内链；
5. 涉及浏览器能力、格式规范、政策、价格或第三方产品能力时，优先核对官方或一手来源；
6. 检查它是否真正比已有页面多解决了一个问题；
7. 不机械添加 FAQ、总结或统一模板。

## 批量工具

批量压缩和批量元数据清理当前限制为：

- 一次最多 10 张；
- 所选文件总大小不超过 80 MB；
- 顺序处理，降低同时解码大量图片的内存压力；
- 可停止并保留已完成结果；
- 失败项可单独重试；
- 处理前可以逐张移除有效文件；
- ZIP 在浏览器内存中生成，不写入 Cache Storage 或 IndexedDB。

## 按上传要求处理

`/photo-requirements/` 是当前核心任务流：宽高、KB、格式和构图一次完成。

维护时必须保留这些边界：

- 参数由用户根据目标平台规则填写；
- 示例参数不能宣传成统一标准；
- JPG / WebP 在固定尺寸下搜索尽量高的可接受质量；
- PNG 如果固定尺寸下仍超出 KB 上限，应明确提示未满足，而不是伪造“质量压缩”；
- “全部满足”只代表用户填写的技术条件满足；
- 用户填写的具体处理参数不能加入 Analytics。

## 配置与版本

`site.config.json` 的 `currentVersion` 应与 `package.json` 保持一致。`operatorName` 应使用真实、可长期维护的主体名称。

版本变更记录在 `CHANGELOG.md`。纯文档整理如果不改变公开网站行为，可以不单独提升产品版本。
