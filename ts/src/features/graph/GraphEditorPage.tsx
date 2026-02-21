import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMemo, useReducer, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'
import recipesJson from '../../data/recipes.json'
import resourcesJson from '../../data/resources.json'
import { useWorldSession } from '../../app/state/worldState'
import type {
  EdgeInstance,
  GraphState,
  NodeInstance,
  NodeTypeId,
  RecipeDef,
  ResourceDef,
} from '../../types'
import { PageCard } from '../../ui/PageCard'
import { listInputPorts, listOutputPorts, validateGraphConnection } from './rules'
import { createGraphEditorState, reduceGraphEditorState } from './state'
import './graph.css'

const NODE_TYPES: NodeTypeId[] = [
  'extractor',
  'processor',
  'storage',
  'power_gen',
  'control',
  'port_in',
  'port_out',
  'market',
  'research',
]

const RECIPES = recipesJson as RecipeDef[]
const RESOURCES = resourcesJson as ResourceDef[]
const RECIPE_IDS = RECIPES.map((recipe) => recipe.id).sort()
const RESOURCE_IDS = RESOURCES.map((resource) => resource.id).sort()

const EMPTY_GRAPH: GraphState = {
  nodes: [],
  edges: [],
}

const DRAG_NODE_MIME = 'application/x-maxwell-node-type'
const MINIMAP_NODE_COLORS: Record<NodeTypeId, string> = {
  extractor: '#6abf8b',
  processor: '#7ca8e8',
  storage: '#8b8fb0',
  power_gen: '#f0ba67',
  control: '#b58de3',
  port_in: '#58b8cf',
  port_out: '#57cbb8',
  market: '#c79862',
  research: '#d68ea6',
}

type FlowNodeStatusTone = 'running' | 'stalled' | 'idle'

interface FlowNodeData extends Record<string, unknown> {
  label: string
  subtitle: string
  statusLabel: string
  statusTone: FlowNodeStatusTone
  inputPorts: string[]
  outputPorts: string[]
}

type FlowNode = Node<FlowNodeData, 'machine'>

type ParamFieldKind = 'text' | 'number' | 'select'

interface ParamFieldDef {
  key: string
  label: string
  kind: ParamFieldKind
  optional?: boolean
  min?: number
  step?: number
  options?: string[]
}

const NODE_PARAM_FIELDS: Record<NodeTypeId, ParamFieldDef[]> = {
  extractor: [
    { key: 'resourceId', label: 'Resource', kind: 'select', options: RESOURCE_IDS },
    { key: 'ratePerTick', label: 'Rate / tick', kind: 'number', min: 0, step: 0.1 },
    { key: 'powerPerTick', label: 'Power / tick', kind: 'number', min: 0, step: 0.1 },
    { key: 'outputPort', label: 'Output Port', kind: 'select', options: listOutputPorts('extractor') },
    {
      key: 'maxOutputBuffer',
      label: 'Max Output Buffer',
      kind: 'number',
      optional: true,
      min: 0,
      step: 1,
    },
  ],
  processor: [
    { key: 'recipeId', label: 'Recipe', kind: 'select', options: RECIPE_IDS },
    { key: 'inputPort', label: 'Input Port', kind: 'select', options: listInputPorts('processor') },
    { key: 'outputPort', label: 'Output Port', kind: 'select', options: listOutputPorts('processor') },
    {
      key: 'maxOutputBuffer',
      label: 'Max Output Buffer',
      kind: 'number',
      optional: true,
      min: 0,
      step: 1,
    },
  ],
  storage: [],
  power_gen: [{ key: 'powerPerTick', label: 'Power / tick', kind: 'number', min: 0, step: 0.1 }],
  control: [],
  port_in: [
    { key: 'inputPort', label: 'Input Port', kind: 'select', options: listInputPorts('port_in') },
    {
      key: 'resourceId',
      label: 'Resource (optional)',
      kind: 'select',
      optional: true,
      options: RESOURCE_IDS,
    },
    { key: 'ratePerTick', label: 'Rate / tick', kind: 'number', min: 0, step: 0.1 },
  ],
  port_out: [
    { key: 'outputPort', label: 'Output Port', kind: 'select', options: listOutputPorts('port_out') },
    { key: 'resourceId', label: 'Resource', kind: 'select', options: RESOURCE_IDS },
    { key: 'ratePerTick', label: 'Rate / tick', kind: 'number', min: 0, step: 0.1 },
    {
      key: 'maxOutputBuffer',
      label: 'Max Output Buffer',
      kind: 'number',
      optional: true,
      min: 0,
      step: 1,
    },
  ],
  market: [],
  research: [],
}

function FlowNodeCard({ data, selected }: NodeProps<FlowNode>) {
  return (
    <div className={selected ? 'flow-node-card selected' : 'flow-node-card'}>
      {data.inputPorts.map((port, index) => (
        <Handle
          key={`in_${port}`}
          id={port}
          type="target"
          position={Position.Left}
          className="flow-node-handle target"
          style={{ top: handleTopPercent(index, data.inputPorts.length) }}
        />
      ))}

      <div className="flow-node-header">
        <div className="flow-node-title">{data.label}</div>
        <span className={`flow-node-status ${data.statusTone}`}>{data.statusLabel}</span>
      </div>
      <div className="flow-node-subtitle">{data.subtitle}</div>

      {data.outputPorts.map((port, index) => (
        <Handle
          key={`out_${port}`}
          id={port}
          type="source"
          position={Position.Right}
          className="flow-node-handle source"
          style={{ top: handleTopPercent(index, data.outputPorts.length) }}
        />
      ))}
    </div>
  )
}

const FLOW_NODE_TYPES = {
  machine: FlowNodeCard,
}

export function GraphEditorPage() {
  const { selectedBlock, unlockBlock, canUnlock, setSelectedBlockGraph } = useWorldSession()
  const [editorState, dispatch] = useReducer(reduceGraphEditorState, undefined, createGraphEditorState)
  const [errorText, setErrorText] = useState<string | null>(null)
  const flowRef = useRef<ReactFlowInstance<FlowNode, Edge> | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)

  const graph = selectedBlock?.graph ?? EMPTY_GRAPH
  const flowNodes = useMemo(() => toFlowNodes(graph.nodes), [graph.nodes])
  const flowEdges = useMemo(() => toFlowEdges(graph.edges), [graph.edges])

  if (!selectedBlock) {
    return (
      <PageCard title="Graph Editor" subtitle="No block selected">
        <p>Select a block in the map page first.</p>
      </PageCard>
    )
  }

  if (!selectedBlock.unlocked) {
    return (
      <PageCard title="Graph Editor" subtitle="Selected block is locked">
        <p>Current block: {selectedBlock.id}</p>
        {canUnlock(selectedBlock.id) ? (
          <button type="button" onClick={() => unlockBlock(selectedBlock.id)}>
            Unlock block to edit graph
          </button>
        ) : (
          <p>Unlock requires an adjacent unlocked block.</p>
        )}
      </PageCard>
    )
  }

  function commitGraph(nextGraph: GraphState): void {
    setSelectedBlockGraph(nextGraph)
  }

  function updateNode(nodeId: string, apply: (node: NodeInstance) => NodeInstance): void {
    let updated = false
    const nextNodes = graph.nodes.map((node) => {
      if (node.id !== nodeId) {
        return node
      }
      updated = true
      return apply(node)
    })
    if (!updated) {
      return
    }
    commitGraph({
      ...graph,
      nodes: nextNodes,
    })
  }

  function updateEdge(edgeId: string, apply: (edge: EdgeInstance) => EdgeInstance): void {
    let updated = false
    const nextEdges = graph.edges.map((edge) => {
      if (edge.id !== edgeId) {
        return edge
      }
      updated = true
      return apply(edge)
    })
    if (!updated) {
      return
    }
    commitGraph({
      ...graph,
      edges: nextEdges,
    })
  }

  function setNodeParam(nodeId: string, key: string, value: string | number | undefined): void {
    updateNode(nodeId, (node) => {
      const nextParams: Record<string, unknown> = { ...node.params }
      if (value === undefined) {
        delete nextParams[key]
      } else {
        nextParams[key] = value
      }
      return {
        ...node,
        params: nextParams,
      }
    })
  }

  function onNodeParamTextChange(nodeId: string, key: string, raw: string, optional = false): void {
    const value = raw.trim()
    if (optional && value.length === 0) {
      setNodeParam(nodeId, key, undefined)
      return
    }
    setNodeParam(nodeId, key, value)
  }

  function onNodeParamNumberChange(
    nodeId: string,
    key: string,
    raw: string,
    options: { optional?: boolean; min?: number } = {}
  ): void {
    const value = raw.trim()
    if (value.length === 0) {
      if (options.optional) {
        setNodeParam(nodeId, key, undefined)
      } else {
        setNodeParam(nodeId, key, options.min ?? 0)
      }
      return
    }

    const parsed = Number.parseFloat(value)
    if (!Number.isFinite(parsed)) {
      return
    }

    const clamped = typeof options.min === 'number' ? Math.max(options.min, parsed) : parsed
    setNodeParam(nodeId, key, clamped)
  }

  function onEdgeCapacityChange(edgeId: string, raw: string): void {
    const value = raw.trim()
    if (value.length === 0) {
      updateEdge(edgeId, (edge) => ({
        ...edge,
        capacityPerTick: 0,
      }))
      return
    }

    const parsed = Number.parseFloat(value)
    if (!Number.isFinite(parsed)) {
      return
    }

    updateEdge(edgeId, (edge) => ({
      ...edge,
      capacityPerTick: Math.max(0, parsed),
    }))
  }

  function addNodeAt(nodeType: NodeTypeId, x: number, y: number): void {
    const safeX = Number.isFinite(x) ? x : 0
    const safeY = Number.isFinite(y) ? y : 0
    const node: NodeInstance = {
      id: createGraphId('n'),
      type: nodeType,
      x: safeX,
      y: safeY,
      params: createDefaultParams(nodeType),
      enabled: true,
    }

    commitGraph({
      ...graph,
      nodes: [...graph.nodes, node],
    })
    dispatch({ type: 'set_draft_node_type', nodeType })
    dispatch({ type: 'select_node', nodeId: node.id })
    setErrorText(null)
    window.requestAnimationFrame(() => {
      flowRef.current?.setCenter(safeX, safeY, {
        zoom: 1.15,
        duration: 220,
      })
    })
  }

  function addNodeAtViewportCenter(nodeType: NodeTypeId): void {
    const instance = flowRef.current
    const canvas = canvasRef.current
    if (!instance || !canvas) {
      addNodeAt(nodeType, 0, 0)
      return
    }
    const rect = canvas.getBoundingClientRect()
    const position = instance.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    })
    addNodeAt(nodeType, position.x, position.y)
  }

  function onNodesChange(changes: NodeChange<FlowNode>[]): void {
    const effectiveChanges = changes.filter(
      (change) =>
        change.type === 'position' ||
        change.type === 'remove' ||
        change.type === 'add' ||
        change.type === 'replace'
    )
    if (effectiveChanges.length === 0) {
      return
    }

    const nextNodes = applyNodeChanges(effectiveChanges, flowNodes)
    commitGraph({
      ...graph,
      nodes: mapFlowNodesToDomain(nextNodes, graph.nodes),
    })

    if (
      editorState.selectedNodeId &&
      effectiveChanges.some((change) => change.type === 'remove' && change.id === editorState.selectedNodeId)
    ) {
      dispatch({ type: 'clear_selection' })
    }
  }

  function onEdgesChange(changes: EdgeChange<Edge>[]): void {
    const effectiveChanges = changes.filter(
      (change) => change.type === 'remove' || change.type === 'add' || change.type === 'replace'
    )
    if (effectiveChanges.length === 0) {
      return
    }

    const nextEdges = applyEdgeChanges(effectiveChanges, flowEdges)
    commitGraph({
      ...graph,
      edges: mapFlowEdgesToDomain(nextEdges, graph.edges),
    })

    if (
      editorState.selectedEdgeId &&
      effectiveChanges.some((change) => change.type === 'remove' && change.id === editorState.selectedEdgeId)
    ) {
      dispatch({ type: 'clear_selection' })
    }
  }

  function onConnect(connection: Connection): void {
    const validation = validateGraphConnection(connection, graph.nodes, graph.edges)
    if (!validation.ok) {
      setErrorText(validation.reason)
      return
    }

    const edge: EdgeInstance = {
      id: createGraphId('e'),
      kind: 'item',
      fromNodeId: connection.source as string,
      fromPort: validation.fromPort,
      toNodeId: connection.target as string,
      toPort: validation.toPort,
      capacityPerTick: 10,
    }

    commitGraph({
      ...graph,
      edges: [...graph.edges, edge],
    })
    setErrorText(null)
  }

  function deleteSelection(): void {
    if (editorState.selectedNodeId) {
      const nextNodes = graph.nodes.filter((node) => node.id !== editorState.selectedNodeId)
      const nextEdges = graph.edges.filter(
        (edge) =>
          edge.fromNodeId !== editorState.selectedNodeId && edge.toNodeId !== editorState.selectedNodeId
      )
      commitGraph({
        ...graph,
        nodes: nextNodes,
        edges: nextEdges,
      })
      dispatch({ type: 'clear_selection' })
      return
    }

    if (editorState.selectedEdgeId) {
      commitGraph({
        ...graph,
        edges: graph.edges.filter((edge) => edge.id !== editorState.selectedEdgeId),
      })
      dispatch({ type: 'clear_selection' })
    }
  }

  function onToolboxDragStart(event: ReactDragEvent<HTMLButtonElement>, nodeType: NodeTypeId): void {
    event.dataTransfer.setData(DRAG_NODE_MIME, nodeType)
    event.dataTransfer.effectAllowed = 'copy'
    dispatch({ type: 'set_draft_node_type', nodeType })
  }

  function onFlowDragOver(event: ReactDragEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function onFlowDrop(event: ReactDragEvent<HTMLDivElement>): void {
    event.preventDefault()
    const raw = event.dataTransfer.getData(DRAG_NODE_MIME)
    if (!isNodeTypeId(raw)) {
      return
    }
    const instance = flowRef.current
    if (!instance) {
      return
    }
    const position = instance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })
    addNodeAt(raw, position.x, position.y)
  }

  const selectedNode = graph.nodes.find((node) => node.id === editorState.selectedNodeId)
  const selectedEdge = graph.edges.find((edge) => edge.id === editorState.selectedEdgeId)
  const selectedNodeFields = selectedNode ? NODE_PARAM_FIELDS[selectedNode.type] : []

  return (
    <PageCard title="Graph Editor" subtitle="M3: visual graph editing, rules, and parameter panel">
      <div className="graph-layout">
        <section className="graph-canvas-card">
          <header className="graph-toolbar">
            <span className="graph-toolbox-title">Toolbox</span>
            <div className="graph-toolbox">
              {NODE_TYPES.map((nodeType) => (
                <button
                  key={nodeType}
                  type="button"
                  className={nodeType === editorState.draftNodeType ? 'toolbox-item active' : 'toolbox-item'}
                  draggable
                  onClick={() => addNodeAtViewportCenter(nodeType)}
                  onDragStart={(event) => onToolboxDragStart(event, nodeType)}
                >
                  {nodeType}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={deleteSelection}
              disabled={!editorState.selectedNodeId && !editorState.selectedEdgeId}
            >
              Delete Selection
            </button>
            <span className="graph-stats">
              nodes: {graph.nodes.length} | edges: {graph.edges.length}
            </span>
          </header>

          <div ref={canvasRef} className="graph-canvas" onDragOver={onFlowDragOver} onDrop={onFlowDrop}>
            <ReactFlow
              colorMode="dark"
              nodeTypes={FLOW_NODE_TYPES}
              nodes={flowNodes}
              edges={flowEdges}
              proOptions={{ hideAttribution: true }}
              minZoom={0.2}
              maxZoom={2.5}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={(instance) => {
                flowRef.current = instance
                if (graph.nodes.length > 0) {
                  window.requestAnimationFrame(() => {
                    instance.fitView({ padding: 0.2, duration: 200 })
                  })
                }
              }}
              onNodeClick={(_, node) => dispatch({ type: 'select_node', nodeId: node.id })}
              onEdgeClick={(_, edge) => dispatch({ type: 'select_edge', edgeId: edge.id })}
              onPaneClick={() => dispatch({ type: 'clear_selection' })}
              fitView
            >
              <Background color="#2d445d" gap={24} size={1} />
              <MiniMap
                pannable
                zoomable
                nodeBorderRadius={3}
                nodeColor={resolveMiniMapNodeColor}
                nodeStrokeColor={resolveMiniMapNodeStrokeColor}
                maskColor="rgba(8, 16, 28, 0.5)"
              />
              <Controls />
            </ReactFlow>
          </div>
        </section>

        <aside className="graph-side-card">
          <h3>Block</h3>
          <div className="graph-selection-group">
            <p>ID: {selectedBlock.id}</p>
            <p>
              Coord: ({selectedBlock.coord.q}, {selectedBlock.coord.r})
            </p>
            <p>Terrain: {selectedBlock.terrain}</p>
            <p>Slots: {selectedBlock.capacitySlots}</p>
            <p>Outlet cap/tick: {formatMetric(selectedBlock.outletCapacityPerTick)}</p>
            <p>Yield sum/tick: {formatMetric(sumValues(selectedBlock.extractionRatePerTick))}</p>
          </div>

          <h3>Selection</h3>

          {selectedNode ? (
            <div className="graph-selection-group">
              <p>ID: {selectedNode.id}</p>
              <p>Type: {selectedNode.type}</p>
              <p>Status: {describeNodeStatus(selectedNode)}</p>

              <label className="graph-toggle-field">
                <input
                  type="checkbox"
                  checked={selectedNode.enabled}
                  onChange={(event) =>
                    updateNode(selectedNode.id, (node) => ({ ...node, enabled: event.target.checked }))
                  }
                />
                <span>Enabled</span>
              </label>

              {selectedNodeFields.length === 0 ? (
                <p>No editable params for this node type.</p>
              ) : (
                selectedNodeFields.map((field) => {
                  const value = selectedNode.params[field.key]

                  if (field.kind === 'number') {
                    return (
                      <label key={field.key} className="graph-field">
                        <span>{field.label}</span>
                        <input
                          className="graph-input"
                          type="number"
                          min={field.min}
                          step={field.step ?? 1}
                          value={toNumberInputValue(value, Boolean(field.optional))}
                          onChange={(event) =>
                            onNodeParamNumberChange(selectedNode.id, field.key, event.target.value, {
                              optional: field.optional,
                              min: field.min,
                            })
                          }
                        />
                      </label>
                    )
                  }

                  if (field.kind === 'select') {
                    const options = field.options ?? []
                    const stringValue = typeof value === 'string' ? value : ''

                    return (
                      <label key={field.key} className="graph-field">
                        <span>{field.label}</span>
                        <select
                          className="graph-input"
                          value={stringValue}
                          onChange={(event) =>
                            onNodeParamTextChange(selectedNode.id, field.key, event.target.value, field.optional)
                          }
                        >
                          {field.optional ? <option value="">(none)</option> : null}
                          {options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    )
                  }

                  return (
                    <label key={field.key} className="graph-field">
                      <span>{field.label}</span>
                      <input
                        className="graph-input"
                        type="text"
                        value={typeof value === 'string' ? value : ''}
                        onChange={(event) =>
                          onNodeParamTextChange(selectedNode.id, field.key, event.target.value, field.optional)
                        }
                      />
                    </label>
                  )
                })
              )}
            </div>
          ) : null}

          {selectedEdge ? (
            <div className="graph-selection-group">
              <p>ID: {selectedEdge.id}</p>
              <p>
                From: {selectedEdge.fromNodeId}.{selectedEdge.fromPort}
              </p>
              <p>
                To: {selectedEdge.toNodeId}.{selectedEdge.toPort}
              </p>
              <p>Flow: {formatMetric(selectedEdge.lastFlowPerTick ?? 0)} / tick</p>

              <label className="graph-field">
                <span>Capacity / tick</span>
                <input
                  className="graph-input"
                  type="number"
                  min={0}
                  step={0.1}
                  value={selectedEdge.capacityPerTick}
                  onChange={(event) => onEdgeCapacityChange(selectedEdge.id, event.target.value)}
                />
              </label>
            </div>
          ) : null}

          {!selectedNode && !selectedEdge ? (
            <p>
              Drag a node from toolbox into canvas, or click toolbox button to place it at viewport center.
            </p>
          ) : null}

          {errorText ? <p className="graph-error">{errorText}</p> : null}
        </aside>
      </div>
    </PageCard>
  )
}

function toFlowNodes(nodes: NodeInstance[]): FlowNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: 'machine',
    position: {
      x: node.x,
      y: node.y,
    },
    data: {
      label: node.type,
      subtitle: node.id,
      statusLabel: getNodeStatusLabel(node),
      statusTone: getNodeStatusTone(node),
      inputPorts: listInputPorts(node.type),
      outputPorts: listOutputPorts(node.type),
    },
  }))
}

function toFlowEdges(edges: EdgeInstance[]): Edge[] {
  return edges.map((edge) => {
    const flow = clampPositive(edge.lastFlowPerTick ?? 0)
    const capacity = clampPositive(edge.capacityPerTick)
    const loadRatio = capacity > 0 ? clamp01(flow / capacity) : 0
    const isActive = flow > 0
    const strokeColor = isActive ? '#89d8ff' : '#5f87ad'
    const markerColor = isActive ? '#8de3ff' : '#7ea6cb'

    return {
      id: edge.id,
      source: edge.fromNodeId,
      sourceHandle: edge.fromPort,
      target: edge.toNodeId,
      targetHandle: edge.toPort,
      label: `${formatMetric(flow)} / ${formatMetric(capacity)} (${Math.round(loadRatio * 100)}%)`,
      className: isActive ? 'flow-edge active' : 'flow-edge',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: markerColor,
      },
      animated: isActive,
      style: {
        stroke: strokeColor,
        strokeWidth: 1.7 + loadRatio * 2.1,
        opacity: 0.6 + loadRatio * 0.4,
      },
      labelShowBg: true,
      labelBgStyle: {
        fill: '#112238',
        fillOpacity: 0.92,
      },
      labelStyle: {
        fill: '#dce9f6',
        fontSize: 11,
        fontWeight: 600,
      },
    }
  })
}

function mapFlowNodesToDomain(flowNodes: FlowNode[], sourceNodes: NodeInstance[]): NodeInstance[] {
  const sourceById = new Map(sourceNodes.map((node) => [node.id, node]))
  return flowNodes.map((flowNode) => {
    const source = sourceById.get(flowNode.id)
    if (!source) {
      return {
        id: flowNode.id,
        type: 'processor',
        x: flowNode.position.x,
        y: flowNode.position.y,
        params: {},
        enabled: true,
      }
    }
    return {
      ...source,
      x: flowNode.position.x,
      y: flowNode.position.y,
    }
  })
}

function mapFlowEdgesToDomain(flowEdges: Edge[], sourceEdges: EdgeInstance[]): EdgeInstance[] {
  const sourceById = new Map(sourceEdges.map((edge) => [edge.id, edge]))
  return flowEdges
    .filter((edge) => edge.source && edge.target)
    .map((flowEdge) => {
      const source = sourceById.get(flowEdge.id)
      const fromPort = flowEdge.sourceHandle ?? source?.fromPort ?? 'out'
      const toPort = flowEdge.targetHandle ?? source?.toPort ?? 'in'

      if (!source) {
        return {
          id: flowEdge.id,
          kind: 'item',
          fromNodeId: flowEdge.source,
          fromPort,
          toNodeId: flowEdge.target,
          toPort,
          capacityPerTick: 10,
        }
      }

      return {
        ...source,
        fromNodeId: flowEdge.source,
        fromPort,
        toNodeId: flowEdge.target,
        toPort,
      }
    })
}

function createDefaultParams(nodeType: NodeTypeId): Record<string, unknown> {
  switch (nodeType) {
    case 'extractor':
      return { resourceId: 'ore', ratePerTick: 1, powerPerTick: 1, outputPort: 'out' }
    case 'processor':
      return { recipeId: 'smelt_ingot', inputPort: 'in', outputPort: 'out' }
    case 'power_gen':
      return { powerPerTick: 10 }
    case 'port_in':
      return { inputPort: 'in', ratePerTick: 10 }
    case 'port_out':
      return { outputPort: 'out', resourceId: 'ore', ratePerTick: 10 }
    default:
      return {}
  }
}

function createGraphId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}_${rand}`
}

function getNodeStatusLabel(node: NodeInstance): string {
  if (!node.enabled) {
    return 'disabled'
  }
  const status = node.runtime?.lastStatus
  if (!status) {
    return 'idle'
  }
  if (status.kind === 'running') {
    return 'running'
  }
  return `stalled:${status.reason}`
}

function getNodeStatusTone(node: NodeInstance): FlowNodeStatusTone {
  if (!node.enabled) {
    return 'stalled'
  }
  const status = node.runtime?.lastStatus
  if (!status) {
    return 'idle'
  }
  return status.kind === 'running' ? 'running' : 'stalled'
}

function describeNodeStatus(node: NodeInstance): string {
  return getNodeStatusLabel(node)
}

function toNumberInputValue(value: unknown, optional: boolean): number | '' {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  return optional ? '' : 0
}

function formatMetric(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0
  const rounded = Math.round(safe * 100) / 100
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
    return `${Math.round(rounded)}`
  }
  return rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function handleTopPercent(index: number, total: number): string {
  if (total <= 1) {
    return '50%'
  }
  const ratio = (index + 1) / (total + 1)
  return `${Math.round(ratio * 100)}%`
}

function isNodeTypeId(value: string): value is NodeTypeId {
  return NODE_TYPES.includes(value as NodeTypeId)
}

function clampPositive(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }
  return value
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }
  if (value >= 1) {
    return 1
  }
  return value
}

function sumValues(values: Record<string, number>): number {
  let total = 0
  for (const qty of Object.values(values)) {
    if (Number.isFinite(qty)) {
      total += qty
    }
  }
  return total
}

function resolveMiniMapNodeColor(node: Node): string {
  const nodeType = readNodeTypeFromMiniMapNode(node)
  const base = nodeType ? MINIMAP_NODE_COLORS[nodeType] : '#7f93ab'
  const statusTone = readNodeStatusToneFromMiniMapNode(node)
  if (statusTone === 'stalled') {
    return '#cf8660'
  }
  if (statusTone === 'idle') {
    return '#6f7e90'
  }
  return base
}

function resolveMiniMapNodeStrokeColor(node: Node): string {
  return node.selected ? '#f8c35c' : '#20374f'
}

function readNodeTypeFromMiniMapNode(node: Node): NodeTypeId | undefined {
  const data = node.data as Partial<FlowNodeData> | undefined
  const label = typeof data?.label === 'string' ? data.label : ''
  return isNodeTypeId(label) ? label : undefined
}

function readNodeStatusToneFromMiniMapNode(node: Node): FlowNodeStatusTone | undefined {
  const data = node.data as Partial<FlowNodeData> | undefined
  const tone = data?.statusTone
  if (tone === 'running' || tone === 'stalled' || tone === 'idle') {
    return tone
  }
  return undefined
}
