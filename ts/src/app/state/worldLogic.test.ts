import { describe, expect, it } from 'vitest'
import type { WorldSessionState } from './worldLogic'
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
    expect(session.world.mapCellCount).toBe(300)
    expect(session.world.mapSeed).toBe(2026)
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

  it('generates meaningful extraction rates for the center block', () => {
    const session = createInitialSession({
      nowUnixMs: 1700000000000,
      mapCellCount: 300,
      mapSeed: 2026,
    })
    const center = session.world.blocks.find((block) => block.id === toBlockId({ q: 0, r: 0 }))
    const rates = center?.extractionRatePerTick ?? {}
    const total = Object.values(rates).reduce((sum, qty) => sum + qty, 0)
    const maxSingle = Object.values(rates).reduce((max, qty) => Math.max(max, qty), 0)

    expect(total).toBeGreaterThan(10)
    expect(maxSingle).toBeGreaterThan(5)
  })

  it('keeps identical extraction rates with the same mapSeed', () => {
    const left = createInitialSession({
      nowUnixMs: 1700000000000,
      mapCellCount: 300,
      mapSeed: 10101,
    })
    const right = createInitialSession({
      nowUnixMs: 1700000000000,
      mapCellCount: 300,
      mapSeed: 10101,
    })

    const leftCenter = left.world.blocks.find((block) => block.id === toBlockId({ q: 0, r: 0 }))
    const rightCenter = right.world.blocks.find((block) => block.id === toBlockId({ q: 0, r: 0 }))
    expect(rightCenter?.terrain).toBe(leftCenter?.terrain)
    expect(rightCenter?.extractionRatePerTick).toEqual(leftCenter?.extractionRatePerTick)
  })

  it('advances time and writes sim runtime state on tick_world', () => {
    const session = createInitialSession({
      nowUnixMs: 1700000000000,
      mapCellCount: 300,
      noiseSeed: 2026,
    })
    const withGraph = reduceWorldSession(session, {
      type: 'set_selected_block_graph',
      graph: createTickGraph(),
    })

    const next = reduceWorldSession(withGraph, {
      type: 'tick_world',
      tickCount: 1,
      nowUnixMs: 1700000001234,
    })

    const selected = next.world.blocks.find((block) => block.id === next.selectedBlockId)
    const extractor = selected?.graph.nodes.find((node) => node.id === 'n_extractor')
    const storage = selected?.graph.nodes.find((node) => node.id === 'n_storage')
    const edge = selected?.graph.edges.find((item) => item.id === 'e_ore')

    expect(next.world.time.tick).toBe(withGraph.world.time.tick + 1)
    expect(next.world.time.day).toBeCloseTo(withGraph.world.time.day + withGraph.world.time.tickDays, 6)
    expect(next.world.time.realTimestampMs).toBe(1700000001234)
    expect(extractor?.runtime?.lastStatus).toEqual({ kind: 'running' })
    expect(readQty(storage?.runtime?.inputBuf.in.ore)).toBeCloseTo(2, 6)
    expect(edge?.lastFlowPerTick).toBeCloseTo(2, 6)
  })

  it('keeps deterministic world state for identical tick sequences', () => {
    const leftSession = createInitialSession({
      nowUnixMs: 1700000000000,
      mapCellCount: 300,
      noiseSeed: 2026,
    })
    const rightSession = createInitialSession({
      nowUnixMs: 1700000000000,
      mapCellCount: 300,
      noiseSeed: 2026,
    })

    let left = reduceWorldSession(leftSession, {
      type: 'set_selected_block_graph',
      graph: createTickGraph(),
    })
    let right = reduceWorldSession(rightSession, {
      type: 'set_selected_block_graph',
      graph: createTickGraph(),
    })

    const times = [1700000001111, 1700000002222, 1700000003333]
    for (const nowUnixMs of times) {
      left = reduceWorldSession(left, { type: 'tick_world', nowUnixMs })
      right = reduceWorldSession(right, { type: 'tick_world', nowUnixMs })
    }

    expect(right).toEqual(left)
  })

  it('keeps deterministic cross-block logistics with identical tick inputs', () => {
    let left = createCrossBlockSession({
      centerDemandPerTick: 5,
      eastInventoryOre: 30,
      eastOutletCapacityPerTick: 4,
      unlockNortheast: true,
      northeastInventoryOre: 30,
      northeastOutletCapacityPerTick: 4,
    })
    let right = createCrossBlockSession({
      centerDemandPerTick: 5,
      eastInventoryOre: 30,
      eastOutletCapacityPerTick: 4,
      unlockNortheast: true,
      northeastInventoryOre: 30,
      northeastOutletCapacityPerTick: 4,
    })

    for (const nowUnixMs of [1700000001111, 1700000002222, 1700000003333]) {
      left = reduceWorldSession(left, { type: 'tick_world', nowUnixMs })
      right = reduceWorldSession(right, { type: 'tick_world', nowUnixMs })
    }

    expect(right).toEqual(left)
  })

  it('allocates cross-block imports with clockwise neighbor priority', () => {
    const centerId = toBlockId({ q: 0, r: 0 })
    const eastId = toBlockId({ q: 1, r: 0 })
    const northeastId = toBlockId({ q: 1, r: -1 })
    const session = createCrossBlockSession({
      centerDemandPerTick: 5,
      eastInventoryOre: 1,
      eastOutletCapacityPerTick: 10,
      unlockNortheast: true,
      northeastInventoryOre: 10,
      northeastOutletCapacityPerTick: 10,
    })

    const next = reduceWorldSession(session, {
      type: 'tick_world',
      tickCount: 1,
      nowUnixMs: 1700000001234,
    })

    expect(readBlockInventory(next, centerId, 'ore')).toBeCloseTo(5, 6)
    expect(readBlockInventory(next, eastId, 'ore')).toBeCloseTo(0, 6)
    expect(readBlockInventory(next, northeastId, 'ore')).toBeCloseTo(6, 6)
  })

  it('respects outletCapacityPerTick when exporting to neighboring blocks', () => {
    const centerId = toBlockId({ q: 0, r: 0 })
    const eastId = toBlockId({ q: 1, r: 0 })
    const session = createCrossBlockSession({
      centerDemandPerTick: 9,
      eastInventoryOre: 20,
      eastOutletCapacityPerTick: 2,
      unlockNortheast: false,
    })

    const next = reduceWorldSession(session, {
      type: 'tick_world',
      tickCount: 1,
      nowUnixMs: 1700000001234,
    })

    expect(readBlockInventory(next, centerId, 'ore')).toBeCloseTo(2, 6)
    expect(readBlockInventory(next, eastId, 'ore')).toBeCloseTo(18, 6)
  })

  it('caps total transfer when multiple resources compete for one outlet budget', () => {
    const centerId = toBlockId({ q: 0, r: 0 })
    const eastId = toBlockId({ q: 1, r: 0 })
    const session = createMultiResourceBudgetSession()

    const next = reduceWorldSession(session, {
      type: 'tick_world',
      tickCount: 1,
      nowUnixMs: 1700000001234,
    })

    const centerOre = readBlockInventory(next, centerId, 'ore')
    const centerWood = readBlockInventory(next, centerId, 'wood')
    const movedTotal = centerOre + centerWood

    expect(movedTotal).toBeCloseTo(5, 6)
    expect(centerOre).toBeCloseTo(5, 6)
    expect(centerWood).toBeCloseTo(0, 6)
    expect(readBlockInventory(next, eastId, 'ore')).toBeCloseTo(5, 6)
    expect(readBlockInventory(next, eastId, 'wood')).toBeCloseTo(10, 6)
  })

  it('unlocks tech via reducer action and spends world science', () => {
    const session = createInitialSession({
      nowUnixMs: 1700000000000,
      mapCellCount: 300,
      mapSeed: 2026,
    })
    const centerId = toBlockId({ q: 0, r: 0 })
    const prepared: WorldSessionState = {
      ...session,
      world: {
        ...session.world,
        blocks: session.world.blocks.map((block) =>
          block.id === centerId ? { ...block, inventory: { ...block.inventory, science: 20 } } : block
        ),
      },
    }

    const next = reduceWorldSession(prepared, { type: 'unlock_tech', techId: 'tech_smelting' })
    const center = next.world.blocks.find((block) => block.id === centerId)

    expect(next.world.progress.unlockedTechIds).toContain('tech_smelting')
    expect(readQty(center?.inventory.science)).toBeCloseTo(10, 6)
  })

  it('applies policy throughput modifier to sim result during tick_world', () => {
    const base = createInitialSession({
      nowUnixMs: 1700000000000,
      mapCellCount: 300,
      mapSeed: 2026,
    })
    const withGraph = reduceWorldSession(base, {
      type: 'set_selected_block_graph',
      graph: createThroughputGraph(),
    })
    const baseline = reduceWorldSession(withGraph, {
      type: 'tick_world',
      tickCount: 1,
      nowUnixMs: 1700000001234,
    })

    const withPolicy = reduceWorldSession(withGraph, {
      type: 'toggle_policy',
      policyId: 'policy_industry_push',
    })
    const boosted = reduceWorldSession(withPolicy, {
      type: 'tick_world',
      tickCount: 1,
      nowUnixMs: 1700000001234,
    })

    const baselineEdge = baseline.world.blocks
      .find((block) => block.id === baseline.selectedBlockId)
      ?.graph.edges.find((edge) => edge.id === 'e_ore')
    const boostedEdge = boosted.world.blocks
      .find((block) => block.id === boosted.selectedBlockId)
      ?.graph.edges.find((edge) => edge.id === 'e_ore')

    expect(readQty(boostedEdge?.lastFlowPerTick)).toBeGreaterThan(readQty(baselineEdge?.lastFlowPerTick))
  })
})

interface CrossBlockSessionOptions {
  centerDemandPerTick: number
  eastInventoryOre: number
  eastOutletCapacityPerTick: number
  unlockNortheast: boolean
  northeastInventoryOre?: number
  northeastOutletCapacityPerTick?: number
}

function createCrossBlockSession(options: CrossBlockSessionOptions): WorldSessionState {
  const base = createInitialSession({
    nowUnixMs: 1700000000000,
    mapCellCount: 300,
    mapSeed: 2026,
  })
  const centerId = toBlockId({ q: 0, r: 0 })
  const eastId = toBlockId({ q: 1, r: 0 })
  const northeastId = toBlockId({ q: 1, r: -1 })

  const blocks = base.world.blocks.map((block) => {
    if (block.id === centerId) {
      return {
        ...block,
        unlocked: true,
        inventory: {},
        graph: createCrossBlockDemandGraph(options.centerDemandPerTick),
      }
    }

    if (block.id === eastId) {
      return {
        ...block,
        unlocked: true,
        outletCapacityPerTick: options.eastOutletCapacityPerTick,
        inventory: { ore: options.eastInventoryOre },
        graph: { nodes: [], edges: [] },
      }
    }

    if (block.id === northeastId) {
      return {
        ...block,
        unlocked: options.unlockNortheast,
        outletCapacityPerTick:
          options.northeastOutletCapacityPerTick ?? block.outletCapacityPerTick,
        inventory: { ore: options.northeastInventoryOre ?? 0 },
        graph: { nodes: [], edges: [] },
      }
    }

    return block
  })

  return {
    ...base,
    world: {
      ...base.world,
      blocks,
    },
  }
}

function createCrossBlockDemandGraph(ratePerTick: number) {
  return {
    nodes: [
      {
        id: 'n-demand-port-out',
        type: 'port_out' as const,
        x: 20,
        y: 20,
        params: {
          resourceId: 'ore',
          ratePerTick,
          outputPort: 'out',
        },
        enabled: true,
      },
    ],
    edges: [],
  }
}

function createMultiResourceBudgetSession(): WorldSessionState {
  const base = createInitialSession({
    nowUnixMs: 1700000000000,
    mapCellCount: 300,
    mapSeed: 2026,
  })
  const centerId = toBlockId({ q: 0, r: 0 })
  const eastId = toBlockId({ q: 1, r: 0 })
  const northeastId = toBlockId({ q: 1, r: -1 })

  const blocks = base.world.blocks.map((block) => {
    if (block.id === centerId) {
      return {
        ...block,
        unlocked: true,
        inventory: {},
        graph: createMultiResourceDemandGraph(),
      }
    }

    if (block.id === eastId) {
      return {
        ...block,
        unlocked: true,
        outletCapacityPerTick: 5,
        inventory: { ore: 10, wood: 10 },
        graph: { nodes: [], edges: [] },
      }
    }

    if (block.id === northeastId) {
      return {
        ...block,
        unlocked: false,
        inventory: {},
        graph: { nodes: [], edges: [] },
      }
    }

    return block
  })

  return {
    ...base,
    world: {
      ...base.world,
      blocks,
    },
  }
}

function createMultiResourceDemandGraph() {
  return {
    nodes: [
      {
        id: 'n-demand-port-out-ore',
        type: 'port_out' as const,
        x: 20,
        y: 20,
        params: {
          resourceId: 'ore',
          ratePerTick: 5,
          outputPort: 'out',
        },
        enabled: true,
      },
      {
        id: 'n-demand-port-out-wood',
        type: 'port_out' as const,
        x: 60,
        y: 20,
        params: {
          resourceId: 'wood',
          ratePerTick: 5,
          outputPort: 'out',
        },
        enabled: true,
      },
    ],
    edges: [],
  }
}

function readBlockInventory(
  session: WorldSessionState,
  blockId: string,
  resourceId: string
): number {
  const block = session.world.blocks.find((item) => item.id === blockId)
  return readQty(block?.inventory[resourceId])
}

function createTickGraph() {
  return {
    nodes: [
      {
        id: 'n_power',
        type: 'power_gen' as const,
        x: 10,
        y: 20,
        params: { powerPerTick: 10 },
        enabled: true,
      },
      {
        id: 'n_extractor',
        type: 'extractor' as const,
        x: 80,
        y: 20,
        params: {
          resourceId: 'ore',
          ratePerTick: 2,
          powerPerTick: 1,
          outputPort: 'out',
        },
        enabled: true,
      },
      {
        id: 'n_storage',
        type: 'storage' as const,
        x: 140,
        y: 20,
        params: {},
        enabled: true,
      },
    ],
    edges: [
      {
        id: 'e_ore',
        kind: 'item' as const,
        fromNodeId: 'n_extractor',
        fromPort: 'out',
        toNodeId: 'n_storage',
        toPort: 'in',
        capacityPerTick: 10,
      },
    ],
  }
}

function createThroughputGraph() {
  return {
    nodes: [
      {
        id: 'n_extractor',
        type: 'extractor' as const,
        x: 40,
        y: 20,
        params: {
          resourceId: 'ore',
          ratePerTick: 2,
          powerPerTick: 0,
          outputPort: 'out',
        },
        enabled: true,
      },
      {
        id: 'n_storage',
        type: 'storage' as const,
        x: 140,
        y: 20,
        params: {},
        enabled: true,
      },
    ],
    edges: [
      {
        id: 'e_ore',
        kind: 'item' as const,
        fromNodeId: 'n_extractor',
        fromPort: 'out',
        toNodeId: 'n_storage',
        toPort: 'in',
        capacityPerTick: 10,
      },
    ],
  }
}

function readQty(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
