# Pipeline 处理模式

处理 `data/pipeline.md` 中的待处理 URL。

## 格式

```markdown
# Pipeline

## 待处理

- [ ] https://www.zhipin.com/job_detail/xxx.html | boss | 待识别 | 待识别

## 已处理
```

## 流程

1. 读取 `## 待处理` 下未勾选的 URL。
2. 逐个打开 URL，读取页面可见 JD。
3. 无法读取时，不猜测内容，标记为需要用户粘贴 JD。
4. 按 `modes/oferta.md` 生成评估。
5. 如生成简历，按 `modes/pdf.md` 处理。
6. 写 tracker TSV 并运行 `node merge-tracker.mjs`。
7. 将处理完成的行移动到 `## 已处理`，格式保留 URL、平台、公司、岗位、分数。
8. 运行 `node verify-pipeline.mjs`。

不要自动投递或自动沟通。
