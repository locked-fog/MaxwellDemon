# Maxwell Demon AI Handover

note: Use Chinese to communicate with USER

## 1. Purpose

本文件是当前最新交接包。M5 已完成并合并到 `main`，下一位 Agent 应直接进入 M6（存档系统）开发，不再重复大范围环境确认。

配套文档：
- `Vibe-README.md`（产品与架构基线）
- `v0.1-scope.md`（最终验收基线，冲突时优先）

---

## 2. Current Snapshot (Updated 2026-02-21)

- Repo root: `g:\Projects\MaxwellDemon\vibe`
- Branch state:
  - `main` == `origin/main` == `78650ef`
  - `dev/m5-cross-block-logistics` 已 rebase 到 `main`，当前也在 `78650ef`
- Workspace: clean（`git status` 空）
- Milestone status:
  - M2: done
  - M3: done
  - M4: done
  - M5: done and merged
  - M6+: pending

---

## 3. What Was Delivered (M5 Final)

### 3.1 业务规则落地

已实现 M5 跨区块物流：
1. 邻格抽取（仅邻接区块）
2. 顺时针优先（固定顺序，确定性）
3. 供给方 `outletCapacityPerTick` 限流（每 tick 共享出口预算）
4. 可复现确定性（固定排序 + 无随机分配）

### 3.2 关键重构（需求口径）

跨区块需求不再使用“库存估算（rate - inventory）”，而是改为“Sim 实际缺口”：
- `stepBlock` 返回 `unmetDemand`
- `worldLogic.tickWorldOnce` 收集各区块 `unmetDemand`
- `applyCrossBlockLogistics` 直接消费该 `unmetDemand`

### 3.3 主要改动文件

- `ts/src/app/state/worldLogic.ts`
- `ts/src/app/state/worldLogic.test.ts`
- `ts/src/features/sim/core.ts`
- `ts/src/features/sim/core.test.ts`
- `ts/src/features/sim/types.ts`

### 3.4 测试与校验

在 `ts/` 执行并通过：
- `npm run test`（33 passed）
- `npm run lint`
- `npm run build`

新增覆盖点：
1. 跨区块确定性（同初始状态 + 同输入序列）
2. 顺时针优先分配
3. `outletCapacityPerTick` 限流生效
4. 多资源争抢同一出口预算（总抽取不超过预算）
5. Sim `unmetDemand` 计算与缓冲受限场景

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

---

## 5. Next Priority (M6 Save System)

按 `Vibe-README.md` 的 M6 开发：
- 目标：IndexedDB 持久化 + JSON 导入/导出 + `saveVersion` 迁移链
- 完成标准：刷新恢复、导出可导入、迁移不崩溃

建议入口：
- `ts/src/features/save/index.ts`
- `ts/src/types/*`（如需扩展存档类型）
- `ts/src/app/state/*`（仅处理接入，不把存档逻辑散落到 UI）

M6 最低测试要求（建议先补）：
1. 导出 -> 导入后世界状态一致
2. 旧版本存档能触发迁移并成功加载
3. 非法/损坏存档有明确错误而非静默失败

---

## 6. Branch Workflow Constraints

用户要求分支视图干净，严格遵循：
1. `git fetch origin`
2. `git switch main`
3. `git merge --ff-only origin/main`
4. 从 `main` 新切里程碑分支（例如 `dev/m6-save-system`）

不要在已合并的里程碑分支上继续叠加下一里程碑开发。

---

## 7. Quick Start For Next Agent

在仓库根目录执行：

1. `git fetch origin`
2. `git switch main`
3. `git merge --ff-only origin/main`
4. `git switch -c dev/m6-save-system`
5. `cd ts`
6. `npm run test`
7. `npm run lint`
8. `npm run build`

然后直接开始 M6 实现。

---

## 8. Handover Checklist (When Passing Again)

下次交接前，请在本文件补齐：
1. 当前分支与 commit 对齐关系（`main`/`origin/main`/工作分支）
2. 本轮新增/修改文件清单
3. 测试新增点与 `test/lint/build` 结果
4. 未完成项、风险点、阻塞点
