import type { NodeTypeId } from '../../types'

export interface GraphEditorState {
  selectedNodeId?: string
  selectedEdgeId?: string
  draftNodeType: NodeTypeId
}

export type GraphEditorAction =
  | { type: 'set_draft_node_type'; nodeType: NodeTypeId }
  | { type: 'select_node'; nodeId?: string }
  | { type: 'select_edge'; edgeId?: string }
  | { type: 'clear_selection' }

export function createGraphEditorState(): GraphEditorState {
  return {
    selectedNodeId: undefined,
    selectedEdgeId: undefined,
    draftNodeType: 'extractor',
  }
}

export function reduceGraphEditorState(
  state: GraphEditorState,
  action: GraphEditorAction
): GraphEditorState {
  switch (action.type) {
    case 'set_draft_node_type':
      return {
        ...state,
        draftNodeType: action.nodeType,
      }
    case 'select_node':
      return {
        ...state,
        selectedNodeId: action.nodeId,
        selectedEdgeId: undefined,
      }
    case 'select_edge':
      return {
        ...state,
        selectedNodeId: undefined,
        selectedEdgeId: action.edgeId,
      }
    case 'clear_selection':
      return {
        ...state,
        selectedNodeId: undefined,
        selectedEdgeId: undefined,
      }
    default:
      return state
  }
}
