# Templates

本目录保留中文 ATS 简历模板和 tracker 状态定义。

| 文件 | 用途 |
| --- | --- |
| `cv-template.html` | 中文 ATS 简历 HTML 模板 |
| `states.yml` | tracker canonical 状态 |

## cv-template.html

单栏、文本可复制、无正文图片化、无复杂图形。适用于 `generate-pdf.mjs` 渲染为 PDF。

## states.yml

脚本使用英文 canonical label 保持数据稳定；中文输出可以在报告和备注中体现。新增 tracker 行时，status 字段仍使用 canonical label。
