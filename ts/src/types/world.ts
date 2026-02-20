import type { GraphState } from './graph'
import type { EraId, Id, ResourceId, ResourceInventory } from './common'
import type { TradeState } from './trade'

export type TerrainId = 'plains' | 'forest' | 'mountain' | 'water' | 'coast'

export interface BlockCoord {
  q: number
  r: number
}

export interface BlockState {
  id: Id
  coord: BlockCoord
  terrain: TerrainId
  unlocked: boolean
  capacitySlots: number
  outletCapacityPerTick: number
  deposits: Record<ResourceId, number>
  inventory: ResourceInventory
  graph: GraphState
}

export interface WorldTime {
  day: number
  tick: number
  tickDays: number
  realTimestampMs: number
}

export interface MacroState {
  macroEntropy: number
  imagEnergy: number
  collapsePressure: number
}

export interface ProgressState {
  era: EraId
  unlockedTechIds: string[]
  selectedPolicyIds: string[]
}

export interface StoryState {
  triggeredEventIds: string[]
  flags: Record<string, boolean>
}

export interface MetaState {
  cycle: number
  memoryShards: number
}

export interface WorldState {
  saveVersion: number
  time: WorldTime
  macro: MacroState
  blocks: BlockState[]
  progress: ProgressState
  trade: TradeState
  story: StoryState
  meta: MetaState
}
