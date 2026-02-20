import { describe, expect, it } from 'vitest'
import { createGraphEditorState, reduceGraphEditorState } from './state'

describe('graph editor state', () => {
  it('creates default state', () => {
    const state = createGraphEditorState()
    expect(state.draftNodeType).toBe('extractor')
    expect(state.selectedNodeId).toBeUndefined()
    expect(state.selectedEdgeId).toBeUndefined()
  })

  it('tracks draft node type', () => {
    const state = createGraphEditorState()
    const next = reduceGraphEditorState(state, { type: 'set_draft_node_type', nodeType: 'processor' })
    expect(next.draftNodeType).toBe('processor')
  })

  it('switches selection between node and edge', () => {
    const state = createGraphEditorState()
    const nodeSelected = reduceGraphEditorState(state, { type: 'select_node', nodeId: 'n1' })
    expect(nodeSelected.selectedNodeId).toBe('n1')
    expect(nodeSelected.selectedEdgeId).toBeUndefined()

    const edgeSelected = reduceGraphEditorState(nodeSelected, { type: 'select_edge', edgeId: 'e1' })
    expect(edgeSelected.selectedNodeId).toBeUndefined()
    expect(edgeSelected.selectedEdgeId).toBe('e1')
  })

  it('clears selection', () => {
    const state = reduceGraphEditorState(createGraphEditorState(), {
      type: 'select_node',
      nodeId: 'n1',
    })
    const next = reduceGraphEditorState(state, { type: 'clear_selection' })
    expect(next.selectedNodeId).toBeUndefined()
    expect(next.selectedEdgeId).toBeUndefined()
  })
})
