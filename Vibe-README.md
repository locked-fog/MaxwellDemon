下面是一份“可以直接丢进仓库当 README / SPEC 的初始文档”，目标就是让你用 VSCode + JS/TS + CodexCLI/GPT 插件做 vibe coding 时，有一个**统一口径**：要做什么、做到什么程度算完成、代码应该怎么分层、数据怎么定义、每一步怎么拆任务。你可以把它保存为 `README.md`（或 `docs/spec.md`）然后从第一条任务开干。

---

# Maxwell Demon（暂名）v0.1 初始规格与开发手册（Vibe Coding Friendly）

## 0. 目标与原则

目标：在 4 周内做出一个你自己能玩、能存档、能转生的 v0.1 原型。开发节奏：3 周完成主体功能，1 周查漏补缺与体验优化。

最重要的三条原则：

1. **工作流（产线）编辑器优先**：先能搭、能连、能跑，再谈好看。
2. **数据驱动**：资源、节点类型、配方、科技、政策、商人任务都用 JSON 定义；代码只负责“读数据+执行规则”。
3. **可验收**：每个任务都有可见结果（能点、能跑、能存、能复现），避免“写了一堆但没接起来”。

非目标（v0.1 不做或弱化）：

- 复杂经济模型（只做商人买卖 + 日常/周常任务 + 简单合同/信誉）
- 复杂路径物流（先做邻格抽取+容量限制，后续再做铁路/航运等）
- 随机故障/灾难的丰富表现（先做“阶段性惩罚”与少量事件）

---

## 1. 核心玩法循环（v0.1）

地图层（六边形区块）：

- 探索/解锁新区块
- 每块有地形、资源禀赋、容量、邻接与物流约束

区块层（工作流产线）：

- 在区块内放节点、连线，形成一个有向图
- 节点消耗输入产出输出，受容量、电力、库存等限制
- 玩家优化瓶颈：缺料、堵塞、缺电、满仓、低效率

进度层：

- 科技树 ≥50 项：以“解锁新工具/新约束”为主
- 政策树 ≥30 项，≥3 条主线：每项带代价（取舍）
- 商人系统：买卖 + 日常/周常任务 + 合同/信誉
- 剧情阶段 T0–T4：崩坏压力上升，最终触发“转生/周目重置”，保留记忆碎片等 meta 资源

---

## 2. 技术栈与工程约定

### 2.1 技术栈（建议默认）

- Node.js LTS
- Vite + React + TypeScript（strict）
- 工作流编辑器：React Flow（节点/连线）
- 六边形地图：自绘 SVG/Canvas（第一版），或引入 hex-grid 库（可选）
- 状态管理：Zustand（或 React Context + reducer，选简单顺手的）
- 存档：IndexedDB（浏览器内持久化），并提供“版本化 base64 导出/导入”（支持复制到剪贴板或导出文件）

测试（强烈建议至少覆盖 sim core）：

- Vitest（单元测试）
- ESLint + Prettier（统一风格）

### 2.2 目录结构（建议）

```
/src
  /app              # App shell, routes
  /ui               # 通用UI组件
  /features
    /map            # 地图层
    /block          # 区块面板与进入产线
    /graph          # 工作流编辑器（React Flow 封装）
    /sim            # 模拟核心（纯函数/可测试）
    /progress       # 科技/政策/剧情/转生
    /trade          # 商人/任务/合同/信誉
    /save           # 存档读档/导入导出
  /data             # JSON 数据（资源/节点/配方/科技/政策/商人/剧情）
  /types            # 全局类型
  /utils            # 工具函数（ID、随机、数学、日志）
/docs               # 规范与设计文档（可选）
```

### 2.3 分层铁律（避免后期爆炸）

- `features/sim` 不能 import 任何 UI 相关内容（保持纯逻辑，可测试）
- UI 只改状态，不做“偷偷计算”
- 数据（JSON）不写逻辑，只写定义；逻辑由 sim 解释

---

## 3. 术语（统一口径）

- **World**：整个存档世界（时间、地图、进度、全局资源）
- **Block / Tile**：一个六边形区块（地形、资源禀赋、容量、工作流图、区块库存）
- **Graph**：区块内部工作流（节点+连线）
- **Node**：设施单位实例（有参数、端口、速率、功耗等）
- **Edge**：连线（物流线/管线/电网线）
- **Inventory**：库存（区块级、节点缓冲级）
- **Tick**：模拟步进（建议 1 tick = 0.1 天 或 1/10 天；可配置）
- **Day**：游戏日（默认 2 秒 = 1 天，可改）

---

## 4. 数据模型（TypeScript 类型草案）

> 目标：先把类型钉住，再 vibe coding 填实现。

### 4.1 基础类型

```ts
export type Id = string;

export type ResourceId = string; // "wood" | "iron_ore" | ...
export type EdgeKind = "item" | "fluid" | "power";

export interface Stack {
  id: ResourceId;
  qty: number; // >= 0
}
```

### 4.2 区块与地图

```ts
export type TerrainId = "plains" | "forest" | "mountain" | "river" | "coast";

export interface BlockCoord {
  q: number; // axial coords
  r: number;
}

export interface BlockState {
  id: Id;
  coord: BlockCoord;
  terrain: TerrainId;

  capacitySlots: number; // 节点槽位上限（硬约束）
  outletCapacityPerTick: number; // 跨区块出口容量
  extractionRatePerTick: Record<ResourceId, number>; // 区块资源产率上限（不设有限储量）

  unlocked: boolean;

  inventory: Record<ResourceId, number>; // 区块公共库存
  graph: GraphState;
}
```

### 4.3 工作流图（React Flow 可直接映射）

```ts
export interface GraphState {
  nodes: NodeInstance[];
  edges: EdgeInstance[];
  // 可扩展：viewport、选中状态不进存档（或单独保存）
}

export type NodeTypeId =
  | "extractor"
  | "processor"
  | "storage"
  | "power_gen"
  | "control"
  | "port_in"
  | "port_out"
  | "market"
  | "research";

export interface NodeInstance {
  id: Id;
  type: NodeTypeId;
  x: number;
  y: number;

  params: Record<string, unknown>; // 具体节点参数（配方、等级、阈值等）
  enabled: boolean;

  // 运行时字段（不必进存档，也可进存档以便断点恢复）
  runtime?: NodeRuntime;
}

export interface NodeRuntime {
  inputBuf: Record<string, Record<ResourceId, number>>; // portName -> inventory
  outputBuf: Record<string, Record<ResourceId, number>>;
  lastStatus?: NodeStatus;
}

export type NodeStatus =
  | { kind: "running" }
  | {
      kind: "stalled";
      reason: "no_input" | "no_power" | "output_full" | "disabled";
    };
```

### 4.4 连线

```ts
export interface EdgeInstance {
  id: Id;
  kind: EdgeKind;

  fromNodeId: Id;
  fromPort: string;

  toNodeId: Id;
  toPort: string;

  capacityPerTick: number; // 运输容量（同种单位）
}
```

### 4.5 配方与节点定义（数据驱动）

```ts
export interface RecipeDef {
  id: string;
  name: string;
  inputs: Stack[];
  outputs: Stack[];
  timeDays: number; // 完成一次配方消耗的游戏日
  powerPerDay?: number; // 功耗（可选）
}

export interface NodeTypeDef {
  id: NodeTypeId;
  name: string;
  ports: {
    inputs: string[];
    outputs: string[];
  };
  // 节点支持哪些配方/功能
  allowedRecipes?: string[];
}
```

### 4.6 进度：科技、政策、剧情、转生

```ts
export interface TechDef {
  id: string;
  name: string;
  desc: string;
  era: "T0" | "T1" | "T2" | "T3" | "T4";
  prereq: string[];
  cost: { science: number };
  unlocks: UnlockDef[];
}

export interface PolicyDef {
  id: string;
  name: string;
  desc: string;
  track: "Industry" | "Ecology" | "Faith" | "Trade"; // >=3 主线，建议 4
  prereq: string[];
  effects: EffectDef[]; // 全局 modifier 或解锁
}

export interface StoryEventDef {
  id: string;
  title: string;
  text: string;
  triggers: TriggerDef[];
  actions: ActionDef[];
}
```

---

## 5. 模拟规则（v0.1 版本的“简单但可玩”）

### 5.1 时间尺度

- `realTime` 驱动 `gameDay`
- 默认 2 秒 = 1 游戏日
- 模拟内部用 tick：例如 1 tick = 0.1 日（每游戏日 10 tick）

### 5.2 每 tick 的流程（建议固定顺序，保证可复现）

对每个区块：

1. 计算本 tick 可用电力（power_gen 节点产出汇总）
2. 节点处理（processor/extractor/…）：尝试消耗输入、产出输出到节点 outputBuf
   - 不足则 `stalled: no_input`
   - 功率不足则 `stalled: no_power`
   - 输出缓冲满则 `stalled: output_full`

3. 连线传输：沿 Edge 从上游 outputBuf 搬运到下游 inputBuf（受 capacityPerTick 限制）
4. 端口节点（port_out/port_in）与区块公共库存交互
   - 简化：port_out 把指定资源从区块库存推到图内；port_in 把图内输出汇入区块库存

5. 跨区块抽取（邻格物流 v0.1）
   - 每个区块可声明“需求清单”（来自 port_in 缺口或指定配置）
   - 从邻格按固定顺序分配（先用 “顺时针优先” 规则；不足则欠账到下 tick）
   - 抽取受“区块出口容量”限制（区块属性）

### 5.3 宏观变量（先做成全局乘子即可）

- `macroEntropy`：降低效率（让玩家“稳态”有意义）
- `imagEnergy`：随文明秩/产量增长累积
- `collapsePressure`：阶段性触发事件/惩罚
  v0.1 实现建议：
- 先用简单公式：`effectiveRate = baseRate * (1 - entropyFactor)`
- 崩坏事件按阶段触发：T0/T1 只是减产/熵增，T2 开始损坏/人口惩罚，T3 破坏区块，T4 逼转生

---

## 6. UI 页面与交互（v0.1）

必须有的 6 个界面：

1. 主界面（地图）：点区块、解锁、查看属性、进入区块
2. 区块面板：库存、地形、容量、邻接、产线摘要（吞吐/瓶颈）
3. 工作流编辑器：节点库、参数面板、连线、运行状态显示（缺料/堵塞/缺电）
4. 科技树：浏览、解锁、显示解锁内容
5. 政策树：选择政策、显示代价与效果
6. 交易/商人：买卖、日常/周常任务、合同/信誉、奖励领取

体验最低要求：

- 节点上显示状态灯（running / stalled reason）
- 连线上能显示“当前流量/容量”（哪怕是 tooltip）

---

## 7. 交易系统（商人 + 日常/周常 + 合同）

结构：

- 本地市场：常规资源自由买卖（兜底）
- 商人（T2 解锁）：
  - 买卖：有限库存、价格波动（简单即可）
  - 日常任务：现实每天刷新（避免 2 秒一天导致任务刷爆）
  - 周常任务：现实每周刷新

- 合同：按“游戏日窗口”交付，违约扣信誉/罚金

任务奖励定位：

- 用来给“珍贵物资/稀有中间品/剧情推进物资”
- 让玩家不必靠极长产线才能摸到 T3/T4 关键资源，但仍要付出工程代价（稳定交付、资源交换、信誉）

---

## 8. 剧情框架（T0–T4）与转生（v0.1 够用版）

剧情不是长文本，而是“阶段事件 + 系统解锁”：

- T0：发现宏观熵与第一次异常波动（解锁：熵监测/研究院）
- T1：区块化工业扩张，崩坏以减产/熵增表现（解锁：区块规划/物流调度）
- T2：航天与外文明商人出现，算力成为新瓶颈（解锁：商人系统/合同/信誉）
- T3：虚数科技，出现更强崩坏惩罚（解锁：稳定锚/时空装置材料）
- T4：终局工程：选择“热寂航行 / 悖论封存 / 递归播种（转生）”

转生（v0.1 的实现要点）：

- 触发条件：建成“播种装置/信标”并消耗特定资源
- 结算：把部分资源/成就转化为 `memoryShards`（meta 货币）
- 重置：地图与区块重置（可保留少量 meta 解锁）
- Meta 解锁示例：起始解锁半径+1、起始带一个仓库节点、某类科技打折、保留一项政策槽

---

## 9. 存档格式（强约束：可导出版本化 base64）

存档内容必须包含：

- 世界时间（day、tick）
- 地图所有区块状态（unlocked、terrain、capacity、extractionRate、inventory、graph）
- 科技解锁状态、政策选择状态
- 交易：信誉、任务刷新时间戳、合同状态
- 剧情事件触发记录
- meta：memoryShards、周目次数等

强烈建议：

- 存档版本号 `saveVersion`
- 导出格式使用“版本化 envelope + base64 编码”（含版本校验）
- 每次加载做迁移（哪怕先只有 v1→v2 的空实现）

---

## 10. Vibe Coding 工作流（给 CodexCLI/GPT 的“提示词模板”）

### 10.1 通用任务提示词

把下面模板复制给 CodexCLI/GPT，每次只改【目标】部分：

> 你在一个 Vite+React+TypeScript（strict）项目中工作。请在不改变现有架构的前提下实现【目标】。
> 约束：
>
> - `features/sim` 必须是纯逻辑、可单元测试，不 import UI
> - 所有新增类型放到 `src/types` 或对应 feature 的 `types.ts`
> - 必须写最少的 Vitest 测试覆盖关键逻辑
> - 不引入新库，除非我明确允许
>   输出：给出需要新增/修改的文件路径与完整代码。

### 10.2 切片式开发（推荐顺序）

1. 建好 Graph 编辑器壳（能放节点/连线，保存到 state）
2. sim core：让单区块单链条跑起来（测试覆盖）
3. 将 sim 运行状态映射回 UI（节点状态、连线流量）
4. 加跨区块抽取（先固定顺序）
5. 加科技树（数据读入 + 解锁生效）
6. 加政策树（数据读入 + modifier 生效）
7. 加商人系统（买卖 + 任务刷新 + 奖励）
8. 加剧情与转生（事件触发 + 结算 + 重置）
9. 加存档（IndexedDB + 版本化 base64 导入导出）

### 10.3 “完成定义”（DoD）

一个功能只有满足以下条件才算完成：

- UI 上能操作并看到结果
- 刷新页面后（读档）状态能恢复
- sim core 有测试覆盖（至少 1–3 个关键 case）
- 没有 `any` 泄洪（除非 params 做了类型收敛/校验）

---

## 11. v0.1 首周任务清单（建议照抄到 issue）

- [ ] 初始化工程（Vite+React+TS strict + eslint/prettier + vitest）
- [ ] 定义核心 types（World/Block/Graph/Node/Edge/Recipe）
- [ ] 地图 MVP：渲染六边形网格（SVG），点区块弹面板
- [ ] 区块工作流页面：集成 React Flow，支持节点拖拽、连线、删除
- [ ] GraphState 能序列化到 store（先内存，后存档）
- [ ] sim core MVP：1 个 extractor + 1 个 processor + 1 个 storage 跑通
- [ ] UI 显示：节点状态 running/stalled + 原因

---

## 12. 数据文件约定（先空着也行）

建议在 `/src/data` 放：

- `resources.json`
- `nodeTypes.json`
- `recipes.json`
- `techs.json`（≥50）
- `policies.json`（≥30）
- `traders.json`
- `quests_daily.json`
- `quests_weekly.json`
- `story_events.json`

每个 JSON 必须有：

- `id`（唯一）
- `name`
- `desc`
- `tags/era/track`（便于 UI 分组）

---

如果你愿意，我可以在你下一条消息里直接给你一套“可复制粘贴”的工程起步包内容：

1. `types.ts` 的完整初版（含运行时 runtime 字段与保存字段划分）
2. `sim` 的最小可跑实现（含 vitest）
3. `data` 的最小样例（10 资源、8 节点、10 配方、50 科技的模板结构，不用你手写 50 次）

这样你开仓库后，第一天就能看到“节点连起来，资源真的在流动”。

补充：开发计划：
M2：世界状态与地图 MVP
目标：建立 WorldState 全局状态、六边形地图渲染、区块选择与区块面板联动。
完成标准：可解锁区块、可进入区块、区块属性实时显示。
M3：Graph 编辑器可用版
目标：接入 React Flow，完成节点增删改、连线、参数编辑、图状态持久在内存 store。
完成标准：能手动搭出一条有效产线图。
M4：Sim 与 UI 联动
目标：把已完成的 core.ts 接到 UI tick 循环。
完成标准：节点显示 running/stalled，连线显示流量/容量。
M5：跨区块物流
目标：实现邻格抽取与出口容量限制。
完成标准：区块间资源可按规则流动且可复现。
M6：存档系统
目标：IndexedDB 持久化 + 版本化 base64 导入导出 + saveVersion 迁移。
完成标准：刷新后恢复、导出可导入、迁移不崩溃。
M7：科技树与政策树
目标：数据读入、前置校验、解锁与 modifier 生效。
完成标准：科技/政策不是展示，必须真实影响 sim。
M8：交易/商人/任务/合同
目标：本地市场、商人库存与价格波动、日常周常刷新、合同履约与信誉。
完成标准：完整交易闭环可玩、可存档。
M9：剧情 T0-T4 与转生
目标：阶段事件触发、终局选择、转生结算、memoryShards 元进度。
完成标准：从新档到转生可跑通。
M10：内容量与发布验收
目标：补齐 >=50 科技、>=30 政策及完整数据内容。
完成标准：黄金路径 E2E 通过，lint/test/build 全绿，无 P0/P1。
