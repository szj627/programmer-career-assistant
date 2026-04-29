# 程序员求职助手

面向程序员在中国大陆招聘平台求职的本地 Codex 工具。它用于读取招聘平台上的 JD，评估岗位匹配度，生成中文 ATS 简历，并维护申请记录。

第一阶段聚焦：

- BOSS 直聘半自动职位读取
- 批量导入 JD URL
- 中文职位评估报告
- 中文 ATS 简历 PDF
- 申请 tracker 和 pipeline 管理

默认岗位优先级：

1. Agent 开发工程师
2. 全栈工程师
3. 后端工程师

## 原则

- 只支持 Codex，不维护 Claude、Gemini、OpenCode 或旧 slash command 流程。
- 默认输出中文，不保留英文简历能力。
- JD 没写的内容不扣分，只标记为 `未说明/需确认`。
- 简历必须 ATS 友好：单栏、文本可复制、无正文图片化、无复杂图形。
- 不自动投递，不自动沟通，不绕验证码。用户必须最终确认所有申请动作。

## 安装

```bash
npm install
npx playwright install chromium
npm run doctor
```

需要准备：

- `cv.md`：你的中文简历，Markdown 格式
- `config/profile.yml`：从 `config/profile.example.yml` 复制后填写

## 常用命令

```bash
npm run doctor
npm run boss-scan -- --limit 5
npm run boss-scan -- --headless --url "https://www.zhipin.com/web/geek/job" --limit 5
npm run scan -- --file urls.txt
npm run scan -- --urls "https://www.zhipin.com/job_detail/a.html;https://www.zhipin.com/job_detail/b.html"
npm run verify
npm run pdf -- output/resume.html output/resume.pdf
```

## URL 批量导入

`scan.mjs` 现在是平台 URL 导入器，不再扫描公司官网或海外 ATS API。

支持两种输入：

```bash
node scan.mjs --file urls.txt
node scan.mjs --urls "url1;url2;url3"
```

文本文件规则：

- 每行一个 URL
- 空行跳过
- `trim()` 后以 `#` 开头的整行视为注释
- 不支持行内 `#` 注释，避免破坏 URL fragment

导入结果会写入：

- `data/pipeline.md`
- `data/scan-history.tsv`

## BOSS 直聘流程

BOSS 直聘第一阶段采用半自动浏览器模式：

1. 用户自行登录 BOSS 直聘。
2. 运行 `npm run boss-scan -- --limit 5` 打开可见 Chromium。
3. 用户打开岗位列表页或详情页后，在终端按 Enter。
4. 脚本读取页面可见 JD，保存到 `jds/`，并将 URL 导入 `data/pipeline.md`。
5. Codex 按 `modes/oferta.md` 生成中文评估、简历建议和 tracker 条目。
6. 如果页面无法稳定读取，退回批量 URL 导入。

已登录后可以后台运行：

```bash
npm run boss-scan -- --headless --url "https://www.zhipin.com/web/geek/job" --limit 5
```

后台模式只复用已保存登录态；如果遇到登录、验证码或安全验证，需要先切回可见模式处理。

禁止行为：

- 不绕验证码
- 不自动开聊
- 不自动发送消息
- 不自动投递

## 评估逻辑

评分只基于 JD 明确写出的要求和候选人的真实经历。

报告必须区分：

- `明确匹配`：JD 写了，CV 有证据
- `明确差距`：JD 写了，CV 没证据
- `未说明/需确认`：JD 没写，不扣分
- `加分项`：JD 写“优先/加分”，缺失不扣分

低分岗位应建议跳过。系统目标是减少无效投递，不是批量海投。

## 项目结构

```text
programmer-career-assistant/
  AGENTS.md                 Codex 行为规则
  docs/CODEX.md             Codex 使用说明
  cv.md                     用户中文简历，需自行创建
  config/profile.example.yml
  modes/                    中文求职模式
  templates/cv-template.html
  scan.mjs                  URL 导入器
  generate-pdf.mjs          HTML 转中文 ATS PDF
  data/pipeline.md          待处理 URL
  data/applications.md      申请 tracker
  reports/                  中文评估报告
  output/                   生成的简历 PDF
```

## 验证

```bash
npm run doctor
npm run verify
node test-all.mjs --quick
```

`doctor` 检查运行环境和用户必需文件。`verify` 检查 tracker 数据完整性。

## 免责声明

本项目是本地工具，不是托管服务。你的简历、联系方式和求职数据保存在本机，并会在你使用 Codex 时发送给你选择的 AI 服务商。请自行确认招聘平台服务条款，并在提交申请前人工审查所有 AI 生成内容。
