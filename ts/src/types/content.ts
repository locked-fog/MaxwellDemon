import type { EraId, Id, ResourceId, Stack } from './common'
import type { NodeTypeId } from './graph'
import type { ActionDef, EffectDef, PolicyTrack, TriggerDef, UnlockDef } from './progress'

export interface ResourceDef {
  id: ResourceId
  name: string
  desc: string
  tags: string[]
}

export interface RecipeDef {
  id: Id
  name: string
  desc: string
  inputs: Stack[]
  outputs: Stack[]
  timeDays: number
  powerPerDay?: number
  tags?: string[]
}

export interface NodeTypeDef {
  id: NodeTypeId
  name: string
  desc: string
  ports: {
    inputs: string[]
    outputs: string[]
  }
  allowedRecipes?: string[]
  tags?: string[]
}

export interface TechDef {
  id: Id
  name: string
  desc: string
  era: EraId
  prereq: string[]
  cost: { science: number }
  unlocks: UnlockDef[]
}

export interface PolicyDef {
  id: Id
  name: string
  desc: string
  track: PolicyTrack
  prereq: string[]
  effects: EffectDef[]
}

export interface StoryEventDef {
  id: Id
  title: string
  text: string
  era: EraId
  triggers: TriggerDef[]
  actions: ActionDef[]
}

export interface TraderDef {
  id: Id
  name: string
  desc: string
  tags: string[]
}

export interface QuestDef {
  id: Id
  name: string
  desc: string
  kind: 'daily' | 'weekly'
  tags: string[]
}
