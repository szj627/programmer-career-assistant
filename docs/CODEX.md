# Codex 使用说明

程序员求职助手只支持 Codex。Codex 应读取根目录 `AGENTS.md`，并复用仓库内的 modes、脚本、模板和 tracker 流程。

## 环境要求

- Node.js 18+
- Playwright Chromium
- Codex 可访问当前工作区

安装：

```bash
npm install
npx playwright install chromium
npm run doctor
```

## 推荐用法

```text
评估这个 BOSS 直聘 JD，并生成中文报告和中文 ATS 简历。
把 urls.txt 里的岗位 URL 导入 pipeline。
处理 data/pipeline.md 里的待评估 URL。
根据这个 JD 生成中文 ATS 简历 PDF。
```

## 路由表

| 用户意图 | Codex 应读取 |
| --- | --- |
| JD URL 或 JD 文本 | `modes/_shared.md` + `modes/auto-pipeline.md` |
| 单个职位评估 | `modes/_shared.md` + `modes/oferta.md` |
| URL 导入或扫描 | `modes/_shared.md` + `modes/scan.md` |
| pipeline 处理 | `modes/_shared.md` + `modes/pipeline.md` |
| 中文 ATS PDF | `modes/_shared.md` + `modes/pdf.md` |
| 申请辅助 | `modes/_shared.md` + `modes/apply.md` |
| tracker 状态 | `modes/tracker.md` |

## 平台规则

- BOSS 直聘采用半自动浏览器模式：用户自行登录，Codex 只读取页面可见 JD。
- 不绕验证码，不自动开聊，不自动投递。
- 如果页面不可读，改用 `node scan.mjs --file urls.txt` 或 `node scan.mjs --urls "url1;url2"` 导入 URL。

## 验证

```bash
npm run doctor
npm run verify
node test-all.mjs --quick
```
