export type Id = string
export type ResourceId = string
export type EraId = 'T0' | 'T1' | 'T2' | 'T3' | 'T4'

export type EdgeKind = 'item' | 'fluid' | 'power'

export interface Stack {
  id: ResourceId
  qty: number
}

export type ResourceInventory = Record<ResourceId, number>
