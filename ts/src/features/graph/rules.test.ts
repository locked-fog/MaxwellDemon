import { describe, expect, it } from 'vitest'
import type { EdgeInstance, NodeInstance, NodeTypeId } from '../../types'
import { listInputPorts, listOutputPorts, validateGraphConnection } from './rules'

describe('graph connection rules', () => {
  it('loads input/output ports from node type schema', () => {
    expect(listOutputPorts('extractor')).toEqual(['out'])
    expect(listInputPorts('processor')).toEqual(['in'])
    expect(listOutputPorts('power_gen')).toEqual([])
  })

  it('rejects self loop', () => {
    const nodes = [createNode('n1', 'extractor')]
    const result = validateGraphConnection(
      {
        source: 'n1',
        target: 'n1',
      },
      nodes,
      []
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('self loop')
    }
  })

  it('rejects source node without output port', () => {
    const nodes = [createNode('n1', 'power_gen'), createNode('n2', 'processor')]
    const result = validateGraphConnection(
      {
        source: 'n1',
        target: 'n2',
      },
      nodes,
      []
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('no output port')
    }
  })

  it('rejects duplicate connections', () => {
    const nodes = [createNode('n1', 'extractor'), createNode('n2', 'processor')]
    const edges: EdgeInstance[] = [
      {
        id: 'e1',
        kind: 'item',
        fromNodeId: 'n1',
        fromPort: 'out',
        toNodeId: 'n2',
        toPort: 'in',
        capacityPerTick: 10,
      },
    ]
    const result = validateGraphConnection(
      {
        source: 'n1',
        target: 'n2',
      },
      nodes,
      edges
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('duplicate')
    }
  })

  it('rejects a second incoming edge into the same target port', () => {
    const nodes = [
      createNode('n1', 'extractor'),
      createNode('n2', 'extractor'),
      createNode('n3', 'processor'),
    ]
    const edges: EdgeInstance[] = [
      {
        id: 'e1',
        kind: 'item',
        fromNodeId: 'n1',
        fromPort: 'out',
        toNodeId: 'n3',
        toPort: 'in',
        capacityPerTick: 10,
      },
    ]
    const result = validateGraphConnection(
      {
        source: 'n2',
        target: 'n3',
      },
      nodes,
      edges
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('already has an incoming edge')
    }
  })

  it('accepts valid connection and resolves default ports', () => {
    const nodes = [createNode('n1', 'extractor'), createNode('n2', 'processor')]
    const result = validateGraphConnection(
      {
        source: 'n1',
        target: 'n2',
      },
      nodes,
      []
    )
    expect(result).toEqual({
      ok: true,
      fromPort: 'out',
      toPort: 'in',
    })
  })

  it('rejects explicit handles not available on node types', () => {
    const nodes = [createNode('n1', 'extractor'), createNode('n2', 'processor')]
    const result = validateGraphConnection(
      {
        source: 'n1',
        target: 'n2',
        sourceHandle: 'bad_out',
        targetHandle: 'bad_in',
      },
      nodes,
      []
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('source port')
    }
  })
})

function createNode(id: string, type: NodeTypeId): NodeInstance {
  return {
    id,
    type,
    x: 0,
    y: 0,
    params: {},
    enabled: true,
  }
}
