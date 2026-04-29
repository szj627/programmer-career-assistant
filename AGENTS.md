# 程序员求职助手 for Codex

本项目仅支持 Codex。所有输出默认使用中文，目标场景是中国大陆程序员在招聘平台上求职。

## 核心定位

- 目标岗位优先级：Agent 开发工程师 > 全栈工程师 > 后端工程师。
- 第一阶段平台：BOSS 直聘半自动读取 + 批量 JD URL 导入。
- 主要产物：中文职位评估报告、中文 ATS 简历 PDF、申请 tracker、pipeline。
- 不维护 Claude、Gemini、OpenCode、海外公司官网扫描或英文简历流程。

## 必须遵守

- 不自动投递，不自动开聊，不自动发送消息。
- 不绕验证码，不规避平台登录或风控。
- BOSS 直聘页面由用户自行登录，Codex 只读取页面可见 JD。
- JD 未体现的内容不扣分，统一标记为 `未说明/需确认`。
- 简历必须 ATS 友好：单栏、文本可复制、无正文图片化、无复杂图形。
- 不编造经历、指标、项目、公司、学历或证书。

## 路由

- 用户粘贴 JD URL 或 JD 文本：读取 `modes/_shared.md` + `modes/auto-pipeline.md`。
- 用户要求评估职位：读取 `modes/_shared.md` + `modes/oferta.md`。
- 用户要求导入 URL：运行或参考 `scan.mjs` + `modes/scan.md`。
- 用户要求半自动扫描 BOSS：先用 `boss-login.mjs` 获取 Cookie，再运行或参考 `boss-scan.mjs` + `modes/scan.md`，最后按 `modes/oferta.md` 评估保存的 JD。
- 用户要求处理 pipeline：读取 `modes/_shared.md` + `modes/pipeline.md`。
- 用户要求生成简历 PDF：读取 `modes/_shared.md` + `modes/pdf.md`。
- 用户要求查看申请状态：读取 `modes/tracker.md`。

## 数据规则

- `cv.md` 是简历事实来源。
- `config/profile.yml` 是候选人偏好和联系方式来源。
- `modes/_profile.md` 可保存候选人个性化补充。
- 新 tracker 行先写入 `batch/tracker-additions/*.tsv`，再运行 `node merge-tracker.mjs`。
- 不直接向 `data/applications.md` 添加新行；更新已有行状态和备注可以直接编辑。

## 验证

修改后至少运行：

```bash
node --check scan.mjs
node --check boss-login.mjs
node --check boss-scan.mjs
npm run verify
```
