import { describe, expect, it } from 'vitest'
import { createInitialWorld } from '../../app/state/worldLogic'
import type { GraphState } from '../../types'
import {
  canSelectPolicy,
  canUnlockTech,
  computeProgressModifiers,
  computeUnlockState,
  countLockedGraphEntries,
  togglePolicy,
  unlockTech,
} from './core'

describe('progress core', () => {
  it('unlocks tech and deducts science from world inventory in deterministic block-id order', () => {
    const world = createInitialWorld({
      mapSeed: 2026,
      mapCellCount: 91,
      nowUnixMs: 1_700_000_000_000,
    })
    world.progress.unlockedTechIds = []
    const center = world.blocks.find((block) => block.id === 'b_0_0')
    const east = world.blocks.find((block) => block.id === 'b_1_0')
    if (!center || !east) {
      throw new Error('expected test blocks')
    }
    center.unlocked = true
    east.unlocked = true
    center.inventory.science = 7
    east.inventory.science = 8

    const result = unlockTech(world, 'tech_smelting')

    expect(result.ok).toBe(true)
    if (!result.ok || !result.world) {
      return
    }
    const nextCenter = result.world.blocks.find((block) => block.id === 'b_0_0')
    const nextEast = result.world.blocks.find((block) => block.id === 'b_1_0')
    expect(nextCenter?.inventory.science ?? 0).toBeCloseTo(0, 6)
    expect(nextEast?.inventory.science ?? 0).toBeCloseTo(5, 6)
    expect(result.world.progress.unlockedTechIds).toContain('tech_smelting')
  })

  it('fails unlock when tech prereq is missing', () => {
    const world = createInitialWorld({
      mapSeed: 2026,
      mapCellCount: 91,
      nowUnixMs: 1_700_000_000_000,
    })
    const check = canUnlockTech(world, 'tech_anchor')
    expect(check.ok).toBe(false)
    expect(check.reason).toContain('前置科技')
  })

  it('enforces policy slot limit while allowing same-track replacement', () => {
    const world = createInitialWorld({
      mapSeed: 2026,
      mapCellCount: 91,
      nowUnixMs: 1_700_000_000_000,
    })

    const first = togglePolicy(world, 'policy_industry_push')
    expect(first.ok).toBe(true)
    if (!first.ok || !first.world) {
      return
    }

    const blocked = canSelectPolicy(first.world, 'policy_ecology_balance')
    expect(blocked.ok).toBe(false)
    expect(blocked.reason).toContain('政策槽不足')

    const replace = togglePolicy(first.world, 'policy_industry_02')
    expect(replace.ok).toBe(true)
    if (!replace.ok || !replace.world) {
      return
    }

    expect(replace.world.progress.selectedPolicyIds).toContain('policy_industry_02')
    expect(replace.world.progress.selectedPolicyIds).not.toContain('policy_industry_push')
  })

  it('computes modifiers from selected policies', () => {
    const world = createInitialWorld({
      mapSeed: 2026,
      mapCellCount: 91,
      nowUnixMs: 1_700_000_000_000,
    })
    world.progress.selectedPolicyIds = ['policy_industry_push', 'policy_faith_order']

    const modifiers = computeProgressModifiers(world.progress)
    expect(modifiers.throughputMultiplier).toBeGreaterThan(1)
    expect(modifiers.entropyGainMultiplier).toBeGreaterThan(1)
    expect(modifiers.powerEfficiencyMultiplier).toBeGreaterThan(1)
    expect(modifiers.collapsePressureMultiplier).toBeLessThan(1)
  })

  it('counts locked graph entries against current unlock state', () => {
    const world = createInitialWorld({
      mapSeed: 2026,
      mapCellCount: 91,
      nowUnixMs: 1_700_000_000_000,
    })
    const graph: GraphState = {
      nodes: [
        {
          id: 'n_processor',
          type: 'processor',
          x: 0,
          y: 0,
          params: { recipeId: 'forge_alloy' },
          enabled: true,
        },
      ],
      edges: [],
    }

    const unlockState = computeUnlockState(world.progress)
    expect(countLockedGraphEntries(graph, unlockState)).toBe(1)
  })
})
