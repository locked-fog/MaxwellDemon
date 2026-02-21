import nodeTypesJson from '../../data/nodeTypes.json'
import recipesJson from '../../data/recipes.json'
import type {
  BlockState,
  EffectDef,
  GraphState,
  NodeTypeDef,
  NodeTypeId,
  ProgressState,
  RecipeDef,
  TechDef,
  WorldState,
} from '../../types'
import { progressData, type ProgressDataBundle } from './data'

const BASE_UNLOCKED_NODE_TYPES: ReadonlyArray<NodeTypeId> = ['extractor', 'storage', 'port_in', 'port_out']
const BASE_UNLOCKED_RECIPE_IDS: ReadonlyArray<string> = []
const EPSILON = 1e-9
const ERA_ORDER: ReadonlyArray<TechDef['era']> = ['T0', 'T1', 'T2', 'T3', 'T4']
const DEFAULT_POLICY_SLOTS = 1

const ALL_NODE_TYPE_IDS = new Set(
  (nodeTypesJson as NodeTypeDef[]).map((item) => item.id).filter((id): id is NodeTypeId => isNodeTypeId(id))
)
const ALL_RECIPE_IDS = new Set((recipesJson as RecipeDef[]).map((item) => item.id))

export interface ProgressModifiers {
  throughputMultiplier: number
  powerEfficiencyMultiplier: number
  entropyGainMultiplier: number
  collapsePressureMultiplier: number
  marketPriceMultiplier: number
}

export interface ProgressUnlockState {
  unlockedNodeTypeIds: ReadonlySet<NodeTypeId>
  unlockedRecipeIds: ReadonlySet<string>
  unlockedFeatureIds: ReadonlySet<'merchant' | 'contract' | 'rebirth'>
  policySlotCount: number
  mapRadiusBonus: number
}

export interface ProgressCheckResult {
  ok: boolean
  reason?: string
}

export interface ProgressMutateResult {
  ok: boolean
  world?: WorldState
  reason?: string
}

export function canUnlockTech(
  world: WorldState,
  techId: string,
  data: ProgressDataBundle = progressData
): ProgressCheckResult {
  const tech = data.techById.get(techId)
  if (!tech) {
    return { ok: false, reason: `科技不存在：${techId}` }
  }
  if (world.progress.unlockedTechIds.includes(tech.id)) {
    return { ok: false, reason: `科技已解锁：${tech.name}` }
  }

  for (const prereqId of tech.prereq) {
    if (!world.progress.unlockedTechIds.includes(prereqId)) {
      const prereqName = data.techById.get(prereqId)?.name ?? prereqId
      return { ok: false, reason: `前置科技未满足：${prereqName}` }
    }
  }

  const availableScience = getWorldScience(world.blocks)
  const cost = positive(tech.cost.science)
  if (availableScience + EPSILON < cost) {
    return {
      ok: false,
      reason: `科研点不足：需要 ${formatNumber(cost)}，当前 ${formatNumber(availableScience)}`,
    }
  }

  return { ok: true }
}

export function unlockTech(
  world: WorldState,
  techId: string,
  data: ProgressDataBundle = progressData
): ProgressMutateResult {
  const check = canUnlockTech(world, techId, data)
  if (!check.ok) {
    return check
  }

  const tech = data.techById.get(techId)
  if (!tech) {
    return { ok: false, reason: `科技不存在：${techId}` }
  }

  const nextBlocks = deductWorldScience(world.blocks, positive(tech.cost.science))
  const nextUnlockedTechIds = [...world.progress.unlockedTechIds, tech.id].sort()
  const nextProgress: ProgressState = {
    ...world.progress,
    unlockedTechIds: nextUnlockedTechIds,
    era: maxEra(world.progress.era, tech.era),
  }

  return {
    ok: true,
    world: {
      ...world,
      blocks: nextBlocks,
      progress: nextProgress,
    },
  }
}

export function canSelectPolicy(
  world: WorldState,
  policyId: string,
  data: ProgressDataBundle = progressData
): ProgressCheckResult {
  const policy = data.policyById.get(policyId)
  if (!policy) {
    return { ok: false, reason: `政策不存在：${policyId}` }
  }

  const selected = new Set(world.progress.selectedPolicyIds)
  if (selected.has(policy.id)) {
    return { ok: true }
  }

  for (const prereqId of policy.prereq) {
    if (!selected.has(prereqId)) {
      const prereqName = data.policyById.get(prereqId)?.name ?? prereqId
      return { ok: false, reason: `前置政策未满足：${prereqName}` }
    }
  }

  const unlockState = computeUnlockState(world.progress, data)
  const sameTrackSelected = world.progress.selectedPolicyIds.find((id) => {
    const selectedPolicy = data.policyById.get(id)
    return selectedPolicy?.track === policy.track
  })
  const nextSize = sameTrackSelected
    ? world.progress.selectedPolicyIds.length
    : world.progress.selectedPolicyIds.length + 1
  if (nextSize > unlockState.policySlotCount) {
    return {
      ok: false,
      reason: `政策槽不足：上限 ${unlockState.policySlotCount}，当前已选 ${world.progress.selectedPolicyIds.length}`,
    }
  }

  return { ok: true }
}

export function togglePolicy(
  world: WorldState,
  policyId: string,
  data: ProgressDataBundle = progressData
): ProgressMutateResult {
  const policy = data.policyById.get(policyId)
  if (!policy) {
    return { ok: false, reason: `政策不存在：${policyId}` }
  }

  const selected = new Set(world.progress.selectedPolicyIds)
  if (selected.has(policy.id)) {
    selected.delete(policy.id)
    return {
      ok: true,
      world: {
        ...world,
        progress: {
          ...world.progress,
          selectedPolicyIds: [...selected].sort(),
        },
      },
    }
  }

  const check = canSelectPolicy(world, policy.id, data)
  if (!check.ok) {
    return check
  }

  const nextSelected = world.progress.selectedPolicyIds.filter((id) => {
    const existing = data.policyById.get(id)
    return existing?.track !== policy.track
  })
  nextSelected.push(policy.id)
  nextSelected.sort()

  return {
    ok: true,
    world: {
      ...world,
      progress: {
        ...world.progress,
        selectedPolicyIds: nextSelected,
      },
    },
  }
}

export function computeProgressModifiers(
  progress: ProgressState,
  data: ProgressDataBundle = progressData
): ProgressModifiers {
  let throughputMultiplier = 1
  let powerEfficiencyMultiplier = 1
  let entropyGainMultiplier = 1
  let collapsePressureMultiplier = 1
  let marketPriceMultiplier = 1

  for (const policyId of progress.selectedPolicyIds) {
    const policy = data.policyById.get(policyId)
    if (!policy) {
      continue
    }
    for (const effect of policy.effects) {
      if (effect.kind !== 'modifier') {
        continue
      }
      if (effect.target === 'throughput') {
        throughputMultiplier = applyModifier(throughputMultiplier, effect)
        continue
      }
      if (effect.target === 'power_efficiency') {
        powerEfficiencyMultiplier = applyModifier(powerEfficiencyMultiplier, effect)
        continue
      }
      if (effect.target === 'entropy_gain') {
        entropyGainMultiplier = applyModifier(entropyGainMultiplier, effect)
        continue
      }
      if (effect.target === 'collapse_pressure') {
        collapsePressureMultiplier = applyModifier(collapsePressureMultiplier, effect)
        continue
      }
      if (effect.target === 'market_price') {
        marketPriceMultiplier = applyModifier(marketPriceMultiplier, effect)
      }
    }
  }

  return {
    throughputMultiplier: clampMin(throughputMultiplier, 0),
    powerEfficiencyMultiplier: clampMin(powerEfficiencyMultiplier, EPSILON),
    entropyGainMultiplier: clampMin(entropyGainMultiplier, 0),
    collapsePressureMultiplier: clampMin(collapsePressureMultiplier, 0),
    marketPriceMultiplier: clampMin(marketPriceMultiplier, EPSILON),
  }
}

export function computeUnlockState(
  progress: ProgressState,
  data: ProgressDataBundle = progressData
): ProgressUnlockState {
  const unlockedNodeTypeIds = new Set<NodeTypeId>(BASE_UNLOCKED_NODE_TYPES)
  const unlockedRecipeIds = new Set<string>(BASE_UNLOCKED_RECIPE_IDS)
  const unlockedFeatureIds = new Set<'merchant' | 'contract' | 'rebirth'>()
  let policySlotCount = DEFAULT_POLICY_SLOTS
  let mapRadiusBonus = 0

  const applyUnlock = (unlock: TechDef['unlocks'][number]) => {
    if (unlock.kind === 'node_type' && ALL_NODE_TYPE_IDS.has(unlock.id)) {
      unlockedNodeTypeIds.add(unlock.id)
      return
    }
    if (unlock.kind === 'recipe' && ALL_RECIPE_IDS.has(unlock.id)) {
      unlockedRecipeIds.add(unlock.id)
      return
    }
    if (unlock.kind === 'feature') {
      unlockedFeatureIds.add(unlock.id)
      return
    }
    if (unlock.kind === 'policy_slot') {
      policySlotCount += Math.floor(Math.max(0, unlock.amount))
      return
    }
    if (unlock.kind === 'map_radius') {
      mapRadiusBonus += Math.max(0, unlock.amount)
    }
  }

  for (const techId of progress.unlockedTechIds) {
    const tech = data.techById.get(techId)
    if (!tech) {
      continue
    }
    for (const unlock of tech.unlocks) {
      applyUnlock(unlock)
    }
  }

  for (const policyId of progress.selectedPolicyIds) {
    const policy = data.policyById.get(policyId)
    if (!policy) {
      continue
    }
    for (const effect of policy.effects) {
      if (effect.kind !== 'unlock') {
        continue
      }
      applyUnlock(effect.unlock)
    }
  }

  return {
    unlockedNodeTypeIds,
    unlockedRecipeIds,
    unlockedFeatureIds,
    policySlotCount: Math.max(DEFAULT_POLICY_SLOTS, Math.floor(policySlotCount)),
    mapRadiusBonus,
  }
}

export function isNodeTypeUnlocked(
  progress: ProgressState,
  nodeTypeId: NodeTypeId,
  data: ProgressDataBundle = progressData
): boolean {
  return computeUnlockState(progress, data).unlockedNodeTypeIds.has(nodeTypeId)
}

export function isRecipeUnlocked(
  progress: ProgressState,
  recipeId: string,
  data: ProgressDataBundle = progressData
): boolean {
  return computeUnlockState(progress, data).unlockedRecipeIds.has(recipeId)
}

export function countLockedGraphEntries(
  graph: GraphState,
  unlockState: ProgressUnlockState
): number {
  let count = 0
  for (const node of graph.nodes) {
    if (!unlockState.unlockedNodeTypeIds.has(node.type)) {
      count += 1
      continue
    }
    if (node.type === 'processor') {
      const recipeId = typeof node.params.recipeId === 'string' ? node.params.recipeId : ''
      if (recipeId.length > 0 && !unlockState.unlockedRecipeIds.has(recipeId)) {
        count += 1
      }
    }
  }
  return count
}

export function readFirstLockedGraphReason(
  graph: GraphState,
  unlockState: ProgressUnlockState
): string | undefined {
  for (const node of graph.nodes) {
    if (!unlockState.unlockedNodeTypeIds.has(node.type)) {
      return `节点类型未解锁：${node.type}`
    }
    if (node.type === 'processor') {
      const recipeId = typeof node.params.recipeId === 'string' ? node.params.recipeId : ''
      if (recipeId.length > 0 && !unlockState.unlockedRecipeIds.has(recipeId)) {
        return `配方未解锁：${recipeId}`
      }
    }
  }
  return undefined
}

export function getWorldScience(blocks: BlockState[]): number {
  let total = 0
  for (const block of blocks) {
    if (!block.unlocked) {
      continue
    }
    total += positive(block.inventory.science ?? 0)
  }
  return total
}

function deductWorldScience(blocks: BlockState[], cost: number): BlockState[] {
  let remaining = positive(cost)
  if (remaining <= EPSILON) {
    return blocks
  }

  const next = blocks.map((block) => ({
    ...block,
    inventory: { ...block.inventory },
  }))

  const unlockedSorted = [...next]
    .filter((block) => block.unlocked)
    .sort((a, b) => a.id.localeCompare(b.id))

  for (const block of unlockedSorted) {
    if (remaining <= EPSILON) {
      break
    }
    const available = positive(block.inventory.science ?? 0)
    if (available <= EPSILON) {
      continue
    }
    const spent = Math.min(available, remaining)
    block.inventory.science = clampPositive(available - spent)
    remaining = clampPositive(remaining - spent)
  }

  return next
}

function applyModifier(base: number, modifier: EffectDef & { kind: 'modifier' }): number {
  if (modifier.operator === 'add') {
    return base + modifier.value
  }
  return base * modifier.value
}

function clampPositive(value: number): number {
  return value > EPSILON ? value : 0
}

function clampMin(value: number, min: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return value < min ? min : value
}

function positive(value: number): number {
  return value > EPSILON ? value : 0
}

function maxEra(left: TechDef['era'], right: TechDef['era']): TechDef['era'] {
  const leftIndex = ERA_ORDER.indexOf(left)
  const rightIndex = ERA_ORDER.indexOf(right)
  if (rightIndex > leftIndex) {
    return right
  }
  return left
}

function isNodeTypeId(value: string): value is NodeTypeId {
  return (
    value === 'extractor' ||
    value === 'processor' ||
    value === 'storage' ||
    value === 'power_gen' ||
    value === 'control' ||
    value === 'port_in' ||
    value === 'port_out' ||
    value === 'market' ||
    value === 'research'
  )
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100
  if (Math.abs(rounded - Math.round(rounded)) < EPSILON) {
    return `${Math.round(rounded)}`
  }
  return rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}
