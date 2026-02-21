/* eslint-disable react-refresh/only-export-components */
import type { PropsWithChildren } from 'react'
import { createContext, useCallback, useContext, useMemo, useReducer } from 'react'
import type { BlockState, GraphState, WorldState } from '../../types'
import {
  createInitialSession,
  getSelectedBlock,
  isBlockUnlockable,
  listNeighborBlocks,
  reduceWorldSession,
} from './worldLogic'

interface WorldSessionProviderProps extends PropsWithChildren {
  initialMapCellCount?: number
  initialMapSeed?: number
}

interface WorldSessionContextValue {
  world: WorldState
  selectedBlockId: string
  selectedBlock?: BlockState
  selectBlock: (blockId: string) => void
  unlockBlock: (blockId: string) => void
  setSelectedBlockGraph: (graph: GraphState) => void
  tickWorld: (tickCount?: number) => void
  canUnlock: (blockId: string) => boolean
  listNeighbors: (blockId: string) => BlockState[]
}

const WorldSessionContext = createContext<WorldSessionContextValue | null>(null)

export function WorldSessionProvider({
  children,
  initialMapCellCount = 300,
  initialMapSeed,
}: WorldSessionProviderProps) {
  const [session, dispatch] = useReducer(
    reduceWorldSession,
    {
      mapCellCount: initialMapCellCount,
      mapSeed: initialMapSeed,
    },
    ({ mapCellCount, mapSeed }) => createInitialSession({ mapCellCount, mapSeed })
  )
  const selectBlock = useCallback(
    (blockId: string) => dispatch({ type: 'select_block', blockId }),
    [dispatch]
  )
  const unlockBlock = useCallback(
    (blockId: string) => dispatch({ type: 'unlock_block', blockId }),
    [dispatch]
  )
  const setSelectedBlockGraph = useCallback(
    (graph: GraphState) => dispatch({ type: 'set_selected_block_graph', graph }),
    [dispatch]
  )
  const tickWorld = useCallback(
    (tickCount: number = 1) => dispatch({ type: 'tick_world', tickCount }),
    [dispatch]
  )

  const value = useMemo<WorldSessionContextValue>(() => {
    const selectedBlock = getSelectedBlock(session)

    return {
      world: session.world,
      selectedBlockId: session.selectedBlockId,
      selectedBlock,
      selectBlock,
      unlockBlock,
      setSelectedBlockGraph,
      tickWorld,
      canUnlock: (blockId: string) => isBlockUnlockable(session.world, blockId),
      listNeighbors: (blockId: string) => listNeighborBlocks(session.world, blockId),
    }
  }, [session, selectBlock, unlockBlock, setSelectedBlockGraph, tickWorld])

  return <WorldSessionContext.Provider value={value}>{children}</WorldSessionContext.Provider>
}

export function useWorldSession(): WorldSessionContextValue {
  const context = useContext(WorldSessionContext)
  if (!context) {
    throw new Error('useWorldSession must be used within WorldSessionProvider')
  }
  return context
}
