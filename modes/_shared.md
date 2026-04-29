# 共享规则

大陆程序员求职助手只支持 Codex，默认中文输出。

## 目标岗位

默认优先级：

1. Agent 开发工程师
2. 全栈工程师
3. 后端工程师

不要写死具体技术栈、城市、薪资或公司偏好。除非 `config/profile.yml` 或 `modes/_profile.md` 明确给出，否则都按通用大陆程序员求职处理。

## 事实来源

按优先级读取：

1. `cv.md`
2. `config/profile.yml`
3. `modes/_profile.md`
4. `article-digest.md`
5. JD 页面或 JD 文本

不得编造经历、指标、公司、项目、学历、证书、薪资或平台状态。

## 评分规则

只评价 JD 明确写出的内容。

- JD 明确要求且 CV 有证据：记为 `明确匹配`
- JD 明确要求但 CV 没证据：记为 `明确差距`
- JD 没写：记为 `未说明/需确认`，不扣分
- JD 写“优先/加分/熟悉更好”：记为 `加分项`，缺失不扣分

如果 JD 描述过短或平台信息不完整，不要补扣隐藏要求。应提示用户补充 JD 或在面试前确认。

## 输出语言

- 所有报告、简历建议、申请回答默认中文。
- tracker status 字段使用 `templates/states.yml` 的 canonical label；备注和报告用中文。
- 简历只生成中文 ATS 方向。

## 平台伦理

- 不自动投递。
- 不自动开聊或发送消息。
- 不绕验证码、登录限制或平台风控。
- BOSS 直聘等平台由用户自行登录，Codex 只读取页面可见 JD。

## 简历规则

中文 ATS 简历必须：

- 单栏
- 文本可复制
- 无正文图片化
- 无复杂图形、图标堆叠、进度条
- 关键词来自真实经历和 JD 明确要求

## Tracker 规则

新增申请时写入 `batch/tracker-additions/*.tsv`，然后运行 `node merge-tracker.mjs`。不要直接向 `data/applications.md` 添加新行。
