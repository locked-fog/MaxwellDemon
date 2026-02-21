import type { RecipeDef, ResourceInventory } from '../../types'
import type { BlockState } from '../../types/world'

export interface SimTickConfig {
  tickDays: number
  entropyFactor: number
  entropyGainMultiplier?: number
  throughputMultiplier?: number
  powerEfficiencyMultiplier?: number
  recipes: Record<string, RecipeDef>
}

export interface EdgeFlow {
  edgeId: string
  moved: number
}

export interface SimTickResult {
  block: BlockState
  edgeFlows: EdgeFlow[]
  powerProduced: number
  powerUsed: number
  effectiveRateMultiplier: number
  unmetDemand: ResourceInventory
}
