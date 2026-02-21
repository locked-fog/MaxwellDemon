# Maxwell Demon AI Handover

note: Use Chinese to communicate with USER

## 1. Purpose

本文件是本轮开发交接包，供下一位 AI Agent 无缝接手。
请结合以下文档一起使用：

- `Vibe-README.md`（产品与架构基线）
- `v0.1-scope.md`（v0.1 最终验收基线，冲突时优先）

---

## 2. Current Snapshot

- Repo root: `g:\Projects\MaxwellDemon\vibe`
- Active branch: `dev/m4-sim-ui-loop`
- Milestone status:
  - M2: done
  - M3: done
  - M4: done（本轮完成）
  - M5+: pending

备注：当前分支包含完整 M4 交付和一批 M4.1 体验增强，不是“只改一处”的最小变更分支。

---

## 3. What Was Completed In This Batch

### 3.1 M4 Core Deliverables

1. World tick 接入 reducer（`tick_world`）并驱动 sim：
   - `ts/src/app/state/worldLogic.ts`
   - `ts/src/app/state/worldState.tsx`
2. 运行控制接入 UI（Play/Pause/Step/Speed）：
   - `ts/src/app/App.tsx`
   - `ts/src/app/app.css`
3. Graph UI 每 tick 显示节点运行态与边流量/容量：
   - `ts/src/features/graph/GraphEditorPage.tsx`
   - `ts/src/features/graph/graph.css`
4. reducer tick 集成测试与确定性测试：
   - `ts/src/app/state/worldLogic.test.ts`

### 3.2 Post-M4 Enhancements (USER Requested)

1. 区块“产率 vs 储量”分离：
   - 新增 `extractionRatePerTick`（区块每 tick 产率上限）
   - `deposits` 作为可开采总储量（百万级量纲）
   - 文件：
     - `ts/src/types/world.ts`
     - `ts/src/app/state/worldLogic.ts`
     - `ts/src/features/sim/core.ts`
     - `ts/src/features/sim/core.test.ts`
2. 地图双击区块直接跳转 Graph Editor：
   - `ts/src/features/map/MapPage.tsx`
   - `ts/src/app/App.tsx`
3. Graph 页面增加当前区块信息面板（坐标、地形、产率总和、储量总和）：
   - `ts/src/features/graph/GraphEditorPage.tsx`
4. Tick 节奏改为 `1t/s` 默认，并引入“后期资源解锁加速”：
   - `2x/4x/8x` 需库存资源达标后可选
   - `ts/src/app/App.tsx`
5. 管道流动特效增强（活跃边流动虚线+发光、负载百分比标签）：
   - `ts/src/features/graph/GraphEditorPage.tsx`
   - `ts/src/features/graph/graph.css`
6. 紧凑存档契约补充（为后续真正落地 compact save 做准备）：
   - `ts/src/features/save/index.ts`

### 3.3 Scope Alignment Fix (Important)

修复了此前提到的 sim tick 顺序偏差：

- 现在顺序为：
  - 节点处理（不含端口）
  - 连线传输
  - 端口库存交互（`port_out`/`port_in`）
- 文件：
  - `ts/src/features/sim/core.ts`
  - `ts/src/features/sim/core.test.ts`（新增顺序回归测试）

注意：跨区块抽取仍未实现（属于 M5，不在 M4 交付内）。

---

## 4. Verification Results

在 `ts/` 目录执行：

- `npm run lint` ✅
- `npm run test` ✅
- `npm run build` ✅

当前测试通过数：`27`。

---

## 5. Files Changed In This Batch

- `ts/src/app/App.tsx`
- `ts/src/app/app.css`
- `ts/src/app/state/worldLogic.ts`
- `ts/src/app/state/worldState.tsx`
- `ts/src/app/state/worldLogic.test.ts`
- `ts/src/features/map/MapPage.tsx`
- `ts/src/features/block/BlockPanelPage.tsx`
- `ts/src/features/graph/GraphEditorPage.tsx`
- `ts/src/features/graph/graph.css`
- `ts/src/features/sim/core.ts`
- `ts/src/features/sim/core.test.ts`
- `ts/src/features/save/index.ts`
- `ts/src/types/world.ts`

---

## 6. Remaining Work (Priority For Next Agent)

### 6.1 M5 (Highest Priority)

实现跨区块物流（邻格抽取 + 出口容量 + 固定顺序可复现）：

- 建议入口：
  - `ts/src/app/state/worldLogic.ts`（world tick 主循环）
  - `ts/src/types/world.ts`（必要的物流状态字段）
  - `ts/src/features/sim/*`（区块内与跨区块逻辑边界）
- 必须补测试：
  - 同初始存档、同输入序列下结果确定性
  - 顺时针优先分配规则
  - 出口容量限制生效

### 6.2 M6

把 save 从“契约与骨架”推进到可用：

- IndexedDB 持久化
- JSON 导入导出
- `saveVersion` 迁移入口
- 使用 `mapSeed + mapCellCount` 重建静态地图，减少存档体积

### 6.3 M7+

- 科技/政策从展示变为真实 modifier 生效（尤其影响区块产率与 sim 指标）
- 交易/商人/任务/合同闭环
- 剧情 T0-T4 与转生

---

## 7. Risks / Notes

1. 当前 `deposits` 已切到百万级，会影响平衡；后续需统一经济单位口径（UI 显示、任务需求、交易定价）。
2. 速度解锁目前以“全区块库存汇总”判定，是实现层策略，不是最终设计定稿；可在 M8 与交易系统联动后调整。
3. `AI-HANDOVER.md` 已与 M4 前状态彻底不同，后续切换 Agent 前请继续维护本文件，避免信息回退。

---

## 8. Suggested Next Branch

- 建议从当前分支继续切：
  - `dev/m5-cross-block-logistics`

并保持一项里程碑能力一个分支，减少回归范围。
