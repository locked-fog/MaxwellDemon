import policiesJson from '../../data/policies.json'
import techsJson from '../../data/techs.json'
import type { NodeTypeId, PolicyDef, TechDef } from '../../types'

export interface ProgressDataBundle {
  techs: TechDef[]
  policies: PolicyDef[]
  techById: ReadonlyMap<string, TechDef>
  policyById: ReadonlyMap<string, PolicyDef>
  techOrderById: ReadonlyMap<string, number>
  policyOrderById: ReadonlyMap<string, number>
  orderedTechIds: string[]
  orderedPolicyIds: string[]
}

export class ProgressDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProgressDataError'
  }
}

export const progressData = createProgressDataBundle(
  techsJson as unknown,
  policiesJson as unknown
)

export function createProgressDataBundle(
  rawTechs: unknown,
  rawPolicies: unknown
): ProgressDataBundle {
  if (!Array.isArray(rawTechs)) {
    throw new ProgressDataError('techs.json must be an array.')
  }
  if (!Array.isArray(rawPolicies)) {
    throw new ProgressDataError('policies.json must be an array.')
  }

  const techs = rawTechs.map((item, index) => normalizeTech(item, index))
  const policies = rawPolicies.map((item, index) => normalizePolicy(item, index))
  const techById = createByIdMap(techs, 'tech')
  const policyById = createByIdMap(policies, 'policy')
  const techOrderById = createOrderMap(techs)
  const policyOrderById = createOrderMap(policies)

  validateTechPrereqs(techs, techById)
  validatePolicyPrereqs(policies, policyById)
  validateTechCycles(techById)

  return {
    techs,
    policies,
    techById,
    policyById,
    techOrderById,
    policyOrderById,
    orderedTechIds: sortIdsByOrder(techOrderById),
    orderedPolicyIds: sortIdsByOrder(policyOrderById),
  }
}

function normalizeTech(raw: unknown, index: number): TechDef {
  const path = `techs[${index}]`
  const record = asRecord(raw, path)
  const id = readNonEmptyString(record.id, `${path}.id`)
  const name = readNonEmptyString(record.name, `${path}.name`)
  const desc = readNonEmptyString(record.desc, `${path}.desc`)
  const era = readEra(record.era, `${path}.era`)
  const order = readOptionalNonNegativeNumber(record.order, `${path}.order`) ?? index
  const prereq = readStringList(record.prereq, `${path}.prereq`)
  const cost = readScienceCost(record.cost, `${path}.cost`)
  const unlocks = readUnlocks(record.unlocks, `${path}.unlocks`)

  return {
    id,
    name,
    desc,
    era,
    order,
    prereq,
    cost,
    unlocks,
  }
}

function normalizePolicy(raw: unknown, index: number): PolicyDef {
  const path = `policies[${index}]`
  const record = asRecord(raw, path)
  const id = readNonEmptyString(record.id, `${path}.id`)
  const name = readNonEmptyString(record.name, `${path}.name`)
  const desc = readNonEmptyString(record.desc, `${path}.desc`)
  const track = readPolicyTrack(record.track, `${path}.track`)
  const order = readOptionalNonNegativeNumber(record.order, `${path}.order`) ?? index
  const prereq = readStringList(record.prereq, `${path}.prereq`)
  const effects = readEffects(record.effects, `${path}.effects`)

  return {
    id,
    name,
    desc,
    track,
    order,
    prereq,
    effects,
  }
}

function createByIdMap<T extends { id: string }>(
  items: T[],
  kind: 'tech' | 'policy'
): ReadonlyMap<string, T> {
  const byId = new Map<string, T>()
  for (const item of items) {
    if (byId.has(item.id)) {
      throw new ProgressDataError(`Duplicate ${kind} id: "${item.id}".`)
    }
    byId.set(item.id, item)
  }
  return byId
}

function createOrderMap<T extends { id: string; order?: number }>(
  items: T[]
): ReadonlyMap<string, number> {
  const byId = new Map<string, number>()
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    byId.set(item.id, item.order ?? index)
  }
  return byId
}

function sortIdsByOrder(orderById: ReadonlyMap<string, number>): string[] {
  return [...orderById.entries()]
    .sort((left, right) => {
      const orderDiff = left[1] - right[1]
      if (orderDiff !== 0) {
        return orderDiff
      }
      return left[0].localeCompare(right[0])
    })
    .map((entry) => entry[0])
}

function validateTechPrereqs(techs: TechDef[], techById: ReadonlyMap<string, TechDef>): void {
  for (const tech of techs) {
    for (const prereqId of tech.prereq) {
      if (!techById.has(prereqId)) {
        throw new ProgressDataError(
          `Tech "${tech.id}" references missing prereq tech "${prereqId}".`
        )
      }
      if (prereqId === tech.id) {
        throw new ProgressDataError(`Tech "${tech.id}" cannot require itself.`)
      }
    }
  }
}

function validatePolicyPrereqs(
  policies: PolicyDef[],
  policyById: ReadonlyMap<string, PolicyDef>
): void {
  for (const policy of policies) {
    for (const prereqId of policy.prereq) {
      if (!policyById.has(prereqId)) {
        throw new ProgressDataError(
          `Policy "${policy.id}" references missing prereq policy "${prereqId}".`
        )
      }
      if (prereqId === policy.id) {
        throw new ProgressDataError(`Policy "${policy.id}" cannot require itself.`)
      }
    }
  }
}

function validateTechCycles(techById: ReadonlyMap<string, TechDef>): void {
  const visitState = new Map<string, 0 | 1 | 2>()
  const stack: string[] = []

  const visit = (techId: string): void => {
    const state = visitState.get(techId) ?? 0
    if (state === 2) {
      return
    }
    if (state === 1) {
      const cycleStart = stack.indexOf(techId)
      const cyclePath = cycleStart >= 0 ? stack.slice(cycleStart).concat(techId) : [techId]
      throw new ProgressDataError(`Tech prereq cycle detected: ${cyclePath.join(' -> ')}`)
    }

    visitState.set(techId, 1)
    stack.push(techId)

    const tech = techById.get(techId)
    if (!tech) {
      stack.pop()
      visitState.set(techId, 2)
      return
    }

    for (const prereqId of tech.prereq) {
      visit(prereqId)
    }

    stack.pop()
    visitState.set(techId, 2)
  }

  const techIds = [...techById.keys()].sort()
  for (const techId of techIds) {
    visit(techId)
  }
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProgressDataError(`${path} must be an object.`)
  }
  return value as Record<string, unknown>
}

function readNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ProgressDataError(`${path} must be a non-empty string.`)
  }
  return value
}

function readStringList(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProgressDataError(`${path} must be an array.`)
  }

  const result: string[] = []
  const seen = new Set<string>()
  for (let index = 0; index < value.length; index += 1) {
    const itemPath = `${path}[${index}]`
    const item = readNonEmptyString(value[index], itemPath)
    if (seen.has(item)) {
      throw new ProgressDataError(`${path} contains duplicate id "${item}".`)
    }
    seen.add(item)
    result.push(item)
  }
  return result
}

function readOptionalNonNegativeNumber(value: unknown, path: string): number | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ProgressDataError(`${path} must be a non-negative number when provided.`)
  }
  return value
}

function readEra(value: unknown, path: string): TechDef['era'] {
  if (value === 'T0' || value === 'T1' || value === 'T2' || value === 'T3' || value === 'T4') {
    return value
  }
  throw new ProgressDataError(`${path} must be one of T0/T1/T2/T3/T4.`)
}

function readScienceCost(value: unknown, path: string): { science: number } {
  const record = asRecord(value, path)
  const science = record.science
  if (typeof science !== 'number' || !Number.isFinite(science) || science < 0) {
    throw new ProgressDataError(`${path}.science must be a non-negative number.`)
  }
  return { science }
}

function readUnlocks(value: unknown, path: string): TechDef['unlocks'] {
  if (!Array.isArray(value)) {
    throw new ProgressDataError(`${path} must be an array.`)
  }
  return value.map((item, index) => {
    const itemPath = `${path}[${index}]`
    const record = asRecord(item, itemPath)
    const kind = readNonEmptyString(record.kind, `${itemPath}.kind`)
    if (kind === 'node_type') {
      return {
        kind,
        id: readNodeTypeId(record.id, `${itemPath}.id`),
      }
    }
    if (kind === 'recipe') {
      return {
        kind,
        id: readNonEmptyString(record.id, `${itemPath}.id`),
      }
    }
    if (kind === 'tech') {
      return {
        kind,
        id: readNonEmptyString(record.id, `${itemPath}.id`),
      }
    }
    if (kind === 'policy_slot') {
      const amount = record.amount
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
        throw new ProgressDataError(`${itemPath}.amount must be a non-negative number.`)
      }
      return { kind: 'policy_slot', amount }
    }
    if (kind === 'map_radius') {
      const amount = record.amount
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
        throw new ProgressDataError(`${itemPath}.amount must be a non-negative number.`)
      }
      return { kind: 'map_radius', amount }
    }
    if (kind === 'feature') {
      const id = readNonEmptyString(record.id, `${itemPath}.id`)
      if (id !== 'merchant' && id !== 'contract' && id !== 'rebirth') {
        throw new ProgressDataError(`${itemPath}.id has invalid feature "${id}".`)
      }
      return { kind, id }
    }
    throw new ProgressDataError(`${itemPath}.kind has invalid value "${kind}".`)
  })
}

function readPolicyTrack(value: unknown, path: string): PolicyDef['track'] {
  if (value === 'Industry' || value === 'Ecology' || value === 'Faith' || value === 'Trade') {
    return value
  }
  throw new ProgressDataError(`${path} must be one of Industry/Ecology/Faith/Trade.`)
}

function readNodeTypeId(value: unknown, path: string): NodeTypeId {
  const id = readNonEmptyString(value, path)
  if (
    id === 'extractor' ||
    id === 'processor' ||
    id === 'storage' ||
    id === 'power_gen' ||
    id === 'control' ||
    id === 'port_in' ||
    id === 'port_out' ||
    id === 'market' ||
    id === 'research'
  ) {
    return id
  }
  throw new ProgressDataError(`${path} has invalid node type "${id}".`)
}

function readEffects(value: unknown, path: string): PolicyDef['effects'] {
  if (!Array.isArray(value)) {
    throw new ProgressDataError(`${path} must be an array.`)
  }
  return value.map((item, index) => {
    const itemPath = `${path}[${index}]`
    const record = asRecord(item, itemPath)
    const kind = readNonEmptyString(record.kind, `${itemPath}.kind`)
    if (kind === 'modifier') {
      const target = readNonEmptyString(record.target, `${itemPath}.target`)
      if (
        target !== 'throughput' &&
        target !== 'power_efficiency' &&
        target !== 'market_price' &&
        target !== 'entropy_gain' &&
        target !== 'collapse_pressure'
      ) {
        throw new ProgressDataError(`${itemPath}.target has invalid value "${target}".`)
      }
      const operator = readNonEmptyString(record.operator, `${itemPath}.operator`)
      if (operator !== 'add' && operator !== 'mul') {
        throw new ProgressDataError(`${itemPath}.operator must be add or mul.`)
      }
      const value = record.value
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new ProgressDataError(`${itemPath}.value must be a finite number.`)
      }
      return {
        kind,
        target,
        operator,
        value,
      }
    }
    if (kind === 'unlock') {
      return {
        kind,
        unlock: readUnlocks([record.unlock], `${itemPath}.unlock`)[0],
      }
    }
    throw new ProgressDataError(`${itemPath}.kind has invalid value "${kind}".`)
  })
}
