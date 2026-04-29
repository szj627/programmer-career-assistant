# 中文 ATS 简历模式

根据 JD 生成中文 ATS 简历 HTML，并用 `generate-pdf.mjs` 转 PDF。

## 输入

- `cv.md`
- `config/profile.yml`
- JD 明确要求
- `templates/cv-template.html`

## 原则

- 中文输出。
- 单栏排版。
- 文本可复制。
- 不使用正文图片、图表、技能进度条。
- 不生成英文简历。
- 不编造经历、指标或技能。
- 关键词只来自 JD 明确要求和 CV 真实经历。

## 简历结构

1. 姓名和联系方式
2. 个人概要
3. 核心能力
4. 工作经历
5. 项目经历
6. 教育经历
7. 证书
8. 技能

## 生成流程

1. 从 `cv.md` 抽取真实经历。
2. 从 JD 提取明确关键词。
3. 只重排和改写真实经历，不新增事实。
4. 生成 HTML 到 `output/`。
5. 执行：

```bash
node generate-pdf.mjs output/resume.html output/resume.pdf
```

## 质量检查

- PDF 文本可选择复制。
- 姓名、电话、邮箱可被搜索。
- 技能关键词自然出现，不堆砌。
- 没有与 JD 无关的大段内容。
