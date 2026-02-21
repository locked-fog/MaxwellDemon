import { describe, expect, it } from 'vitest'
import type { BlockState, RecipeDef } from '../../types'
import { stepBlock } from './core'

const recipes: Record<string, RecipeDef> = {
  smelt_ingot: {
    id: 'smelt_ingot',
    name: '冶炼',
    desc: '2 ore -> 1 ingot',
    inputs: [{ id: 'ore', qty: 2 }],
    outputs: [{ id: 'ingot', qty: 1 }],
    timeDays: 0.1,
    powerPerDay: 10,
  },
}

describe('stepBlock', () => {
  it('runs extractor -> processor -> storage chain in fixed tick order', () => {
    const block = createBaselineBlock()

    const first = stepBlock(block, {
      tickDays: 0.1,
      entropyFactor: 0,
      recipes,
    })

    const second = stepBlock(first.block, {
      tickDays: 0.1,
      entropyFactor: 0,
      recipes,
    })

    const processorAfterFirst = first.block.graph.nodes.find((node) => node.id === 'n-processor')
    const storageAfterSecond = second.block.graph.nodes.find((node) => node.id === 'n-storage')
    const ingotQty = positive(storageAfterSecond?.runtime?.inputBuf.in.ingot)

    expect(processorAfterFirst?.runtime?.lastStatus).toEqual({
      kind: 'stalled',
      reason: 'no_input',
    })
    expect(ingotQty).toBeCloseTo(1, 6)
  })

  it('sets stalled:no_power when production exceeds power budget', () => {
    const block = createBaselineBlock()
    const powerNode = block.graph.nodes.find((node) => node.id === 'n-power')
    if (powerNode) {
      powerNode.params.powerPerTick = 0
    }

    const result = stepBlock(block, {
      tickDays: 0.1,
      entropyFactor: 0,
      recipes,
    })

    const extractor = result.block.graph.nodes.find((node) => node.id === 'n-extractor')
    expect(extractor?.runtime?.lastStatus).toEqual({
      kind: 'stalled',
      reason: 'no_power',
    })
  })

  it('sets stalled:output_full when extractor output buffer exceeds cap', () => {
    const block = createBaselineBlock()
    const extractor = block.graph.nodes.find((node) => node.id === 'n-extractor')
    if (extractor) {
      extractor.params.maxOutputBuffer = 1
      extractor.params.ratePerTick = 2
    }

    const result = stepBlock(block, {
      tickDays: 0.1,
      entropyFactor: 0,
      recipes,
    })

    const nextExtractor = result.block.graph.nodes.find((node) => node.id === 'n-extractor')
    expect(nextExtractor?.runtime?.lastStatus).toEqual({
      kind: 'stalled',
      reason: 'output_full',
    })
  })

  it('is deterministic with the same state and input sequence', () => {
    let left = createBaselineBlock()
    let right = createBaselineBlock()

    for (let i = 0; i < 4; i += 1) {
      left = stepBlock(left, { tickDays: 0.1, entropyFactor: 0.2, recipes }).block
      right = stepBlock(right, { tickDays: 0.1, entropyFactor: 0.2, recipes }).block
    }

    expect(right).toEqual(left)
  })

  it('applies per-block extraction rate cap per tick', () => {
    const block = createBaselineBlock()
    block.extractionRatePerTick.ore = 1.5
    const extractor = block.graph.nodes.find((node) => node.id === 'n-extractor')
    if (extractor) {
      extractor.params.ratePerTick = 10
    }

    const result = stepBlock(block, {
      tickDays: 0.1,
      entropyFactor: 0,
      recipes,
    })

    const edge = result.block.graph.edges.find((item) => item.id === 'e-1')
    expect(edge?.lastFlowPerTick).toBeCloseTo(1.5, 6)
  })

  it('runs port inventory interaction after edge transfer in the same tick', () => {
    const block = createPortOrderBlock()

    const first = stepBlock(block, {
      tickDays: 0.1,
      entropyFactor: 0,
      recipes,
    })
    const second = stepBlock(first.block, {
      tickDays: 0.1,
      entropyFactor: 0,
      recipes,
    })

    const edgeAfterFirst = first.block.graph.edges.find((item) => item.id === 'e-port')
    const edgeAfterSecond = second.block.graph.edges.find((item) => item.id === 'e-port')
    const portInAfterFirst = first.block.graph.nodes.find((node) => node.id === 'n-port-in')
    const portInAfterSecond = second.block.graph.nodes.find((node) => node.id === 'n-port-in')

    expect(edgeAfterFirst?.lastFlowPerTick ?? 0).toBeCloseTo(0, 6)
    expect(edgeAfterSecond?.lastFlowPerTick ?? 0).toBeCloseTo(2, 6)
    expect(portInAfterFirst?.runtime?.lastStatus).toEqual({
      kind: 'stalled',
      reason: 'no_input',
    })
    expect(portInAfterSecond?.runtime?.lastStatus).toEqual({ kind: 'running' })
  })

  it('returns unmetDemand based on actual port_out inventory shortfall', () => {
    const block = createPortDemandBlock()

    const result = stepBlock(block, {
      tickDays: 0.1,
      entropyFactor: 0,
      recipes,
    })

    expect(result.unmetDemand.ore).toBeCloseTo(3, 6)
    expect(result.unmetDemand.wood).toBeCloseTo(2, 6)
  })

  it('does not report unmetDemand when port_out is fully blocked by output buffer', () => {
    const block = createBufferLimitedPortDemandBlock()

    const result = stepBlock(block, {
      tickDays: 0.1,
      entropyFactor: 0,
      recipes,
    })

    expect(result.unmetDemand.ore ?? 0).toBeCloseTo(0, 6)
  })
})

function createBaselineBlock(): BlockState {
  return {
    id: 'block-1',
    coord: { q: 0, r: 0 },
    terrain: 'plains',
    unlocked: true,
    capacitySlots: 10,
    outletCapacityPerTick: 20,
    extractionRatePerTick: { ore: 2 },
    inventory: {},
    graph: {
      nodes: [
        {
          id: 'n-processor',
          type: 'processor',
          x: 180,
          y: 80,
          params: {
            recipeId: 'smelt_ingot',
            inputPort: 'in',
            outputPort: 'out',
          },
          enabled: true,
        },
        {
          id: 'n-power',
          type: 'power_gen',
          x: 20,
          y: 80,
          params: {
            powerPerTick: 10,
          },
          enabled: true,
        },
        {
          id: 'n-extractor',
          type: 'extractor',
          x: 80,
          y: 80,
          params: {
            resourceId: 'ore',
            ratePerTick: 2,
            powerPerTick: 1,
            outputPort: 'out',
            maxOutputBuffer: 10,
          },
          enabled: true,
        },
        {
          id: 'n-storage',
          type: 'storage',
          x: 260,
          y: 80,
          params: {},
          enabled: true,
        },
      ],
      edges: [
        {
          id: 'e-2',
          kind: 'item',
          fromNodeId: 'n-processor',
          fromPort: 'out',
          toNodeId: 'n-storage',
          toPort: 'in',
          capacityPerTick: 20,
        },
        {
          id: 'e-1',
          kind: 'item',
          fromNodeId: 'n-extractor',
          fromPort: 'out',
          toNodeId: 'n-processor',
          toPort: 'in',
          capacityPerTick: 20,
        },
      ],
    },
  }
}

function createPortOrderBlock(): BlockState {
  return {
    id: 'block-port',
    coord: { q: 0, r: 0 },
    terrain: 'plains',
    unlocked: true,
    capacitySlots: 10,
    outletCapacityPerTick: 20,
    extractionRatePerTick: {},
    inventory: { ore: 5 },
    graph: {
      nodes: [
        {
          id: 'n-port-out',
          type: 'port_out',
          x: 20,
          y: 20,
          params: {
            outputPort: 'out',
            resourceId: 'ore',
            ratePerTick: 2,
          },
          enabled: true,
        },
        {
          id: 'n-port-in',
          type: 'port_in',
          x: 140,
          y: 20,
          params: {
            inputPort: 'in',
            ratePerTick: 10,
          },
          enabled: true,
        },
      ],
      edges: [
        {
          id: 'e-port',
          kind: 'item',
          fromNodeId: 'n-port-out',
          fromPort: 'out',
          toNodeId: 'n-port-in',
          toPort: 'in',
          capacityPerTick: 10,
        },
      ],
    },
  }
}

function createPortDemandBlock(): BlockState {
  return {
    id: 'block-demand',
    coord: { q: 0, r: 0 },
    terrain: 'plains',
    unlocked: true,
    capacitySlots: 10,
    outletCapacityPerTick: 20,
    extractionRatePerTick: {},
    inventory: { ore: 1, wood: 2 },
    graph: {
      nodes: [
        {
          id: 'n-port-out-ore',
          type: 'port_out',
          x: 20,
          y: 20,
          params: {
            outputPort: 'out',
            resourceId: 'ore',
            ratePerTick: 4,
          },
          enabled: true,
        },
        {
          id: 'n-port-out-wood',
          type: 'port_out',
          x: 60,
          y: 20,
          params: {
            outputPort: 'out',
            resourceId: 'wood',
            ratePerTick: 4,
          },
          enabled: true,
        },
      ],
      edges: [],
    },
  }
}

function createBufferLimitedPortDemandBlock(): BlockState {
  return {
    id: 'block-demand-buffer',
    coord: { q: 0, r: 0 },
    terrain: 'plains',
    unlocked: true,
    capacitySlots: 10,
    outletCapacityPerTick: 20,
    extractionRatePerTick: {},
    inventory: { ore: 10 },
    graph: {
      nodes: [
        {
          id: 'n-port-out-ore',
          type: 'port_out',
          x: 20,
          y: 20,
          params: {
            outputPort: 'out',
            resourceId: 'ore',
            ratePerTick: 5,
            maxOutputBuffer: 1,
          },
          enabled: true,
          runtime: {
            inputBuf: {},
            outputBuf: {
              out: {
                ore: 1,
              },
            },
            workProgressDays: 0,
          },
        },
      ],
      edges: [],
    },
  }
}

function positive(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}
