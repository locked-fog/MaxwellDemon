import type { EdgeKind, Id, ResourceInventory } from './common'

export type NodeTypeId =
  | 'extractor'
  | 'processor'
  | 'storage'
  | 'power_gen'
  | 'control'
  | 'port_in'
  | 'port_out'
  | 'market'
  | 'research'

export type NodeStatus =
  | { kind: 'running' }
  | { kind: 'stalled'; reason: 'no_input' | 'no_power' | 'output_full' | 'disabled' }

export interface NodeRuntime {
  inputBuf: Record<string, ResourceInventory>
  outputBuf: Record<string, ResourceInventory>
  workProgressDays: number
  lastStatus?: NodeStatus
}

export interface NodeInstance {
  id: Id
  type: NodeTypeId
  x: number
  y: number
  params: Record<string, unknown>
  enabled: boolean
  runtime?: NodeRuntime
}

export interface EdgeInstance {
  id: Id
  kind: EdgeKind
  fromNodeId: Id
  fromPort: string
  toNodeId: Id
  toPort: string
  capacityPerTick: number
  lastFlowPerTick?: number
}

export interface GraphState {
  nodes: NodeInstance[]
  edges: EdgeInstance[]
}
