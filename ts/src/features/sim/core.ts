import type { RecipeDef, ResourceInventory, Stack } from '../../types'
import type { EdgeInstance, NodeInstance, NodeRuntime, NodeStatus } from '../../types/graph'
import type { BlockState } from '../../types/world'
import type { EdgeFlow, SimTickConfig, SimTickResult } from './types'

const EPSILON = 1e-9
const DEFAULT_INPUT_PORT = 'in'
const DEFAULT_OUTPUT_PORT = 'out'

export function stepBlock(block: BlockState, config: SimTickConfig): SimTickResult {
  const nextBlock = structuredClone(block)
  const nodes = [...nextBlock.graph.nodes].sort((a, b) => a.id.localeCompare(b.id))
  const edges = [...nextBlock.graph.edges].sort((a, b) => a.id.localeCompare(b.id))
  nextBlock.graph.nodes = nodes
  nextBlock.graph.edges = edges

  const effectiveRateMultiplier = clamp01(1 - config.entropyFactor)
  const powerProduced = collectPower(nodes)
  let powerUsed = 0

  for (const node of nodes) {
    const runtime = ensureRuntime(node)

    if (!node.enabled) {
      runtime.lastStatus = stalled('disabled')
      continue
    }

    if (node.type === 'power_gen') {
      runtime.lastStatus = running()
      continue
    }

    if (node.type === 'extractor') {
      powerUsed = runExtractor({
        node,
        runtime,
        block: nextBlock,
        powerProduced,
        powerUsed,
        effectiveRateMultiplier,
      })
      continue
    }

    if (node.type === 'processor') {
      powerUsed = runProcessor({
        node,
        runtime,
        recipes: config.recipes,
        tickDays: config.tickDays,
        powerProduced,
        powerUsed,
        effectiveRateMultiplier,
      })
      continue
    }

    if (node.type === 'port_out') {
      runPortOut({
        node,
        runtime,
        block: nextBlock,
        effectiveRateMultiplier,
      })
      continue
    }

    if (node.type === 'port_in') {
      runPortIn({
        node,
        runtime,
        block: nextBlock,
      })
      continue
    }

    runtime.lastStatus = running()
  }

  const edgeFlows = transferAlongEdges(nodes, edges)

  return {
    block: nextBlock,
    edgeFlows,
    powerProduced,
    powerUsed,
    effectiveRateMultiplier,
  }
}

function collectPower(nodes: NodeInstance[]): number {
  let total = 0
  for (const node of nodes) {
    if (!node.enabled || node.type !== 'power_gen') {
      continue
    }
    total += positive(readNumber(node.params.powerPerTick, 0))
  }
  return total
}

interface ExtractorContext {
  node: NodeInstance
  runtime: NodeRuntime
  block: BlockState
  powerProduced: number
  powerUsed: number
  effectiveRateMultiplier: number
}

function runExtractor(ctx: ExtractorContext): number {
  const { node, runtime, block, powerProduced, effectiveRateMultiplier } = ctx
  let { powerUsed } = ctx

  const resourceId = readString(node.params.resourceId, '')
  const ratePerTick = positive(readNumber(node.params.ratePerTick, 0)) * effectiveRateMultiplier
  const powerPerTick = positive(readNumber(node.params.powerPerTick, 0))

  if (resourceId.length === 0 || ratePerTick <= EPSILON) {
    runtime.lastStatus = stalled('no_input')
    return powerUsed
  }

  if (powerUsed + powerPerTick > powerProduced + EPSILON) {
    runtime.lastStatus = stalled('no_power')
    return powerUsed
  }

  const available = positive(block.deposits[resourceId] ?? 0)
  if (available <= EPSILON) {
    runtime.lastStatus = stalled('no_input')
    return powerUsed
  }

  const outputPort = readString(node.params.outputPort, DEFAULT_OUTPUT_PORT)
  const output = getPortInventory(runtime.outputBuf, outputPort)
  const maxOutputBuffer = optionalPositiveNumber(node.params.maxOutputBuffer)
  const nextAmount = Math.min(available, ratePerTick)

  if (
    maxOutputBuffer !== undefined &&
    totalInventory(output) + nextAmount > maxOutputBuffer + EPSILON
  ) {
    runtime.lastStatus = stalled('output_full')
    return powerUsed
  }

  addQty(output, resourceId, nextAmount)
  block.deposits[resourceId] = clampPositive(available - nextAmount)
  powerUsed += powerPerTick
  runtime.lastStatus = running()
  return powerUsed
}

interface ProcessorContext {
  node: NodeInstance
  runtime: NodeRuntime
  recipes: Record<string, RecipeDef>
  tickDays: number
  powerProduced: number
  powerUsed: number
  effectiveRateMultiplier: number
}

function runProcessor(ctx: ProcessorContext): number {
  const { node, runtime, recipes, tickDays, powerProduced, effectiveRateMultiplier } = ctx
  let { powerUsed } = ctx

  const recipeId = readString(node.params.recipeId, '')
  const recipe = recipes[recipeId]
  if (!recipe) {
    runtime.lastStatus = stalled('no_input')
    return powerUsed
  }

  const inputPort = readString(node.params.inputPort, DEFAULT_INPUT_PORT)
  const outputPort = readString(node.params.outputPort, DEFAULT_OUTPUT_PORT)
  const input = getPortInventory(runtime.inputBuf, inputPort)
  const output = getPortInventory(runtime.outputBuf, outputPort)
  const maxOutputBuffer = optionalPositiveNumber(node.params.maxOutputBuffer)

  const cycleDays = recipe.timeDays > EPSILON ? recipe.timeDays : tickDays
  runtime.workProgressDays += tickDays

  let ranCycle = false
  let blockedReason: NodeStatus | undefined

  while (runtime.workProgressDays + EPSILON >= cycleDays) {
    const cyclePower = positive((recipe.powerPerDay ?? 0) * cycleDays)
    const scaledOutputs = scaleStacks(recipe.outputs, effectiveRateMultiplier)

    if (powerUsed + cyclePower > powerProduced + EPSILON) {
      blockedReason = stalled('no_power')
      break
    }

    if (!hasStacks(input, recipe.inputs)) {
      blockedReason = stalled('no_input')
      break
    }

    if (
      maxOutputBuffer !== undefined &&
      totalInventory(output) + totalStacks(scaledOutputs) > maxOutputBuffer + EPSILON
    ) {
      blockedReason = stalled('output_full')
      break
    }

    consumeStacks(input, recipe.inputs)
    produceStacks(output, scaledOutputs)
    runtime.workProgressDays -= cycleDays
    powerUsed += cyclePower
    ranCycle = true
  }

  if (ranCycle) {
    runtime.lastStatus = running()
    return powerUsed
  }

  runtime.lastStatus = blockedReason ?? running()
  return powerUsed
}

interface PortOutContext {
  node: NodeInstance
  runtime: NodeRuntime
  block: BlockState
  effectiveRateMultiplier: number
}

function runPortOut(ctx: PortOutContext): void {
  const { node, runtime, block, effectiveRateMultiplier } = ctx

  const resourceId = readString(node.params.resourceId, '')
  const ratePerTick = positive(readNumber(node.params.ratePerTick, 0)) * effectiveRateMultiplier
  if (resourceId.length === 0 || ratePerTick <= EPSILON) {
    runtime.lastStatus = stalled('no_input')
    return
  }

  const available = positive(block.inventory[resourceId] ?? 0)
  if (available <= EPSILON) {
    runtime.lastStatus = stalled('no_input')
    return
  }

  const outputPort = readString(node.params.outputPort, DEFAULT_OUTPUT_PORT)
  const output = getPortInventory(runtime.outputBuf, outputPort)
  const maxOutputBuffer = optionalPositiveNumber(node.params.maxOutputBuffer)
  const moved = Math.min(available, ratePerTick)

  if (maxOutputBuffer !== undefined && totalInventory(output) + moved > maxOutputBuffer + EPSILON) {
    runtime.lastStatus = stalled('output_full')
    return
  }

  addQty(output, resourceId, moved)
  block.inventory[resourceId] = clampPositive(available - moved)
  runtime.lastStatus = running()
}

interface PortInContext {
  node: NodeInstance
  runtime: NodeRuntime
  block: BlockState
}

function runPortIn(ctx: PortInContext): void {
  const { node, runtime, block } = ctx
  const inputPort = readString(node.params.inputPort, DEFAULT_INPUT_PORT)
  const input = getPortInventory(runtime.inputBuf, inputPort)
  const explicitResourceId = readString(node.params.resourceId, '')
  const maxMove = positive(readNumber(node.params.ratePerTick, Number.POSITIVE_INFINITY))
  const moved = pullToBlockInventory({
    blockInventory: block.inventory,
    source: input,
    maxMove,
    resourceId: explicitResourceId.length > 0 ? explicitResourceId : undefined,
  })

  runtime.lastStatus = moved > EPSILON ? running() : stalled('no_input')
}

interface PullContext {
  blockInventory: ResourceInventory
  source: ResourceInventory
  maxMove: number
  resourceId?: string
}

function pullToBlockInventory(ctx: PullContext): number {
  const { blockInventory, source, resourceId } = ctx
  let { maxMove } = ctx
  let moved = 0

  const resourceOrder = resourceId ? [resourceId] : Object.keys(source).sort()
  for (const id of resourceOrder) {
    if (maxMove <= EPSILON) {
      break
    }
    const available = positive(source[id] ?? 0)
    if (available <= EPSILON) {
      continue
    }
    const delta = Math.min(available, maxMove)
    source[id] = clampPositive(available - delta)
    addQty(blockInventory, id, delta)
    moved += delta
    maxMove -= delta
  }

  return moved
}

function transferAlongEdges(nodes: NodeInstance[], edges: EdgeInstance[]): EdgeFlow[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const flows: EdgeFlow[] = []

  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.fromNodeId)
    const targetNode = nodeById.get(edge.toNodeId)
    if (!sourceNode || !targetNode) {
      edge.lastFlowPerTick = 0
      flows.push({ edgeId: edge.id, moved: 0 })
      continue
    }

    const source = getPortInventory(ensureRuntime(sourceNode).outputBuf, edge.fromPort)
    const target = getPortInventory(ensureRuntime(targetNode).inputBuf, edge.toPort)
    const moved = transferInventory(source, target, positive(edge.capacityPerTick))
    edge.lastFlowPerTick = moved
    flows.push({ edgeId: edge.id, moved })
  }

  return flows
}

function transferInventory(
  source: ResourceInventory,
  target: ResourceInventory,
  capacity: number
): number {
  let moved = 0
  let remaining = capacity

  for (const resourceId of Object.keys(source).sort()) {
    if (remaining <= EPSILON) {
      break
    }
    const available = positive(source[resourceId] ?? 0)
    if (available <= EPSILON) {
      continue
    }

    const delta = Math.min(available, remaining)
    source[resourceId] = clampPositive(available - delta)
    addQty(target, resourceId, delta)
    moved += delta
    remaining -= delta
  }

  return moved
}

function hasStacks(inventory: ResourceInventory, stacks: Stack[]): boolean {
  for (const stack of stacks) {
    if (positive(inventory[stack.id] ?? 0) + EPSILON < stack.qty) {
      return false
    }
  }
  return true
}

function consumeStacks(inventory: ResourceInventory, stacks: Stack[]): void {
  for (const stack of stacks) {
    const current = positive(inventory[stack.id] ?? 0)
    inventory[stack.id] = clampPositive(current - stack.qty)
  }
}

function produceStacks(inventory: ResourceInventory, stacks: Stack[]): void {
  for (const stack of stacks) {
    addQty(inventory, stack.id, stack.qty)
  }
}

function scaleStacks(stacks: Stack[], factor: number): Stack[] {
  return stacks.map((stack) => ({
    id: stack.id,
    qty: stack.qty * factor,
  }))
}

function totalStacks(stacks: Stack[]): number {
  let total = 0
  for (const stack of stacks) {
    total += stack.qty
  }
  return total
}

function ensureRuntime(node: NodeInstance): NodeRuntime {
  if (node.runtime) {
    return node.runtime
  }
  const runtime: NodeRuntime = {
    inputBuf: {},
    outputBuf: {},
    workProgressDays: 0,
  }
  node.runtime = runtime
  return runtime
}

function getPortInventory(
  buffers: Record<string, ResourceInventory>,
  portName: string
): ResourceInventory {
  if (buffers[portName]) {
    return buffers[portName]
  }
  const inventory: ResourceInventory = {}
  buffers[portName] = inventory
  return inventory
}

function totalInventory(inventory: ResourceInventory): number {
  let total = 0
  for (const qty of Object.values(inventory)) {
    total += positive(qty)
  }
  return total
}

function addQty(inventory: ResourceInventory, resourceId: string, qty: number): void {
  const current = positive(inventory[resourceId] ?? 0)
  inventory[resourceId] = current + positive(qty)
}

function running(): NodeStatus {
  return { kind: 'running' }
}

function stalled(reason: 'no_input' | 'no_power' | 'output_full' | 'disabled'): NodeStatus {
  return { kind: 'stalled', reason }
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function optionalPositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }
  if (value <= EPSILON) {
    return undefined
  }
  return value
}

function positive(value: number): number {
  return value > EPSILON ? value : 0
}

function clampPositive(value: number): number {
  return value > EPSILON ? value : 0
}

function clamp01(value: number): number {
  if (value <= 0) {
    return 0
  }
  if (value >= 1) {
    return 1
  }
  return value
}
