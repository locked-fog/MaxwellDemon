import { describe, expect, it } from 'vitest'
import {
  createInitialSession,
  isBlockUnlockable,
  reduceWorldSession,
  toBlockId,
} from './worldLogic'

describe('worldLogic', () => {
  it('creates deterministic initial world with unlocked center block', () => {
    const session = createInitialSession({
      nowUnixMs: 1700000000000,
      mapCellCount: 300,
      noiseSeed: 2026,
    })
    const centerId = toBlockId({ q: 0, r: 0 })
    const center = session.world.blocks.find((block) => block.id === centerId)

    expect(session.world.blocks).toHaveLength(300)
    expect(session.selectedBlockId).toBe(centerId)
    expect(center?.unlocked).toBe(true)
    expect(session.world.saveVersion).toBe(1)
  })

  it('unlocks an adjacent block and selects it', () => {
    const session = createInitialSession({
      nowUnixMs: 1700000000000,
      mapCellCount: 300,
      noiseSeed: 2026,
    })
    const targetId = toBlockId({ q: 1, r: 0 })

    expect(isBlockUnlockable(session.world, targetId)).toBe(true)

    const next = reduceWorldSession(session, { type: 'unlock_block', blockId: targetId })
    const target = next.world.blocks.find((block) => block.id === targetId)

    expect(target?.unlocked).toBe(true)
    expect(next.selectedBlockId).toBe(targetId)
  })

  it('does not unlock non-adjacent blocks before path expansion', () => {
    const session = createInitialSession({
      nowUnixMs: 1700000000000,
      mapCellCount: 300,
      noiseSeed: 2026,
    })
    const targetId = toBlockId({ q: 2, r: 0 })

    expect(isBlockUnlockable(session.world, targetId)).toBe(false)

    const next = reduceWorldSession(session, { type: 'unlock_block', blockId: targetId })
    const target = next.world.blocks.find((block) => block.id === targetId)

    expect(target?.unlocked).toBe(false)
  })

  it('generates rich terrain distribution with water and coast present', () => {
    const session = createInitialSession({
      nowUnixMs: 1700000000000,
      mapCellCount: 300,
      noiseSeed: 2026,
    })
    const terrainSet = new Set(session.world.blocks.map((block) => block.terrain))

    expect(terrainSet.size).toBeGreaterThanOrEqual(4)
    expect(terrainSet.has('water')).toBe(true)
    expect(terrainSet.has('coast')).toBe(true)
    expect(terrainSet.has('mountain')).toBe(true)
  })

  it('updates selected block graph via reducer action', () => {
    const session = createInitialSession({
      nowUnixMs: 1700000000000,
      mapCellCount: 300,
      noiseSeed: 2026,
    })
    const graph = {
      nodes: [
        {
          id: 'n_a',
          type: 'extractor' as const,
          x: 10,
          y: 20,
          params: { resourceId: 'ore' },
          enabled: true,
        },
      ],
      edges: [],
    }

    const next = reduceWorldSession(session, { type: 'set_selected_block_graph', graph })
    const selected = next.world.blocks.find((block) => block.id === next.selectedBlockId)

    expect(selected?.graph.nodes).toHaveLength(1)
    expect(selected?.graph.nodes[0].id).toBe('n_a')
  })
})
