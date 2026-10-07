# SEO / GEO 与内容维护

这份文档记录搜索、AI 搜索和内容维护约束。它不是前台文案模板。

## 页面职责

- 工具页负责“完成任务”；
- 指南页负责“解释问题”；
- 如果两个页面长期覆盖同一批查询，应优先重写标题、H1 和正文边界，而不是机械增加更多关键词；
- 不创建只有数字、格式名称或关键词变化的批量薄页。

例如：

- `/photo-requirements/` 应聚焦“直接调整报名照片”；
- `/guides/photo-requirements/` 应聚焦“怎么看懂像素、KB、比例和格式要求”。

## 自动生成的搜索元数据

当前生成器负责：

- title、description、H1 与 canonical；
- 正式环境 index/follow 与开发环境 noindex；
- sitemap 与逐页 `lastmod`；
- Organization、WebSite、WebApplication、CollectionPage、Article、BreadcrumbList 等 JSON-LD；
- Open Graph / Twitter 元数据；
- 首页工具 ItemList；
- 普通 `<a href>` 内链；
- OAI-SearchBot 允许规则。

不要为了 GEO 额外堆 FAQ Schema、隐藏文本或虚构结构化数据。

## 发布日期与更新时间

`pagePublished` 记录指南首次发布日期，发布后不要因为版本构建而重写。

`pageLastModified` 只在正文、功能、事实说明或其他会影响用户理解的内容发生实质变化时更新。

不要为了“显得新”统一刷新全站日期。

`lastModified` 应等于所有公开可索引页面中最新的实质修改日期。

## 内容原则

- 先回答真实用户问题，再考虑关键词；
- 优先提供数字、限制、例子、失败条件、比较与判断方法；
- 有条件时加入工具实测或第一手示例，而不是改写通用知识；
- 不机械要求每篇文章有 FAQ、总结、固定 H2 或统一结尾；
- 不在前台出现编辑说明、内容策略、SEO 计划、核验记录或“为什么这样写”一类幕后表达；
- 不声称 robots、Schema 或 AI crawler 配置能保证排名或被 AI 引用；
- 涉及政策、价格、浏览器兼容性、第三方产品功能等易变信息时，上线前重新核对。

## AI 搜索抓取

当前 robots 明确允许 `OAI-SearchBot`。这用于搜索发现与引用，不代表一定会被引用或获得排名。

如果未来要调整其他 AI crawler，例如 GPTBot，应作为明确的内容治理决策单独处理，不要把训练抓取和搜索引用混为一谈。

## Search Console 驱动迭代

站点进入稳定运营后，优先根据真实查询数据决定是否改页面：

- 有展示、排名 8–30：优先扩充已有页面或强化标题/内容；
- 有展示但 CTR 很低：检查 title、description 与搜索意图是否匹配；
- 两个页面长期竞争同一查询：重写职责边界或必要时合并；
- 没有数据支撑时，不要凭感觉批量创建尺寸、KB 或格式落地页。

`site:` 查询只能作为辅助观察，实际索引状态以站长平台 URL Inspection、sitemap 与 Performance 数据为准。

## 友情链接与赞助

友情链接集中在 `/friends/`，首页只保留入口。该页使用 `noindex,follow`，不进入 sitemap。

首页赞助位应避免压过核心工具与指南内容。付费或赞助链接必须使用与真实关系相符的链接属性。
