/* eslint-disable react-refresh/only-export-components */
import type { PropsWithChildren } from 'react'
import { createContext, useContext, useMemo, useReducer } from 'react'
import type { BlockState, WorldState } from '../../types'
import {
  createInitialSession,
  getSelectedBlock,
  isBlockUnlockable,
  listNeighborBlocks,
  reduceWorldSession,
} from './worldLogic'

interface WorldSessionProviderProps extends PropsWithChildren {
  initialMapCellCount?: number
}

interface WorldSessionContextValue {
  world: WorldState
  selectedBlockId: string
  selectedBlock?: BlockState
  selectBlock: (blockId: string) => void
  unlockBlock: (blockId: string) => void
  canUnlock: (blockId: string) => boolean
  listNeighbors: (blockId: string) => BlockState[]
}

const WorldSessionContext = createContext<WorldSessionContextValue | null>(null)

export function WorldSessionProvider({
  children,
  initialMapCellCount = 300,
}: WorldSessionProviderProps) {
  const [session, dispatch] = useReducer(reduceWorldSession, initialMapCellCount, (mapCellCount) =>
    createInitialSession({ mapCellCount })
  )

  const value = useMemo<WorldSessionContextValue>(() => {
    const selectedBlock = getSelectedBlock(session)

    return {
      world: session.world,
      selectedBlockId: session.selectedBlockId,
      selectedBlock,
      selectBlock: (blockId: string) => dispatch({ type: 'select_block', blockId }),
      unlockBlock: (blockId: string) => dispatch({ type: 'unlock_block', blockId }),
      canUnlock: (blockId: string) => isBlockUnlockable(session.world, blockId),
      listNeighbors: (blockId: string) => listNeighborBlocks(session.world, blockId),
    }
  }, [session])

  return <WorldSessionContext.Provider value={value}>{children}</WorldSessionContext.Provider>
}

export function useWorldSession(): WorldSessionContextValue {
  const context = useContext(WorldSessionContext)
  if (!context) {
    throw new Error('useWorldSession must be used within WorldSessionProvider')
  }
  return context
}
