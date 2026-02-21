# Maxwell Demon AI Handover

note: Use Chinese to communicate with USER

## 1. Purpose

本文件为最新交接包。M7（科技树与政策树）已完成并通过 `test/lint/build`。  
下一优先级应进入 M8（交易/商人/任务/合同），避免重复进行大范围现状审阅。

配套文档：
- `Vibe-README.md`（产品与架构基线）
- `v0.1-scope.md`（最终验收基线，冲突时优先）

---

## 2. Current Snapshot (Updated 2026-02-21)

- Repo root: `g:\Projects\MaxwellDemon\vibe`
- Branch state:
  - 当前工作分支：`dev/m7-progress-system`
  - 基线分支：`main`
- Milestone status:
  - M2: done
  - M3: done
  - M4: done
  - M5: done and merged
  - M6: done
  - M7: done (implemented)
  - M8+: pending

---

## 3. What Was Delivered (M7 Final)

### 3.1 Progress 数据与规则层

新增纯逻辑 progress 模块（不依赖 UI）：
1. 数据载入与校验：`techs.json` / `policies.json`
2. 结构校验、前置引用校验、科技环检测
3. 核心函数：
   - `canUnlockTech` / `unlockTech`
   - `canSelectPolicy` / `togglePolicy`
   - `computeProgressModifiers`
   - `computeUnlockState`

### 3.2 世界状态与 sim 接入

1. `worldLogic` 新增 action：
   - `unlock_tech`
   - `toggle_policy`
2. 科技成本按全局已解锁区块的 `science` 统一扣减（按区块 id 顺序，保证确定性）
3. 扩展 `SimTickConfig` 并接入 modifier 通道：
   - `throughputMultiplier`
   - `powerEfficiencyMultiplier`
   - `entropyGainMultiplier`
4. 保持既有 tick 顺序不变：
   - 电力 -> 节点处理 -> 连线传输 -> 端口交互 -> 跨区块抽取

### 3.3 科技树/政策树 UI（非占位）

1. 科技页：可查看、可解锁、失败原因可见
2. 政策页：可选择/取消、效果即时生效
3. 新增可见性控制：
   - 默认仅显示“当前可解锁/可选择”
   - 可切换显示“不可解锁/已解锁(已生效)”
4. 政策页采用树形路径视图（按 track + 前置深度分列）

### 3.4 可建内容门控

`GraphEditorPage` 已按 progress 解锁状态过滤：
1. 未解锁节点类型不可新增
2. 未解锁配方不可选
3. 提交 graph 时阻止新增锁定内容（允许清理旧锁定节点）

### 3.5 M7 数据量完成

1. `techs.json` 已扩充至 `53` 项（>=50）
2. `policies.json` 已扩充至 `32` 项（>=30，4 条主线）
3. 为后续扩展增加可选排序字段：
   - `TechDef.order?`
   - `PolicyDef.order?`
4. 数据层导出顺序索引（`orderedTechIds` / `orderedPolicyIds`），后续主要改 JSON 即可调整展示节奏

---

## 4. Critical Implementation Notes (Do Not Regress)

1. Tick 顺序基线必须保持：
   - 区块内：电力 -> 节点处理 -> 连线传输 -> 端口交互
   - 世界级：所有解锁区块 `stepBlock` 后，再做跨区块抽取
2. 跨区块需求来源必须是 `SimTickResult.unmetDemand`，不要回退到库存估算。
3. 出口预算是“供给区块每 tick 共享预算”，跨多个资源与多个需求区块共同消耗。
4. 为保持确定性：
   - 区块按 `id` 排序
   - 资源按 `resourceId` 排序
   - 邻接按固定顺时针偏移顺序
5. `features/sim` 必须保持纯逻辑，不依赖 UI。
6. 存档格式保持版本化 base64 + `saveVersion`，不要回退为 JSON 导入/导出。
7. 区块无 `deposits` 有限储量约束，不要重新引入。

---

## 5. Main Changed Files (M7)

- `ts/src/features/progress/data.ts`
- `ts/src/features/progress/core.ts`
- `ts/src/features/progress/index.ts`
- `ts/src/features/progress/TechTreePage.tsx`
- `ts/src/features/progress/PolicyTreePage.tsx`
- `ts/src/features/progress/progress.css`
- `ts/src/features/progress/data.test.ts`
- `ts/src/features/progress/core.test.ts`
- `ts/src/app/state/worldLogic.ts`
- `ts/src/app/state/worldState.tsx`
- `ts/src/app/state/worldLogic.test.ts`
- `ts/src/features/sim/types.ts`
- `ts/src/features/sim/core.ts`
- `ts/src/features/sim/core.test.ts`
- `ts/src/features/graph/GraphEditorPage.tsx`
- `ts/src/data/techs.json`
- `ts/src/data/policies.json`
- `ts/src/types/content.ts`

---

## 6. Validation Results

在 `ts/` 执行并通过：
- `npm run test`（49 passed）
- `npm run lint`
- `npm run build`

新增覆盖点（M7）：
1. progress 数据校验（唯一 id、前置可达、环检测）
2. 科技解锁/扣费与政策槽约束
3. modifier 对 sim 的吞吐/电力/熵影响
4. world reducer action（`unlock_tech` / `toggle_policy`）行为验证

---

## 7. Next Priority (M8)

按 `Vibe-README.md` / `v0.1-scope.md` 进入 M8：
1. 本地市场 + 商人库存与价格波动
2. 日常/周常刷新（现实时间）
3. 合同履约/违约与信誉系统
4. 存档覆盖交易状态并可迁移

建议入口：
- `ts/src/features/trade/*`
- `ts/src/types/trade.ts`
- `ts/src/features/save/index.ts`

---

## 8. Branch Workflow Constraints

用户要求分支视图干净，继续遵循：
1. `git fetch origin`
2. `git switch main`
3. `git merge --ff-only origin/main`
4. 从 `main` 新切里程碑分支（如 `dev/m8-trade-system`）

不要在已合并里程碑分支上叠加下个里程碑开发。

---

## 9. Handover Checklist (When Passing Again)

下次交接前请补齐：
1. 当前分支与 commit 对齐关系（`main` / `origin/main` / 工作分支）
2. 本轮新增/修改文件清单
3. 测试新增点与 `test/lint/build` 结果
4. 未完成项、风险点、阻塞点
