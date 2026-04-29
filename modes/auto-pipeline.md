# 自动流程

当用户粘贴 JD URL 或 JD 文本时，默认执行完整流程，除非用户明确要求只评估。

## 步骤

1. 读取 `modes/_shared.md` 和本文件。
2. 读取 `cv.md`、`config/profile.yml`、`modes/_profile.md`。
3. 如果输入是 URL，优先用浏览器读取页面可见 JD。
4. 如果 BOSS 直聘页面要求登录或限制读取，请让用户登录或改用批量 URL 导入；不要绕过限制。
5. 按 `modes/oferta.md` 生成中文评估报告。
6. 如用户需要简历，按 `modes/pdf.md` 生成中文 ATS HTML，再用 `generate-pdf.mjs` 转 PDF。
7. 写入 `batch/tracker-additions/*.tsv`，运行 `node merge-tracker.mjs`。
8. 运行 `node verify-pipeline.mjs`。

## URL 页面读取失败

不要猜 JD 内容。可选处理：

- 请求用户粘贴 JD 正文。
- 将 URL 加入 `data/pipeline.md` 后稍后处理。
- 使用 `node scan.mjs --urls "url1;url2"` 批量导入。
