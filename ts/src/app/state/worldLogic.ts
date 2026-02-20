import type { BlockCoord, BlockState, TerrainId, WorldState } from '../../types'
import { fbm2 } from '../../utils/noise'

const HEX_NEIGHBOR_OFFSETS: ReadonlyArray<BlockCoord> = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
]

export interface WorldSessionState {
  world: WorldState
  selectedBlockId: string
}

export interface CreateSessionOptions {
  mapCellCount?: number
  nowUnixMs?: number
  noiseSeed?: number
}

export type WorldAction =
  | { type: 'select_block'; blockId: string }
  | { type: 'unlock_block'; blockId: string }

const DEFAULT_MAP_CELL_COUNT = 300
const MIN_MAP_CELL_COUNT = 91
const MAX_MAP_CELL_COUNT = 3000

export function createInitialWorld(options: CreateSessionOptions = {}): WorldState {
  const nowUnixMs = options.nowUnixMs ?? Date.now()
  const mapCellCount = clampMapCellCount(options.mapCellCount ?? DEFAULT_MAP_CELL_COUNT)
  const noiseSeed = options.noiseSeed ?? (Math.floor(nowUnixMs / 1000) % 100000)
  const blocks = createHexMap(mapCellCount, noiseSeed)

  return {
    saveVersion: 1,
    time: {
      day: 1,
      tick: 0,
      tickDays: 0.1,
      realTimestampMs: nowUnixMs,
    },
    macro: {
      macroEntropy: 0,
      imagEnergy: 0,
      collapsePressure: 0,
    },
    blocks,
    progress: {
      era: 'T0',
      unlockedTechIds: [],
      selectedPolicyIds: [],
    },
    trade: {
      credits: 100,
      reputation: 0,
      dailyResetAtUnixMs: endOfCurrentDay(nowUnixMs),
      weeklyResetAtUnixMs: endOfCurrentWeek(nowUnixMs),
      quests: [],
      contracts: [],
    },
    story: {
      triggeredEventIds: [],
      flags: {},
    },
    meta: {
      cycle: 1,
      memoryShards: 0,
    },
  }
}

export function createInitialSession(options: CreateSessionOptions = {}): WorldSessionState {
  const world = createInitialWorld(options)
  const centerId = toBlockId({ q: 0, r: 0 })
  return {
    world,
    selectedBlockId: centerId,
  }
}

export function reduceWorldSession(state: WorldSessionState, action: WorldAction): WorldSessionState {
  if (action.type === 'select_block') {
    return selectBlock(state, action.blockId)
  }
  if (action.type === 'unlock_block') {
    return unlockBlock(state, action.blockId)
  }
  return state
}

export function getBlockById(world: WorldState, blockId: string): BlockState | undefined {
  return world.blocks.find((block) => block.id === blockId)
}

export function getSelectedBlock(state: WorldSessionState): BlockState | undefined {
  return getBlockById(state.world, state.selectedBlockId)
}

export function isBlockUnlockable(world: WorldState, blockId: string): boolean {
  const target = getBlockById(world, blockId)
  if (!target || target.unlocked) {
    return false
  }

  const neighborCoords = getNeighborCoords(target.coord)
  const byCoord = createBlockCoordMap(world.blocks)

  for (const coord of neighborCoords) {
    const neighbor = byCoord.get(toCoordKey(coord))
    if (neighbor?.unlocked) {
      return true
    }
  }
  return false
}

export function listNeighborBlocks(world: WorldState, blockId: string): BlockState[] {
  const target = getBlockById(world, blockId)
  if (!target) {
    return []
  }

  const byCoord = createBlockCoordMap(world.blocks)
  const neighbors: BlockState[] = []

  for (const coord of getNeighborCoords(target.coord)) {
    const block = byCoord.get(toCoordKey(coord))
    if (block) {
      neighbors.push(block)
    }
  }

  neighbors.sort((a, b) => a.id.localeCompare(b.id))
  return neighbors
}

export function toBlockId(coord: BlockCoord): string {
  return `b_${coord.q}_${coord.r}`
}

export function getNeighborCoords(coord: BlockCoord): BlockCoord[] {
  return HEX_NEIGHBOR_OFFSETS.map((offset) => ({
    q: coord.q + offset.q,
    r: coord.r + offset.r,
  }))
}

function selectBlock(state: WorldSessionState, blockId: string): WorldSessionState {
  if (state.selectedBlockId === blockId) {
    return state
  }
  if (!getBlockById(state.world, blockId)) {
    return state
  }
  return {
    ...state,
    selectedBlockId: blockId,
  }
}

function unlockBlock(state: WorldSessionState, blockId: string): WorldSessionState {
  const target = getBlockById(state.world, blockId)
  if (!target) {
    return state
  }

  if (target.unlocked) {
    return {
      ...state,
      selectedBlockId: blockId,
    }
  }

  if (!isBlockUnlockable(state.world, blockId)) {
    return state
  }

  const nextBlocks = state.world.blocks.map((block) =>
    block.id === blockId ? { ...block, unlocked: true } : block
  )

  return {
    world: {
      ...state.world,
      blocks: nextBlocks,
    },
    selectedBlockId: blockId,
  }
}

function createHexMap(targetCellCount: number, noiseSeed: number): BlockState[] {
  const coords = createHexCoords(targetCellCount)
  const terrainByCoord = createTerrainMap(coords, noiseSeed)

  return coords.map((coord) => {
    const terrain = terrainByCoord.get(toCoordKey(coord)) ?? 'plains'
    return {
      id: toBlockId(coord),
      coord,
      terrain,
      unlocked: coord.q === 0 && coord.r === 0,
      capacitySlots: 6,
      outletCapacityPerTick: 10,
      deposits: createDeposits(terrain, coord),
      inventory: {},
      graph: {
        nodes: [],
        edges: [],
      },
    }
  })
}

function createHexCoords(targetCellCount: number): BlockCoord[] {
  const radius = findRadiusForCount(targetCellCount)
  const coords: BlockCoord[] = []

  for (let q = -radius; q <= radius; q += 1) {
    const rMin = Math.max(-radius, -q - radius)
    const rMax = Math.min(radius, -q + radius)
    for (let r = rMin; r <= rMax; r += 1) {
      coords.push({ q, r })
    }
  }

  coords.sort((a, b) => {
    const distanceDiff = hexDistanceFromOrigin(a) - hexDistanceFromOrigin(b)
    if (distanceDiff !== 0) {
      return distanceDiff
    }
    return a.q === b.q ? a.r - b.r : a.q - b.q
  })

  const trimmed = coords.slice(0, targetCellCount)
  trimmed.sort((a, b) => (a.q === b.q ? a.r - b.r : a.q - b.q))
  return trimmed
}

function findRadiusForCount(targetCellCount: number): number {
  let radius = 0
  while (hexCountByRadius(radius) < targetCellCount) {
    radius += 1
  }
  return radius
}

function hexCountByRadius(radius: number): number {
  return 1 + 3 * radius * (radius + 1)
}

function hexDistanceFromOrigin(coord: BlockCoord): number {
  const s = -coord.q - coord.r
  return Math.max(Math.abs(coord.q), Math.abs(coord.r), Math.abs(s))
}

function createTerrainMap(coords: BlockCoord[], seed: number): Map<string, TerrainId> {
  const entries = new Map<string, TerrainId>()
  const samples = coords.map((coord) => {
    const [x, y] = axialToNoisePlane(coord)
    const warpX = fbm2(x * 0.05 + 13, y * 0.05 - 7, seed + 101, {
      octaves: 3,
      lacunarity: 2.1,
      gain: 0.57,
    })
    const warpY = fbm2(x * 0.05 - 5, y * 0.05 + 17, seed + 199, {
      octaves: 3,
      lacunarity: 2.1,
      gain: 0.57,
    })
    const sx = x + warpX * 3.5
    const sy = y + warpY * 3.5

    const elevationBase = fbm2(sx * 0.07, sy * 0.07, seed + 3, {
      octaves: 5,
      lacunarity: 1.95,
      gain: 0.53,
    })
    const elevationDetail = fbm2((sx - 23) * 0.18, (sy + 17) * 0.18, seed + 11, {
      octaves: 3,
      lacunarity: 2.2,
      gain: 0.5,
    })
    const elevation = elevationBase * 0.82 + elevationDetail * 0.18

    const moisture = fbm2((sx + 57) * 0.13, (sy - 83) * 0.13, seed + 29, {
      octaves: 4,
      lacunarity: 2,
      gain: 0.5,
    })
    const ridge = 1 - Math.abs(fbm2((sx + 31) * 0.19, (sy - 19) * 0.19, seed + 71))

    return {
      coord,
      key: toCoordKey(coord),
      elevation,
      moisture,
      ridge,
    }
  })

  const waterCount = Math.max(12, Math.round(samples.length * 0.2))
  const mountainCount = Math.max(10, Math.round(samples.length * 0.13))
  const forestCount = Math.max(16, Math.round(samples.length * 0.22))

  for (const sample of samples) {
    entries.set(sample.key, 'plains')
  }

  const byElevationAsc = [...samples].sort((a, b) => a.elevation - b.elevation)
  for (let index = 0; index < waterCount && index < byElevationAsc.length; index += 1) {
    entries.set(byElevationAsc[index].key, 'water')
  }

  const byMountainScoreDesc = [...samples].sort((a, b) => {
    const scoreA = a.elevation * 0.7 + a.ridge * 0.3
    const scoreB = b.elevation * 0.7 + b.ridge * 0.3
    return scoreB - scoreA
  })
  let mountainsAssigned = 0
  for (const sample of byMountainScoreDesc) {
    if (entries.get(sample.key) === 'water') {
      continue
    }
    entries.set(sample.key, 'mountain')
    mountainsAssigned += 1
    if (mountainsAssigned >= mountainCount) {
      break
    }
  }

  const byMoistureDesc = [...samples].sort((a, b) => b.moisture - a.moisture)
  let forestAssigned = 0
  for (const sample of byMoistureDesc) {
    if (entries.get(sample.key) !== 'plains') {
      continue
    }
    entries.set(sample.key, 'forest')
    forestAssigned += 1
    if (forestAssigned >= forestCount) {
      break
    }
  }

  const sampleByKey = new Map(samples.map((sample) => [sample.key, sample]))
  const coastElevationThreshold = quantile(
    samples.map((sample) => sample.elevation),
    0.52
  )
  const coastFallbackCandidates: Array<{ key: string; elevation: number }> = []

  for (const coord of coords) {
    const key = toCoordKey(coord)
    const current = entries.get(key)
    const sample = sampleByKey.get(key)
    if (!current || !sample || current === 'water' || current === 'mountain') {
      continue
    }
    const hasWaterNeighbor = getNeighborCoords(coord).some(
      (neighbor) => entries.get(toCoordKey(neighbor)) === 'water'
    )
    if (hasWaterNeighbor && sample.elevation <= coastElevationThreshold) {
      entries.set(key, 'coast')
    } else if (hasWaterNeighbor) {
      coastFallbackCandidates.push({ key, elevation: sample.elevation })
    }
  }

  if (![...entries.values()].includes('coast') && coastFallbackCandidates.length > 0) {
    coastFallbackCandidates.sort((a, b) => a.elevation - b.elevation)
    const coastCount = Math.max(4, Math.round(samples.length * 0.04))
    for (let index = 0; index < coastCount && index < coastFallbackCandidates.length; index += 1) {
      entries.set(coastFallbackCandidates[index].key, 'coast')
    }
  }

  return entries
}

function axialToNoisePlane(coord: BlockCoord): [number, number] {
  const x = coord.q + coord.r * 0.5
  const y = coord.r * 0.8660254037844386
  return [x, y]
}

function createDeposits(terrain: TerrainId, coord: BlockCoord): Record<string, number> {
  const base = 26 + Math.abs(coord.q * 5 + coord.r * 9)
  switch (terrain) {
    case 'plains':
      return { wood: base * 0.9, ore: base * 0.6, water: base * 0.4 }
    case 'forest':
      return { wood: base * 1.4, water: base * 0.6, ore: base * 0.4 }
    case 'mountain':
      return { ore: base * 1.7, stone: base * 1.1, water: base * 0.2 }
    case 'water':
      return { water: base * 1.9, ore: base * 0.3 }
    case 'coast':
      return { water: base * 1.2, ore: base * 0.8, wood: base * 0.6 }
    default:
      return { ore: base * 0.7 }
  }
}

function createBlockCoordMap(blocks: BlockState[]): Map<string, BlockState> {
  return new Map(blocks.map((block) => [toCoordKey(block.coord), block]))
}

function toCoordKey(coord: BlockCoord): string {
  return `${coord.q}:${coord.r}`
}

function endOfCurrentDay(nowUnixMs: number): number {
  const date = new Date(nowUnixMs)
  date.setHours(23, 59, 59, 999)
  return date.getTime()
}

function endOfCurrentWeek(nowUnixMs: number): number {
  const date = new Date(nowUnixMs)
  const dayOfWeek = date.getDay()
  const daysUntilSunday = (7 - dayOfWeek) % 7
  date.setDate(date.getDate() + daysUntilSunday)
  date.setHours(23, 59, 59, 999)
  return date.getTime()
}

function clampMapCellCount(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_MAP_CELL_COUNT
  }
  const normalized = Math.round(value)
  if (normalized < MIN_MAP_CELL_COUNT) {
    return MIN_MAP_CELL_COUNT
  }
  if (normalized > MAX_MAP_CELL_COUNT) {
    return MAX_MAP_CELL_COUNT
  }
  return normalized
}

function quantile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * p
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) {
    return sorted[lower]
  }
  const weight = position - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}
