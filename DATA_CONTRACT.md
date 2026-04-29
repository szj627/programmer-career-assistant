# Data Contract

本项目分为用户数据层和系统层。用户数据层不应被批量重写；系统层可以随项目改造而修改。

## 用户数据层

这些文件保存用户简历、偏好和求职数据：

| 路径 | 说明 |
| --- | --- |
| `cv.md` | 中文简历事实来源 |
| `config/profile.yml` | 候选人联系方式、目标岗位、偏好 |
| `modes/_profile.md` | 个性化补充规则 |
| `article-digest.md` | 项目、文章、案例的证明材料 |
| `data/pipeline.md` | 待处理 JD URL |
| `data/applications.md` | 申请 tracker |
| `data/scan-history.tsv` | URL 导入历史 |
| `reports/` | 中文职位评估报告 |
| `output/` | 生成的中文 ATS 简历 |
| `jds/` | 本地保存的 JD 文本 |

## 系统层

这些文件定义 Codex 工作流、脚本、模板和校验逻辑：

| 路径 | 说明 |
| --- | --- |
| `AGENTS.md` | Codex 行为规则 |
| `docs/CODEX.md` | Codex 使用说明 |
| `modes/_shared.md` | 全局求职规则 |
| `modes/oferta.md` | 单职位评估规则 |
| `modes/auto-pipeline.md` | JD URL 自动流程 |
| `modes/scan.md` | BOSS/URL 导入流程 |
| `modes/pipeline.md` | pipeline 处理规则 |
| `modes/batch.md` | 批量处理规则 |
| `modes/pdf.md` | 中文 ATS 简历规则 |
| `modes/apply.md` | 申请表辅助规则 |
| `modes/tracker.md` | tracker 查看和更新规则 |
| `scan.mjs` | URL 导入器 |
| `boss-login.mjs` | BOSS 直聘 Cookie 登录助手 |
| `boss-cookie-store.mjs` | BOSS Cookie 本地存取工具 |
| `boss-scan.mjs` | BOSS 直聘只读 JD 扫描器 |
| `generate-pdf.mjs` | HTML 转 PDF |
| `merge-tracker.mjs` | 合并 tracker additions |
| `verify-pipeline.mjs` | tracker 健康检查 |
| `templates/` | 简历和状态模板 |

## 不再支持

- Claude、Gemini、OpenCode 集成
- 公司官网扫描和 Greenhouse/Ashby/Lever API 扫描
- 多语言 modes
- 英文简历、LaTeX/Overleaf 简历路径
- 海外薪资谈判、LinkedIn outreach、课程/项目评估模式

## Tracker TSV

每次评估新增申请时，先写入 `batch/tracker-additions/{num}-{slug}.tsv`：

```text
{num}\t{date}\t{company}\t{role}\t{status}\t{score}/5\t{pdf}\t[{num}](reports/{num}-{slug}-{date}.md)\t{note}
```

列顺序：

1. `num`
2. `date`
3. `company`
4. `role`
5. `status`
6. `score`
7. `pdf`
8. `report`
9. `note`

状态值必须使用 `templates/states.yml` 中的 canonical label。
