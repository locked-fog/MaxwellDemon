import type {
  BlockState,
  GraphState,
  MacroState,
  MetaState,
  ProgressState,
  ResourceInventory,
  StoryState,
  TradeState,
  WorldTime,
} from '../../types'

export interface SaveMigration {
  fromVersion: number
  toVersion: number
  migrate: (raw: unknown) => unknown
}

export const saveVersion = 1

// Compact save keeps map generation deterministic via mapSeed/mapCellCount
// and stores only mutable per-block fields.
export interface CompactBlockSave {
  id: string
  unlocked: boolean
  extractionRatePerTick: ResourceInventory
  inventory: ResourceInventory
  graph: GraphState
  deposits: ResourceInventory
}

export interface CompactWorldSave {
  saveVersion: number
  mapSeed: number
  mapCellCount: number
  time: WorldTime
  macro: MacroState
  progress: ProgressState
  trade: TradeState
  story: StoryState
  meta: MetaState
  blocks: CompactBlockSave[]
}

export function toCompactBlockSave(block: BlockState): CompactBlockSave {
  return {
    id: block.id,
    unlocked: block.unlocked,
    extractionRatePerTick: structuredClone(block.extractionRatePerTick),
    inventory: structuredClone(block.inventory),
    graph: structuredClone(block.graph),
    deposits: structuredClone(block.deposits),
  }
}
