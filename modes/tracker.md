# Tracker 模式

查看和更新 `data/applications.md`。

## Canonical status

status 字段必须使用：

- `Evaluated`
- `Applied`
- `Responded`
- `Interview`
- `Offer`
- `Rejected`
- `Discarded`
- `SKIP`

中文含义见 `templates/states.yml`。

## 允许操作

- 查看申请总数、状态分布、最近评估。
- 更新已有行的状态或备注。
- 标记已投递、面试、拒绝、放弃。

## 禁止操作

- 不直接新增申请行。
- 新增申请必须先写 TSV 到 `batch/tracker-additions/`，再运行 `node merge-tracker.mjs`。

## 检查

更新后运行：

```bash
node verify-pipeline.mjs
```
