import nodeTypesJson from '../../data/nodeTypes.json'
import type { NodeTypeDef } from '../../types'
import type { EdgeInstance, NodeInstance, NodeTypeId } from '../../types'

interface PortSchema {
  inputs: string[]
  outputs: string[]
}

interface CandidateConnection {
  source?: string | null
  target?: string | null
  sourceHandle?: string | null
  targetHandle?: string | null
}

export type ConnectionValidation =
  | {
      ok: true
      fromPort: string
      toPort: string
    }
  | {
      ok: false
      reason: string
    }

const DEFAULT_INPUT_PORT = 'in'
const DEFAULT_OUTPUT_PORT = 'out'
const NODE_TYPE_DEFS = nodeTypesJson as NodeTypeDef[]
const PORT_SCHEMA_BY_TYPE = createPortSchemaMap(NODE_TYPE_DEFS)

export function listInputPorts(nodeType: NodeTypeId): string[] {
  const schema = PORT_SCHEMA_BY_TYPE.get(nodeType)
  if (!schema) {
    return [DEFAULT_INPUT_PORT]
  }
  return schema.inputs
}

export function listOutputPorts(nodeType: NodeTypeId): string[] {
  const schema = PORT_SCHEMA_BY_TYPE.get(nodeType)
  if (!schema) {
    return [DEFAULT_OUTPUT_PORT]
  }
  return schema.outputs
}

export function validateGraphConnection(
  connection: CandidateConnection,
  nodes: NodeInstance[],
  edges: EdgeInstance[]
): ConnectionValidation {
  const sourceId = connection.source ?? undefined
  const targetId = connection.target ?? undefined
  if (!sourceId || !targetId) {
    return invalid('Invalid edge: source/target is missing.')
  }

  if (sourceId === targetId) {
    return invalid('Invalid edge: self loop is not allowed.')
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const sourceNode = nodeById.get(sourceId)
  const targetNode = nodeById.get(targetId)
  if (!sourceNode || !targetNode) {
    return invalid('Invalid edge: source or target node does not exist.')
  }

  const sourcePorts = listOutputPorts(sourceNode.type)
  const targetPorts = listInputPorts(targetNode.type)

  const fromPort = resolvePort(connection.sourceHandle, sourcePorts)
  if (!fromPort) {
    return invalid('Invalid edge: source node has no output port.')
  }
  if (!sourcePorts.includes(fromPort)) {
    return invalid(`Invalid edge: source port "${fromPort}" is not available on ${sourceNode.type}.`)
  }

  const toPort = resolvePort(connection.targetHandle, targetPorts)
  if (!toPort) {
    return invalid('Invalid edge: target node has no input port.')
  }
  if (!targetPorts.includes(toPort)) {
    return invalid(`Invalid edge: target port "${toPort}" is not available on ${targetNode.type}.`)
  }

  const duplicate = edges.some(
    (edge) =>
      edge.fromNodeId === sourceId &&
      edge.fromPort === fromPort &&
      edge.toNodeId === targetId &&
      edge.toPort === toPort
  )
  if (duplicate) {
    return invalid('Invalid edge: duplicate connection.')
  }

  const targetPortOccupied = edges.some((edge) => edge.toNodeId === targetId && edge.toPort === toPort)
  if (targetPortOccupied) {
    return invalid(`Invalid edge: target port "${toPort}" already has an incoming edge.`)
  }

  return {
    ok: true,
    fromPort,
    toPort,
  }
}

function createPortSchemaMap(defs: NodeTypeDef[]): Map<NodeTypeId, PortSchema> {
  const map = new Map<NodeTypeId, PortSchema>()
  for (const def of defs) {
    map.set(def.id, {
      inputs: normalizePorts(def.ports.inputs),
      outputs: normalizePorts(def.ports.outputs),
    })
  }
  return map
}

function normalizePorts(ports: string[]): string[] {
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const raw of ports) {
    const value = raw.trim()
    if (value.length === 0 || seen.has(value)) {
      continue
    }
    seen.add(value)
    normalized.push(value)
  }

  return normalized
}

function resolvePort(handle: string | null | undefined, ports: string[]): string | undefined {
  if (typeof handle === 'string' && handle.trim().length > 0) {
    return handle
  }
  return ports[0]
}

function invalid(reason: string): ConnectionValidation {
  return {
    ok: false,
    reason,
  }
}
