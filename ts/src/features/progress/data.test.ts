import { describe, expect, it } from 'vitest'
import type { PolicyDef, TechDef } from '../../types'
import { createProgressDataBundle, ProgressDataError, progressData } from './data'

describe('progress data bundle', () => {
  it('meets M7 minimum content volume', () => {
    expect(progressData.techs.length).toBeGreaterThanOrEqual(50)
    expect(progressData.policies.length).toBeGreaterThanOrEqual(30)
  })

  it('contains unique ids and resolvable prereqs', () => {
    expect(new Set(progressData.techs.map((item) => item.id)).size).toBe(progressData.techs.length)
    expect(new Set(progressData.policies.map((item) => item.id)).size).toBe(progressData.policies.length)

    for (const tech of progressData.techs) {
      for (const prereqId of tech.prereq) {
        expect(progressData.techById.has(prereqId)).toBe(true)
      }
    }
    for (const policy of progressData.policies) {
      for (const prereqId of policy.prereq) {
        expect(progressData.policyById.has(prereqId)).toBe(true)
      }
    }
  })

  it('rejects tech prereq cycles', () => {
    const cyclicTechs: TechDef[] = [
      {
        id: 'a',
        name: 'A',
        desc: 'A',
        era: 'T0',
        prereq: ['b'],
        cost: { science: 1 },
        unlocks: [],
      },
      {
        id: 'b',
        name: 'B',
        desc: 'B',
        era: 'T0',
        prereq: ['a'],
        cost: { science: 1 },
        unlocks: [],
      },
    ]
    const policies: PolicyDef[] = [
      {
        id: 'p',
        name: 'P',
        desc: 'P',
        track: 'Industry',
        prereq: [],
        effects: [],
      },
    ]

    expect(() => createProgressDataBundle(cyclicTechs, policies)).toThrow(ProgressDataError)
  })
})
