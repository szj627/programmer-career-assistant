# 扫描和 URL 导入模式

第一阶段不做公司官网扫描。扫描模式只处理招聘平台 URL 导入，BOSS 直聘页面读取由 Codex 半自动完成。

## 支持命令

```bash
node scan.mjs --file urls.txt
node scan.mjs --urls "url1;url2;url3"
node scan.mjs --file urls.txt --dry-run
node boss-login.mjs
node boss-login.mjs --manual
node boss-scan.mjs --limit 5
node boss-scan.mjs --url "https://www.zhipin.com/web/geek/jobs" --limit 5
node boss-scan.mjs --dry-run
```

## 文件规则

- 每行一个 URL。
- 空行跳过。
- `trim()` 后以 `#` 开头的整行是注释。
- 不支持行内 `#` 注释，避免破坏 URL fragment。

## 写入规则

导入后写入：

- `data/pipeline.md`
- `data/scan-history.tsv`

按完整 URL 去重。平台通过 hostname 识别：

- `*.zhipin.com` -> `boss`
- 其他 -> `unknown`

职位和公司可先记为 `待识别`，后续处理 pipeline 时打开 URL 补全。

## BOSS 直聘

用户自行登录。Codex 只读取页面可见 JD，不点击沟通、投递、发送，不绕验证码。

`boss-login.mjs` 打开可见浏览器，让用户手动登录并保存 BOSS Cookie 到 `.career-ops/boss-cookies.json`。如果浏览器登录助手不可用，可用 `--manual` 粘贴 Cookie JSON。

`boss-scan.mjs` 读取保存的 Cookie 后打开 BOSS 岗位列表页或详情页，只读取页面可见 JD、页面 Vue 状态或 `job/detail.json` 响应。扫描结果保存到 `jds/`，再通过 `scan.mjs` 将 URL 导入 `data/pipeline.md`。岗位评分和报告仍按 `modes/oferta.md` 由 Codex 完成，不在脚本里另建评分逻辑。

风险控制：默认最多 5 条；每条之间随机等待 2-5 秒；遇到登录失效、安全验证、403 或异常跳转立即停止，不重试、不继续扫描。
