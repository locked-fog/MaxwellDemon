# Maxwell Demon AI Handover

note: Use Chinese to communicate with USER

## 1. Purpose

本文件是当前最新交接包。M6（存档系统）已完成，下一位 Agent 应直接进入 M7（科技树与政策树），不再重复大范围环境确认。

配套文档：
- `Vibe-README.md`（产品与架构基线）
- `v0.1-scope.md`（最终验收基线，冲突时优先）

---

## 2. Current Snapshot (Updated 2026-02-21)

- Repo root: `g:\Projects\MaxwellDemon\vibe`
- Branch state:
  - `main` == `origin/main` == `eb200db`
  - 工作分支：`dev/m6-save-system`（包含 M6 完成改动，待/已用于 PR）
- Milestone status:
  - M2: done
  - M3: done
  - M4: done
  - M5: done and merged
  - M6: done
  - M7+: pending

---

## 3. What Was Delivered (M6 Final)

### 3.1 存档系统能力

已实现浏览器内存档（静态部署友好）：
1. `IndexedDB` 持久化（读档/写档）
2. 启动时自动检测本地存档并恢复（有档自动进游戏）
3. 自动存档按“每个游戏日（day）”触发
4. 手动存档按钮 `Save Now`
5. Play/Pause 每次点击均触发一次保存

### 3.2 导入/导出与格式

已采用“版本化 base64 存档串”方案，不再使用 JSON 导入/导出：
1. 导出格式：`MD_SAVE_B64_V1.<base64-envelope>`
2. envelope 含 `kind/saveVersion/payload`，加载时做版本校验
3. 导出支持两种方式：
   - Copy to Clipboard
   - Export to File
4. 导入不再使用浏览器 `prompt`，改为页面内输入框（初始页与运行时均支持）

### 3.3 迁移与错误处理

1. 已接入 `saveVersion` 迁移链（含 `v0 -> v1` 可执行骨架）
2. 非法/损坏存档会抛出明确错误（`SaveFormatError`），不静默失败

### 3.4 资源模型调整（与用户最新需求对齐）

1. 取消区块有限储量（移除 `deposits`）
2. 资源抽取仅受 `ratePerTick` 与 `extractionRatePerTick` 限制
3. 已同步清理存档结构与相关 UI 展示中的 `deposits` 口径

### 3.5 主要改动文件

- `ts/src/features/save/index.ts`
- `ts/src/features/save/index.test.ts`
- `ts/src/app/state/worldState.tsx`
- `ts/src/app/state/worldLogic.ts`
- `ts/src/app/App.tsx`
- `ts/src/app/app.css`
- `ts/src/types/world.ts`
- `ts/src/features/sim/core.ts`
- `ts/src/features/sim/core.test.ts`
- `ts/src/app/state/worldLogic.test.ts`
- `ts/src/features/map/MapPage.tsx`
- `ts/src/features/graph/GraphEditorPage.tsx`
- `ts/src/features/block/BlockPanelPage.tsx`
- `Vibe-README.md`
- `v0.1-scope.md`

### 3.6 测试与校验

在 `ts/` 执行并通过：
- `npm run test`（36 passed）
- `npm run lint`
- `npm run build`

新增/覆盖点：
1. 导出 -> 导入后世界状态一致
2. 旧版本存档迁移（`v0 -> v1`）可执行且不崩溃
3. 非法存档输入有明确错误
4. 取消 `deposits` 后 sim/world 测试口径已同步

---

## 4. Critical Implementation Notes (Do Not Regress)

1. Tick 顺序基线保持：
   - 区块内：电力 -> 节点处理 -> 连线传输 -> 端口交互
   - 世界级：所有解锁区块 `stepBlock` 后，再做跨区块抽取
2. 跨区块需求来源必须是 `SimTickResult.unmetDemand`，不要回退到库存估算。
3. 出口预算是“供给区块每 tick 共享预算”，跨多个资源与多个需求区块共同消耗。
4. 为保持确定性：
   - 区块按 `id` 排序
   - 资源按 `resourceId` 排序
   - 邻接按固定顺时针偏移顺序
5. `features/sim` 必须保持纯逻辑，不依赖 UI。
6. 存档格式已切换为版本化 base64；不要回退为 JSON 导入/导出。
7. 区块不再有有限储量字段 `deposits`；不要在新逻辑里重新引入该约束。

---

## 5. Next Priority (M7 Progress System)

按 `Vibe-README.md` / `v0.1-scope.md` 的 M7 开发：
- 目标：科技树与政策树的数据读入、前置校验、解锁与 modifier 生效
- 完成标准：科技/政策真实影响 sim（非仅展示）

建议入口：
- `ts/src/features/progress/*`
- `ts/src/data/techs.json`
- `ts/src/data/policies.json`
- `ts/src/app/state/*`（仅最小接入）

---

## 6. Branch Workflow Constraints

用户要求分支视图干净，严格遵循：
1. `git fetch origin`
2. `git switch main`
3. `git merge --ff-only origin/main`
4. 从 `main` 新切里程碑分支（例如 `dev/m7-progress-system`）

不要在已合并的里程碑分支上继续叠加下一里程碑开发。

---

## 7. Quick Start For Next Agent

在仓库根目录执行：

1. `git fetch origin`
2. `git switch main`
3. `git merge --ff-only origin/main`
4. `git switch -c dev/m7-progress-system`
5. `cd ts`
6. `npm run test`
7. `npm run lint`
8. `npm run build`

然后直接开始 M7 实现。

---

## 8. Handover Checklist (When Passing Again)

下次交接前，请在本文件补齐：
1. 当前分支与 commit 对齐关系（`main`/`origin/main`/工作分支）
2. 本轮新增/修改文件清单
3. 测试新增点与 `test/lint/build` 结果
4. 未完成项、风险点、阻塞点
