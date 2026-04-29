# 批量处理模式

批量处理基于 URL 文件或 `data/pipeline.md`，不使用外部 worker 或旧 CLI。

## 输入

- `node scan.mjs --file urls.txt` 导入的 URL
- `node scan.mjs --urls "url1;url2"` 导入的 URL
- 已存在的 `data/pipeline.md`

## 流程

1. 先用 `scan.mjs --dry-run` 检查 URL 数量、无效 URL、重复 URL。
2. 正式导入 URL。
3. 按 `modes/pipeline.md` 逐条处理。
4. 每条评估都写独立报告和 tracker TSV。
5. 批量结束后运行：

```bash
node merge-tracker.mjs
node verify-pipeline.mjs
```

## 限制

- 不并发打开需要登录的平台页面。
- BOSS 直聘需要用户保持登录。
- 页面不可读时跳过并记录，不猜测 JD。
