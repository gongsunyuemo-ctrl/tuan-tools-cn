# 部署与域名迁移

## GitHub Pages

工作流位于 `.github/workflows/pages.yml`。

推荐流程：

1. 修改代码和配置；
2. 本地运行 `npm run stage`；
3. 提交 Pull Request；
4. PR 自动执行构建和检查；
5. 合并到 `main` 后重新生成 `_site` 并部署；
6. 上线后在站长平台检查 sitemap、canonical 和核心 URL。

**只部署 `_site/`。** 不要从仓库根目录发布，否则 README、测试和维护文档可能成为公开静态资源。

## GitHub Pages 项目子路径

如果网站位于：

```text
https://username.github.io/repository/
```

`siteUrl` 必须包含 `/repository`。生成器会为站内资源、导航和 404 链接应用正确 base path。

项目站自己的 `robots.txt` 位于子路径，不能替代主机根目录 `https://username.github.io/robots.txt`。项目站仍应依赖页面 robots 元数据、canonical 与站长平台 sitemap 提交管理收录。

## productionReady

开发或测试环境应保持：

```json
"productionReady": false
```

此时生成页面使用 `noindex`，`robots.txt` 也会阻止抓取。

只有正式 URL、运营主体、联系地址、Analytics、canonical、sitemap 和法律/隐私页面全部确认后再切换为 `true`。

## 自定义域名

如果迁移到自定义域名：

1. 验证域名所有权并保留验证记录；
2. 在托管平台添加域名；
3. 配置精确 DNS，避免不必要的通配符；
4. DNS 生效后启用 HTTPS；
5. 更新 `siteUrl`、`customDomain`、canonical、sitemap 和站长平台属性；
6. 如果旧地址已经有收录或外链，规划真实重定向，不要只依赖 canonical；
7. 重新运行 `npm run stage` 并检查生产产物。

## 响应头

HTML `<meta>` CSP 不能设置 `frame-ancestors`。如果部署环境支持响应头，可以根据实际需要评估：

```text
Content-Security-Policy: frame-ancestors 'none'
```

以及 `X-Content-Type-Options`、`Permissions-Policy` 等安全头。不要在不了解资源依赖与浏览器兼容性时直接复制模板到生产环境。

## 发布前检查

至少确认：

- `siteUrl`、运营主体、联系地址正确；
- 新增公开 URL 已加入页面日期配置；
- 页面没有编辑备注、SEO 操作说明或测试文案；
- 事实、日期、产品能力和示例没有过期；
- 新内容没有明显重复搜索意图；
- 工具在手机和桌面至少各跑一次真实文件；
- 下载结果能重新打开；
- 隐私政策与实际第三方服务一致；
- `npm run stage` 全部通过；
- `_site/` 是真正准备部署的产物。

更细的人工项目见 `TEST-CHECKLIST.md`。
