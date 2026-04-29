# 扫描和 URL 导入模式

第一阶段不做公司官网扫描。扫描模式只处理招聘平台 URL 导入，BOSS 直聘页面读取由 Codex 半自动完成。

## 支持命令

```bash
node scan.mjs --file urls.txt
node scan.mjs --urls "url1;url2;url3"
node scan.mjs --file urls.txt --dry-run
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
