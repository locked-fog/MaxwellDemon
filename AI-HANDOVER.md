# Maxwell Demon AI Handover

note: Use Chinese to communicate with USER

## 1. Purpose

本文件是本轮交接包，目标是让下一位 AI 直接进入 M5 开发，不再重复环境确认。
请结合以下文档一起使用：

- `Vibe-README.md`（产品与架构基线）
- `v0.1-scope.md`（v0.1 最终验收基线，冲突时优先）

---

## 2. Current Snapshot (Updated 2026-02-21)

- Repo root: `g:\Projects\MaxwellDemon\vibe`
- Active branch: `dev/m5-cross-block-logistics`
- Branch baseline:
  - `main` == `origin/main` == `c3814bb`
  - `dev/m5-cross-block-logistics` is created FROM `main` at `c3814bb`
- Milestone status:
  - M2: done
  - M3: done
  - M4: done (already merged)
  - M5+: pending

重要：本次已按 USER 要求修正分支流程，明确采用“先切 main 并对齐 origin/main，再从 main 切新分支”。

---

## 3. What Was Done In This Turn (Preparation Only)

本轮没有改业务代码，只做了开发前准备与健康校验：

1. `git fetch origin`
2. `git switch main`
3. `git merge --ff-only origin/main`
4. `git switch -c dev/m5-cross-block-logistics`
5. 在 `ts/` 目录执行并通过：
   - `npm run test` (27 passed)
   - `npm run lint`
   - `npm run build`

结论：当前仓库可作为 M5 开发起点，且工作区干净。

---

## 4. Functional Status Review (Current Gap Map)

### 4.1 已接通

- 地图、区块选择与解锁、Graph 编辑器可编辑并驱动 reducer。
- 区块内 sim tick（节点处理 -> 连线传输 -> 端口交互）已接入。
- UI 可展示节点 `running/stalled` 与边 `flow/capacity`。
- `deposits` 与 `extractionRatePerTick` 已分离。

### 4.2 未完成（M5 及后续）

1. 跨区块物流未实现（M5 核心缺口）
   - `worldLogic.ts` 中 `tickWorldOnce` 仍是“逐区块 stepBlock 后回填”，没有跨区块抽取阶段。
   - `outletCapacityPerTick` 字段已存在，但未用于跨区块实际分配。

2. 科技/政策/交易仍是占位页面
   - `TechTreePage.tsx`、`PolicyTreePage.tsx`、`TradePage.tsx` 当前主要是 checklist 文本。

3. 存档仅有契约/类型骨架
   - `features/save/index.ts` 仅有 `saveVersion`、compact 类型和 `toCompactBlockSave`，未实现 IndexedDB/导入导出/迁移执行链。

4. 宏观变量只部分生效
   - `macroEntropy` 已进入 sim 速率乘子。
   - `imagEnergy`、`collapsePressure` 尚未进入实质推进逻辑。

5. 数据量不达 v0.1 验收规模
   - 目前约：tech=5, policy=4, story=2, trader=2, daily=2, weekly=2。

---

## 5. Priority For Next Agent (Start M5 Now)

### M5-A 规则冻结（先写清再编码）

- 明确跨区块抽取输入/输出口径：
  - 需求来源：建议从每区块“图内短缺口”或显式需求池读取。
  - 供给来源：邻格 `inventory` 可供资源。
  - 限制：供给区块 `outletCapacityPerTick`。
- 固定分配顺序：顺时针优先（严格确定性）。

### M5-B 实现 world tick 的跨区块阶段

建议入口：
- `ts/src/app/state/worldLogic.ts`（在 `tickWorldOnce` 增加跨区块处理阶段）
- `ts/src/types/world.ts`（必要时增加最小物流状态字段）
- `ts/src/features/sim/*`（仅保留区块内逻辑，不把 world 逻辑污染进 UI）

### M5-C 测试（必须补齐）

至少新增 world 级测试覆盖：
1. 相同初始存档 + 相同输入序列 -> 结果完全一致
2. 顺时针优先规则生效
3. `outletCapacityPerTick` 限流生效

---

## 6. Constraints To Keep

- 遵守 `v0.1-scope.md` 的 tick 顺序基线与验收条款。
- `features/sim` 保持纯逻辑，不依赖 UI。
- 不要在 M5 阶段引入与物流无关的大范围重构。
- 本仓库用户明确要求分支视图干净：新里程碑分支必须从 `main` 切出。

---

## 7. Quick Start For Next Agent

在仓库根目录执行：

1. `git switch dev/m5-cross-block-logistics`
2. `cd ts`
3. `npm run test`
4. `npm run lint`
5. `npm run build`

然后直接进入 M5-A/M5-B 开发，不再重复本轮的分支准备步骤。

---

## 8. Notes For Future Handover

- 下次切换 AI 前，务必继续更新本文件，避免状态回退。
- 若 M5 代码已开始，请在本文件追加：
  - 已改文件列表
  - 测试新增点
  - 未完成项与阻塞点

