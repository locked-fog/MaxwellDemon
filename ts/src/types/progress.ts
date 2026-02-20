import type { EraId, ResourceId } from './common'
import type { NodeTypeId } from './graph'

export type PolicyTrack = 'Industry' | 'Ecology' | 'Faith' | 'Trade'

export type UnlockDef =
  | { kind: 'node_type'; id: NodeTypeId }
  | { kind: 'recipe'; id: string }
  | { kind: 'tech'; id: string }
  | { kind: 'policy_slot'; amount: number }
  | { kind: 'map_radius'; amount: number }
  | { kind: 'feature'; id: 'merchant' | 'contract' | 'rebirth' }

export type EffectDef =
  | {
      kind: 'modifier'
      target:
        | 'throughput'
        | 'power_efficiency'
        | 'market_price'
        | 'entropy_gain'
        | 'collapse_pressure'
      operator: 'add' | 'mul'
      value: number
    }
  | { kind: 'unlock'; unlock: UnlockDef }

export type TriggerDef =
  | { kind: 'era_reached'; era: EraId }
  | { kind: 'day_reached'; day: number }
  | { kind: 'resource_at_least'; id: ResourceId; qty: number }
  | { kind: 'collapse_pressure_at_least'; value: number }
  | { kind: 'tech_unlocked'; id: string }

export type ActionDef =
  | { kind: 'grant_resource'; id: ResourceId; qty: number }
  | { kind: 'add_memory_shards'; qty: number }
  | { kind: 'set_flag'; flag: string; value: boolean }
  | { kind: 'add_collapse_pressure'; value: number }
  | { kind: 'unlock'; unlock: UnlockDef }
