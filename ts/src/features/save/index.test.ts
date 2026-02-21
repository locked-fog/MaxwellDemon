import { describe, expect, it } from 'vitest'
import { createInitialWorld } from '../../app/state/worldLogic'
import {
  decodeWorldSaveFromBase64,
  encodeWorldSaveToBase64,
  SAVE_ENVELOPE_KIND,
  SAVE_EXPORT_PREFIX,
  SaveFormatError,
  toCompactWorldSave,
} from './index'

describe('save system', () => {
  it('restores equivalent world state after export -> import', () => {
    const world = createInitialWorld({
      mapCellCount: 91,
      mapSeed: 123456,
      nowUnixMs: 1_700_000_000_000,
    })
    world.time.day = 7.4
    world.time.tick = 64
    world.macro.macroEntropy = 0.16
    world.progress.unlockedTechIds = ['tech.power_1', 'tech.logistics_1']
    world.story.triggeredEventIds = ['story.t0_intro']
    world.meta.memoryShards = 3

    const center = world.blocks.find((block) => block.id === 'b_0_0')
    if (!center) {
      throw new Error('expected center block')
    }
    center.inventory.ore = 45
    center.inventory.wood = 20
    center.graph.nodes = [
      {
        id: 'node_extract_ore',
        type: 'extractor',
        x: 120,
        y: 80,
        params: { resourceId: 'ore' },
        enabled: true,
      },
      {
        id: 'node_store',
        type: 'storage',
        x: 340,
        y: 80,
        params: {},
        enabled: true,
      },
    ]
    center.graph.edges = [
      {
        id: 'edge_ore',
        kind: 'item',
        fromNodeId: 'node_extract_ore',
        fromPort: 'out',
        toNodeId: 'node_store',
        toPort: 'in',
        capacityPerTick: 12,
        lastFlowPerTick: 6,
      },
    ]

    const encoded = encodeWorldSaveToBase64(world)
    const imported = decodeWorldSaveFromBase64(encoded, createInitialWorld)

    expect(imported).toEqual(world)
  })

  it('migrates legacy saveVersion=0 payload during import', () => {
    const world = createInitialWorld({
      mapCellCount: 91,
      mapSeed: 2026,
      nowUnixMs: 1_700_000_200_000,
    })
    world.time.tick = 9
    world.meta.cycle = 2
    world.blocks[0].inventory.stone = 17

    const compact = toCompactWorldSave(world)
    const legacyPayload = { ...compact, saveVersion: 0 }
    const legacyEncoded = encodeEnvelope(0, legacyPayload)

    const imported = decodeWorldSaveFromBase64(legacyEncoded, createInitialWorld)

    expect(imported.saveVersion).toBe(1)
    expect(imported.time.tick).toBe(world.time.tick)
    expect(imported.meta.cycle).toBe(world.meta.cycle)
    expect(imported.blocks[0].inventory.stone).toBe(17)
  })

  it('throws explicit error for invalid save input', () => {
    expect(() => decodeWorldSaveFromBase64('bad-save', createInitialWorld)).toThrow(SaveFormatError)

    const invalidEnvelope = encodeEnvelope(1, { saveVersion: 1 })
    expect(() => decodeWorldSaveFromBase64(invalidEnvelope, createInitialWorld)).toThrow(
      /blocks array/i
    )
  })
})

function encodeEnvelope(version: number, payload: unknown): string {
  const json = JSON.stringify({
    kind: SAVE_ENVELOPE_KIND,
    saveVersion: version,
    payload,
  })
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return `${SAVE_EXPORT_PREFIX}.${btoa(binary)}`
}
