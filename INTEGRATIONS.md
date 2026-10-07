# 统计与广告接入边界

当前站点加载 Google Analytics 4，并在首页展示一个指向 `https://huyuejsq.co/` 的静态推广横幅。横幅只使用本站 HTML/CSS，不加载推广方脚本、图片或 iframe。增加或更换第三方服务前，应先更新隐私政策、CSP 和本文件，并完成适用的数据处理与同意机制评估。

## 不可破坏的隐私边界

第三方 `<script>` 即使来自其他域名，也会在当前页面上下文中执行。工具页中的文件名、图片预览、Canvas、Blob URL、水印文字和 EXIF 表格都可能被同页脚本读取。

因此：

- 不在工具工作区页面直接加载广告联盟、客服、热力图或 A/B 测试 SDK；
- 不允许标签管理器任意注入未审核的新脚本；
- 不把文件对象、Canvas、Data URL、Blob 或 Blob URL 暴露给统计回调；
- Content Security Policy 只允许本站脚本和已明确列出的 Google Analytics 资源；
- 需要严格防嵌入时，在 CDN 或托管层发送 `Content-Security-Policy: frame-ancestors 'none'`；
- 如未来必须展示第三方广告，应优先使用跨域、最小权限且经过实际验证的隔离方案；
- 不把同源内容同时授予 `allow-scripts` 与 `allow-same-origin` 后当作可靠隔离。

## 当前允许的 Analytics 事件

当前代码只允许以下自定义事件：

- `tool_file_selected`：用户已经选择一个受支持的本地图片；
- `tool_run`：用户主动开始处理；
- `tool_success`：本次处理成功产生结果；
- `tool_download`：用户主动下载结果；
- `tool_cancel`：用户主动停止批量处理，只附带工具名称；
- `guide_share`：用户通过浏览器系统分享功能分享指南；
- `guide_copy_link`：系统分享不可用时，用户复制指南链接。

工具事件只允许附带经过格式白名单限制的 `tool_name`。指南分享事件不附带用户输入参数。

禁止发送：

- 原文件名；
- 图片内容、Data URL、Canvas 像素；
- Blob / Blob URL；
- EXIF、GPS 或其他元数据值；
- 水印文字；
- 用户填写的尺寸、KB、背景色等输出参数；
- 自由文本错误信息；
- 下载后的文件。

如果未来确实需要新增事件，应先回答两个问题：这个事件是否直接帮助判断产品使用效果？是否可以完全不接触图片内容和用户自由文本？任一答案为否，都不应接入。

## 当前推广位置

静态推广横幅只出现在首页工具列表之后。核心工具页、隐私页和指南页不展示推广横幅。

如未来调整，优先保持以下原则：

1. 不靠近上传区、参数控件、处理按钮或下载按钮；
2. 不伪装成工具结果、系统提示或导航；
3. 明确标注“推广”，外链继续使用 `rel="sponsored noopener noreferrer"`；
4. 不加载推广方脚本、图片或 iframe；
5. 预留稳定尺寸，避免布局跳动和移动端误触。

## 新增第三方服务的上线门槛

接入前必须完成：

- 明确提供方、域名、脚本/请求清单和数据流；
- 判断服务是否可能读取文件名、Canvas、Blob、EXIF 或用户自由输入；
- 更新 CSP、README、隐私政策和本文件；
- 如果适用，补充同意、退出或关闭机制；
- 在浏览器 Network 面板验证没有文件内容或敏感字段请求；
- 检查移动端性能、布局跳动和误触；
- 明确供应商故障、撤回或停用时如何快速移除；
- 重新运行 `npm run stage`。

## 生产响应头

HTML 中的 CSP `<meta>` 只能覆盖部分策略。`frame-ancestors` 必须通过 HTTP 响应头发送；不要使用无效的 `<meta http-equiv="X-Frame-Options">` 代替。

如果以后从纯 GitHub Pages 迁移到可配置响应头的 CDN 或静态托管平台，可再评估 `X-Content-Type-Options`、`Permissions-Policy`、缓存策略等响应头，但应以实际资源和浏览器兼容性测试为准。


## Service Worker 与离线缓存

`service-worker.js` 只允许缓存本站同源公开 HTML、CSS、JavaScript 和图标。不要把 Google Analytics、友情链接、推广站点或任何用户选择/生成的图片加入预缓存列表。运行时缓存也只能处理同源 GET 请求。

用户文件、Canvas 数据、Blob URL、Data URL、EXIF/GPS 内容和导出文件不得写入 Cache Storage、IndexedDB 或其他持久化存储。


## 批量 ZIP

批量压缩和批量元数据清理可在浏览器内存中生成 ZIP。ZIP 不是网络集成：禁止上传、持久缓存或把文件名/文件内容写入 Analytics 参数。
