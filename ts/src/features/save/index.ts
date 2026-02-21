import type {
  BlockState,
  GraphState,
  MacroState,
  MetaState,
  ProgressState,
  ResourceInventory,
  StoryState,
  TradeState,
  WorldState,
  WorldTime,
} from '../../types'

export interface SaveMigration {
  fromVersion: number
  toVersion: number
  migrate: (raw: unknown) => unknown
}

export const saveVersion = 1
export const SAVE_EXPORT_PREFIX = 'MD_SAVE_B64_V1'
export const SAVE_ENVELOPE_KIND = 'maxwell-demon-save'

const SAVE_DB_NAME = 'maxwell-demon-save-db'
const SAVE_DB_VERSION = 1
const SAVE_STORE_NAME = 'world'
const SAVE_SLOT_KEY = 'active'
const DEFAULT_MAP_SEED = 1
const DEFAULT_MAP_CELL_COUNT = 300

let dbPromise: Promise<IDBDatabase> | null = null

// Compact save keeps map generation deterministic via mapSeed/mapCellCount
// and stores only mutable per-block fields.
export interface CompactBlockSave {
  id: string
  unlocked: boolean
  extractionRatePerTick: ResourceInventory
  inventory: ResourceInventory
  graph: GraphState
}

export interface CompactWorldSave {
  saveVersion: number
  mapSeed: number
  mapCellCount: number
  time: WorldTime
  macro: MacroState
  progress: ProgressState
  trade: TradeState
  story: StoryState
  meta: MetaState
  blocks: CompactBlockSave[]
}

export interface SaveEnvelope {
  kind: typeof SAVE_ENVELOPE_KIND
  saveVersion: number
  payload: unknown
}

export interface CreateBaseWorldOptions {
  mapSeed: number
  mapCellCount: number
  nowUnixMs: number
}

export type CreateBaseWorld = (options: CreateBaseWorldOptions) => WorldState

export class SaveFormatError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'SaveFormatError'
    this.code = code
  }
}

export function toCompactBlockSave(block: BlockState): CompactBlockSave {
  return {
    id: block.id,
    unlocked: block.unlocked,
    extractionRatePerTick: structuredClone(block.extractionRatePerTick),
    inventory: structuredClone(block.inventory),
    graph: structuredClone(block.graph),
  }
}

export function toCompactWorldSave(world: WorldState): CompactWorldSave {
  return {
    saveVersion,
    mapSeed: world.mapSeed,
    mapCellCount: world.mapCellCount,
    time: structuredClone(world.time),
    macro: structuredClone(world.macro),
    progress: structuredClone(world.progress),
    trade: structuredClone(world.trade),
    story: structuredClone(world.story),
    meta: structuredClone(world.meta),
    blocks: world.blocks.map((block) => toCompactBlockSave(block)),
  }
}

export function hydrateWorldFromCompactSave(
  compact: CompactWorldSave,
  createBaseWorld: CreateBaseWorld
): WorldState {
  const baseWorld = createBaseWorld({
    mapSeed: compact.mapSeed,
    mapCellCount: compact.mapCellCount,
    nowUnixMs: compact.time.realTimestampMs,
  })
  const savedBlockById = new Map(compact.blocks.map((block) => [block.id, block]))
  const blocks = baseWorld.blocks.map((baseBlock) => {
    const saved = savedBlockById.get(baseBlock.id)
    if (!saved) {
      return baseBlock
    }
    return {
      ...baseBlock,
      unlocked: saved.unlocked,
      extractionRatePerTick: structuredClone(saved.extractionRatePerTick),
      inventory: structuredClone(saved.inventory),
      graph: structuredClone(saved.graph),
    }
  })

  return {
    ...baseWorld,
    saveVersion,
    time: structuredClone(compact.time),
    macro: structuredClone(compact.macro),
    progress: structuredClone(compact.progress),
    trade: structuredClone(compact.trade),
    story: structuredClone(compact.story),
    meta: structuredClone(compact.meta),
    blocks,
  }
}

export function encodeWorldSaveToBase64(world: WorldState): string {
  return encodeCompactSaveToBase64(toCompactWorldSave(world))
}

export function decodeWorldSaveFromBase64(
  encoded: string,
  createBaseWorld: CreateBaseWorld,
  migrations: SaveMigration[] = defaultSaveMigrations
): WorldState {
  const compact = decodeCompactSaveFromBase64(encoded, migrations)
  return hydrateWorldFromCompactSave(compact, createBaseWorld)
}

export async function persistWorldToIndexedDb(world: WorldState): Promise<void> {
  await persistCompactSaveToIndexedDb(toCompactWorldSave(world))
}

export async function loadWorldFromIndexedDb(
  createBaseWorld: CreateBaseWorld,
  migrations: SaveMigration[] = defaultSaveMigrations
): Promise<WorldState | null> {
  const compact = await loadCompactSaveFromIndexedDb(migrations)
  if (!compact) {
    return null
  }
  return hydrateWorldFromCompactSave(compact, createBaseWorld)
}

export async function hasWorldSaveInIndexedDb(): Promise<boolean> {
  const db = await openSaveDatabase()
  const raw = await runSaveReadTransaction(db, (store) => store.get(SAVE_SLOT_KEY))
  return raw != null
}

export async function clearWorldSaveFromIndexedDb(): Promise<void> {
  const db = await openSaveDatabase()
  await runSaveTransaction(db, 'readwrite', (store) => {
    store.delete(SAVE_SLOT_KEY)
  })
}

export function encodeCompactSaveToBase64(compact: CompactWorldSave): string {
  const envelope: SaveEnvelope = {
    kind: SAVE_ENVELOPE_KIND,
    saveVersion: compact.saveVersion,
    payload: compact,
  }
  return `${SAVE_EXPORT_PREFIX}.${encodeBase64Utf8(JSON.stringify(envelope))}`
}

export function decodeCompactSaveFromBase64(
  encoded: string,
  migrations: SaveMigration[] = defaultSaveMigrations
): CompactWorldSave {
  const envelope = decodeSaveEnvelope(encoded)
  return decodeCompactSavePayload(envelope.payload, envelope.saveVersion, migrations)
}

export function decodeCompactSavePayload(
  rawPayload: unknown,
  rawVersion: number,
  migrations: SaveMigration[] = defaultSaveMigrations
): CompactWorldSave {
  const payloadVersion = detectPayloadVersion(rawPayload)
  if (payloadVersion !== null && payloadVersion !== rawVersion) {
    throw new SaveFormatError(
      'VERSION_MISMATCH',
      `Save version mismatch: envelope=${rawVersion}, payload=${payloadVersion}.`
    )
  }

  const migrated = migratePayloadToCurrent(rawPayload, rawVersion, migrations)
  const compact = normalizeCompactWorldSave(migrated)
  if (compact.saveVersion !== saveVersion) {
    throw new SaveFormatError(
      'UNSUPPORTED_VERSION',
      `Unsupported migrated save version ${compact.saveVersion}.`
    )
  }
  return compact
}

export const defaultSaveMigrations: SaveMigration[] = [
  {
    fromVersion: 0,
    toVersion: 1,
    migrate: migrateV0ToV1,
  },
]

function migrateV0ToV1(raw: unknown): unknown {
  if (!isRecord(raw)) {
    throw new SaveFormatError('INVALID_PAYLOAD', 'Legacy save payload must be an object.')
  }

  const next = structuredClone(raw)
  next.saveVersion = 1

  if (typeof next.mapSeed !== 'number' || !Number.isFinite(next.mapSeed)) {
    next.mapSeed = DEFAULT_MAP_SEED
  }
  if (typeof next.mapCellCount !== 'number' || !Number.isFinite(next.mapCellCount)) {
    next.mapCellCount = DEFAULT_MAP_CELL_COUNT
  }

  return next
}

function decodeSaveEnvelope(encoded: string): SaveEnvelope {
  if (typeof encoded !== 'string') {
    throw new SaveFormatError('INVALID_INPUT', 'Save input must be a string.')
  }

  const trimmed = encoded.trim()
  const prefix = `${SAVE_EXPORT_PREFIX}.`
  if (!trimmed.startsWith(prefix)) {
    throw new SaveFormatError(
      'INVALID_PREFIX',
      `Save string must start with "${SAVE_EXPORT_PREFIX}.".`
    )
  }

  const base64Payload = trimmed.slice(prefix.length)
  if (!base64Payload) {
    throw new SaveFormatError('INVALID_BASE64', 'Save string does not contain payload data.')
  }

  let decodedJson = ''
  try {
    decodedJson = decodeBase64Utf8(base64Payload)
  } catch {
    throw new SaveFormatError('INVALID_BASE64', 'Save payload is not valid base64 data.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(decodedJson) as unknown
  } catch {
    throw new SaveFormatError('INVALID_JSON', 'Save payload is not valid JSON.')
  }

  if (!isRecord(parsed)) {
    throw new SaveFormatError('INVALID_ENVELOPE', 'Save envelope must be an object.')
  }

  if (parsed.kind !== SAVE_ENVELOPE_KIND) {
    throw new SaveFormatError('INVALID_ENVELOPE', 'Save kind does not match expected format.')
  }

  const rawVersion = parsed.saveVersion
  if (
    typeof rawVersion !== 'number' ||
    !Number.isInteger(rawVersion) ||
    !Number.isFinite(rawVersion) ||
    rawVersion < 0
  ) {
    throw new SaveFormatError('INVALID_VERSION', 'Envelope saveVersion must be a non-negative integer.')
  }

  return {
    kind: SAVE_ENVELOPE_KIND,
    saveVersion: rawVersion,
    payload: parsed.payload,
  }
}

function detectPayloadVersion(rawPayload: unknown): number | null {
  if (!isRecord(rawPayload)) {
    return null
  }
  const raw = rawPayload.saveVersion
  if (
    typeof raw === 'number' &&
    Number.isInteger(raw) &&
    Number.isFinite(raw) &&
    raw >= 0
  ) {
    return raw
  }
  return null
}

function migratePayloadToCurrent(
  rawPayload: unknown,
  rawVersion: number,
  migrations: SaveMigration[]
): unknown {
  if (!Number.isInteger(rawVersion) || rawVersion < 0) {
    throw new SaveFormatError('INVALID_VERSION', 'saveVersion must be a non-negative integer.')
  }

  if (rawVersion > saveVersion) {
    throw new SaveFormatError(
      'UNSUPPORTED_VERSION',
      `Save version ${rawVersion} is newer than supported version ${saveVersion}.`
    )
  }

  let currentVersion = rawVersion
  let currentPayload = rawPayload

  while (currentVersion < saveVersion) {
    const migration = migrations.find((item) => item.fromVersion === currentVersion)
    if (!migration) {
      throw new SaveFormatError(
        'MISSING_MIGRATION',
        `Missing migration path from saveVersion ${currentVersion} to ${saveVersion}.`
      )
    }
    if (migration.toVersion <= migration.fromVersion) {
      throw new SaveFormatError('INVALID_MIGRATION', 'Migration must move to a newer version.')
    }

    currentPayload = migration.migrate(currentPayload)
    currentVersion = migration.toVersion
  }

  return currentPayload
}

function normalizeCompactWorldSave(raw: unknown): CompactWorldSave {
  if (!isRecord(raw)) {
    throw new SaveFormatError('INVALID_PAYLOAD', 'Save payload must be an object.')
  }

  const rawBlocks = raw.blocks
  if (!Array.isArray(rawBlocks)) {
    throw new SaveFormatError('INVALID_PAYLOAD', 'Save payload must contain a blocks array.')
  }

  const normalizedBlocks = rawBlocks.map((block, index) => normalizeCompactBlockSave(block, index))

  const normalized: CompactWorldSave = {
    saveVersion: readNonNegativeInteger(raw.saveVersion, 'saveVersion'),
    mapSeed: readFiniteNumber(raw.mapSeed, 'mapSeed'),
    mapCellCount: readFiniteNumber(raw.mapCellCount, 'mapCellCount'),
    time: cloneWorldTime(raw.time, 'time'),
    macro: cloneMacroState(raw.macro, 'macro'),
    progress: cloneProgressState(raw.progress, 'progress'),
    trade: cloneTradeState(raw.trade, 'trade'),
    story: cloneStoryState(raw.story, 'story'),
    meta: cloneMetaState(raw.meta, 'meta'),
    blocks: normalizedBlocks,
  }

  return normalized
}

function normalizeCompactBlockSave(raw: unknown, index: number): CompactBlockSave {
  if (!isRecord(raw)) {
    throw new SaveFormatError('INVALID_PAYLOAD', `blocks[${index}] must be an object.`)
  }

  const id = raw.id
  if (typeof id !== 'string' || id.length === 0) {
    throw new SaveFormatError('INVALID_PAYLOAD', `blocks[${index}].id must be a non-empty string.`)
  }

  const unlocked = raw.unlocked
  if (typeof unlocked !== 'boolean') {
    throw new SaveFormatError('INVALID_PAYLOAD', `blocks[${index}].unlocked must be a boolean.`)
  }

  return {
    id,
    unlocked,
    extractionRatePerTick: cloneResourceInventory(
      raw.extractionRatePerTick,
      `blocks[${index}].extractionRatePerTick`
    ),
    inventory: cloneResourceInventory(raw.inventory, `blocks[${index}].inventory`),
    graph: cloneGraphState(raw.graph, `blocks[${index}].graph`),
  }
}

async function persistCompactSaveToIndexedDb(compact: CompactWorldSave): Promise<void> {
  const db = await openSaveDatabase()
  await runSaveTransaction(db, 'readwrite', (store) => {
    store.put(compact, SAVE_SLOT_KEY)
  })
}

async function loadCompactSaveFromIndexedDb(
  migrations: SaveMigration[] = defaultSaveMigrations
): Promise<CompactWorldSave | null> {
  const db = await openSaveDatabase()
  const raw = await runSaveReadTransaction(db, (store) => store.get(SAVE_SLOT_KEY))
  if (raw == null) {
    return null
  }

  const rawVersion = detectPayloadVersion(raw) ?? 0
  return decodeCompactSavePayload(raw, rawVersion, migrations)
}

function openSaveDatabase(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise
  }

  const indexedDbFactory = globalThis.indexedDB
  if (!indexedDbFactory) {
    throw new SaveFormatError('INDEXEDDB_UNAVAILABLE', 'IndexedDB is not available in this environment.')
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDbFactory.open(SAVE_DB_NAME, SAVE_DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SAVE_STORE_NAME)) {
        db.createObjectStore(SAVE_STORE_NAME)
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(
        new SaveFormatError(
          'INDEXEDDB_OPEN_FAILED',
          request.error?.message ?? 'Failed to open IndexedDB save database.'
        )
      )
    }
  })

  return dbPromise
}

function runSaveTransaction(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  execute: (store: IDBObjectStore) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVE_STORE_NAME, mode)
    const store = tx.objectStore(SAVE_STORE_NAME)

    try {
      execute(store)
    } catch (error) {
      tx.abort()
      reject(asSaveError(error, 'INDEXEDDB_TX_FAILED', 'Failed to execute save transaction.'))
      return
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => {
      reject(
        new SaveFormatError(
          'INDEXEDDB_TX_FAILED',
          tx.error?.message ?? 'IndexedDB transaction failed.'
        )
      )
    }
    tx.onabort = () => {
      reject(
        new SaveFormatError(
          'INDEXEDDB_TX_ABORTED',
          tx.error?.message ?? 'IndexedDB transaction aborted.'
        )
      )
    }
  })
}

function runSaveReadTransaction(
  db: IDBDatabase,
  read: (store: IDBObjectStore) => IDBRequest<unknown>
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVE_STORE_NAME, 'readonly')
    const store = tx.objectStore(SAVE_STORE_NAME)
    let request: IDBRequest<unknown>

    try {
      request = read(store)
    } catch (error) {
      tx.abort()
      reject(asSaveError(error, 'INDEXEDDB_TX_FAILED', 'Failed to execute read transaction.'))
      return
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(
        new SaveFormatError(
          'INDEXEDDB_READ_FAILED',
          request.error?.message ?? 'IndexedDB read request failed.'
        )
      )
    }
  })
}

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  if (typeof globalThis.btoa !== 'function') {
    throw new SaveFormatError('BASE64_UNAVAILABLE', 'Current environment does not support base64 encoding.')
  }

  return globalThis.btoa(binary)
}

function decodeBase64Utf8(base64: string): string {
  if (typeof globalThis.atob !== 'function') {
    throw new SaveFormatError('BASE64_UNAVAILABLE', 'Current environment does not support base64 decoding.')
  }

  const binary = globalThis.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new TextDecoder().decode(bytes)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SaveFormatError('INVALID_PAYLOAD', `${path} must be a finite number.`)
  }
  return value
}

function readNonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new SaveFormatError('INVALID_PAYLOAD', `${path} must be a non-negative integer.`)
  }
  return value
}

function readNonNegativeNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new SaveFormatError('INVALID_PAYLOAD', `${path} must be a non-negative number.`)
  }
  return value
}

function cloneRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new SaveFormatError('INVALID_PAYLOAD', `${path} must be an object.`)
  }
  return structuredClone(value)
}

function cloneWorldTime(value: unknown, path: string): WorldTime {
  const record = cloneRecord(value, path)
  return {
    day: readFiniteNumber(record.day, `${path}.day`),
    tick: readFiniteNumber(record.tick, `${path}.tick`),
    tickDays: readFiniteNumber(record.tickDays, `${path}.tickDays`),
    realTimestampMs: readFiniteNumber(record.realTimestampMs, `${path}.realTimestampMs`),
  }
}

function cloneMacroState(value: unknown, path: string): MacroState {
  const record = cloneRecord(value, path)
  return {
    macroEntropy: readFiniteNumber(record.macroEntropy, `${path}.macroEntropy`),
    imagEnergy: readFiniteNumber(record.imagEnergy, `${path}.imagEnergy`),
    collapsePressure: readFiniteNumber(record.collapsePressure, `${path}.collapsePressure`),
  }
}

function cloneProgressState(value: unknown, path: string): ProgressState {
  const record = cloneRecord(value, path)
  if (!isEraId(record.era)) {
    throw new SaveFormatError('INVALID_PAYLOAD', `${path}.era must be one of T0/T1/T2/T3/T4.`)
  }

  return {
    era: record.era,
    unlockedTechIds: readStringArray(record.unlockedTechIds, `${path}.unlockedTechIds`),
    selectedPolicyIds: readStringArray(record.selectedPolicyIds, `${path}.selectedPolicyIds`),
  }
}

function cloneTradeState(value: unknown, path: string): TradeState {
  const record = cloneRecord(value, path)

  readFiniteNumber(record.credits, `${path}.credits`)
  readFiniteNumber(record.reputation, `${path}.reputation`)
  readFiniteNumber(record.dailyResetAtUnixMs, `${path}.dailyResetAtUnixMs`)
  readFiniteNumber(record.weeklyResetAtUnixMs, `${path}.weeklyResetAtUnixMs`)

  if (!Array.isArray(record.quests)) {
    throw new SaveFormatError('INVALID_PAYLOAD', `${path}.quests must be an array.`)
  }
  if (!Array.isArray(record.contracts)) {
    throw new SaveFormatError('INVALID_PAYLOAD', `${path}.contracts must be an array.`)
  }

  return structuredClone(record) as unknown as TradeState
}

function cloneStoryState(value: unknown, path: string): StoryState {
  const record = cloneRecord(value, path)

  const triggeredEventIds = readStringArray(record.triggeredEventIds, `${path}.triggeredEventIds`)
  const flagsRecord = cloneRecord(record.flags, `${path}.flags`)
  const flags: Record<string, boolean> = {}
  for (const [key, rawFlag] of Object.entries(flagsRecord)) {
    if (typeof rawFlag !== 'boolean') {
      throw new SaveFormatError('INVALID_PAYLOAD', `${path}.flags.${key} must be a boolean.`)
    }
    flags[key] = rawFlag
  }

  return {
    triggeredEventIds,
    flags,
  }
}

function cloneMetaState(value: unknown, path: string): MetaState {
  const record = cloneRecord(value, path)
  return {
    cycle: readNonNegativeInteger(record.cycle, `${path}.cycle`),
    memoryShards: readNonNegativeNumber(record.memoryShards, `${path}.memoryShards`),
  }
}

function cloneGraphState(value: unknown, path: string): GraphState {
  const record = cloneRecord(value, path)

  if (!Array.isArray(record.nodes)) {
    throw new SaveFormatError('INVALID_PAYLOAD', `${path}.nodes must be an array.`)
  }
  if (!Array.isArray(record.edges)) {
    throw new SaveFormatError('INVALID_PAYLOAD', `${path}.edges must be an array.`)
  }

  return structuredClone(record) as unknown as GraphState
}

function cloneResourceInventory(value: unknown, path: string): ResourceInventory {
  const record = cloneRecord(value, path)
  const inventory: ResourceInventory = {}

  for (const [resourceId, qty] of Object.entries(record)) {
    if (typeof qty !== 'number' || !Number.isFinite(qty) || qty < 0) {
      throw new SaveFormatError(
        'INVALID_PAYLOAD',
        `${path}.${resourceId} must be a finite non-negative number.`
      )
    }
    inventory[resourceId] = qty
  }

  return inventory
}

function readStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new SaveFormatError('INVALID_PAYLOAD', `${path} must be an array.`)
  }

  const items = value.map((item, index) => {
    if (typeof item !== 'string') {
      throw new SaveFormatError('INVALID_PAYLOAD', `${path}[${index}] must be a string.`)
    }
    return item
  })

  return items
}

function isEraId(value: unknown): value is ProgressState['era'] {
  return value === 'T0' || value === 'T1' || value === 'T2' || value === 'T3' || value === 'T4'
}

function asSaveError(error: unknown, fallbackCode: string, fallbackMessage: string): SaveFormatError {
  if (error instanceof SaveFormatError) {
    return error
  }
  if (error instanceof Error) {
    return new SaveFormatError(fallbackCode, error.message)
  }
  return new SaveFormatError(fallbackCode, fallbackMessage)
}
