# 隐私、安全与 PWA

## 本地图片处理

图片主要在浏览器内存、Canvas 和 Blob URL 中处理。工具代码不应通过 `fetch`、`XMLHttpRequest`、`WebSocket` 或 `sendBeacon` 上传用户图片。

本地处理不等于页面完全离线：HTML、CSS、JS、图标和 Analytics 仍可能产生网络请求。

## Analytics

具体事件白名单与第三方服务规则以 `INTEGRATIONS.md` 为准。

任何统计、广告、客服或实验脚本都不得接收：

- 文件名；
- 图片二进制、Data URL 或 Blob；
- EXIF / GPS 内容；
- 水印文字；
- 用户填写的宽高、KB、格式、裁剪焦点等输出参数；
- Canvas 像素；
- 下载后的文件。

新增第三方脚本前必须同时检查 `INTEGRATIONS.md`、隐私政策和 CSP。

## PWA 与离线缓存

生产构建生成 `manifest.webmanifest` 和 `service-worker.js`。

缓存边界：

- 只缓存本站同源公开资源；
- 不缓存 Google Analytics 或其他第三方请求；
- 不缓存用户选择的本地图片、Canvas 像素、Blob URL、Data URL、ZIP 或处理结果；
- 导航请求优先尝试网络，失败后才使用已缓存页面；
- 新版本 Service Worker 下载完成后提示用户“刷新使用新版”，允许选择“稍后”；
- 网络断开时页面显示离线状态，恢复联网后自动隐藏；
- 安装入口只在浏览器实际满足 PWA 安装条件时出现；
- Service Worker 注册失败不能阻止在线工具工作。

“可以离线再次打开核心工具”不能写成“首次访问完全不需要网络”。

## ZIP

批量压缩与批量元数据清理使用本站自己的无压缩 ZIP 逻辑在浏览器内存中生成。ZIP 与内部图片不得写入 Cache Storage、IndexedDB 或 Analytics。

## 元数据和匿名性

“重新编码减少元数据传播”不等于“完全匿名”。画面中仍可能包含人脸、门牌、文件编号、二维码或其他可识别信息。

JPEG EXIF 查看器只解析有限的常见字段。PNG / WebP 当前不应宣传为完整 EXIF/XMP/ICC 分析器。

## CSP 与外部内容

第三方赞助与友情链接默认只使用普通 HTML 链接，不加载对方 iframe、图片或脚本。

HTML `<meta>` CSP 不能实现 `frame-ancestors`。如需严格禁止第三方 iframe 嵌入，应在托管层设置响应头。
