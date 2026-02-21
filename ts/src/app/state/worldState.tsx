/* eslint-disable react-refresh/only-export-components */
import type { PropsWithChildren } from 'react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import {
  decodeWorldSaveFromBase64,
  encodeWorldSaveToBase64,
  loadWorldFromIndexedDb,
  persistWorldToIndexedDb,
  SaveFormatError,
} from '../../features/save'
import type { BlockState, GraphState, WorldState } from '../../types'
import {
  createInitialWorld,
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
  saveReady: boolean
  saveError: string | null
  saveNow: () => Promise<void>
  exportSave: () => Promise<string>
  importSave: (encoded: string) => Promise<void>
}

const WorldSessionContext = createContext<WorldSessionContextValue | null>(null)

export function WorldSessionProvider({
  children,
  initialMapCellCount = 300,
  initialMapSeed,
}: WorldSessionProviderProps) {
  const [saveReady, setSaveReady] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const lastAutoSavedDayRef = useRef<number | null>(null)
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
  const saveNow = useCallback(async () => {
    if (!saveReady) {
      throw new Error('Save system is still initializing.')
    }
    try {
      await persistWorldToIndexedDb(session.world)
      lastAutoSavedDayRef.current = Math.floor(session.world.time.day)
      setSaveError(null)
    } catch (error) {
      const message = toSaveErrorMessage(error)
      setSaveError(message)
      throw new Error(message)
    }
  }, [saveReady, session.world])
  const exportSave = useCallback(async () => {
    try {
      const encoded = encodeWorldSaveToBase64(session.world)
      setSaveError(null)
      return encoded
    } catch (error) {
      const message = toSaveErrorMessage(error)
      setSaveError(message)
      throw new Error(message)
    }
  }, [session.world])
  const importSave = useCallback(
    async (encoded: string) => {
      try {
        const world = decodeWorldSaveFromBase64(encoded, createInitialWorld)
        dispatch({ type: 'replace_world', world })
        await persistWorldToIndexedDb(world)
        lastAutoSavedDayRef.current = Math.floor(world.time.day)
        setSaveError(null)
      } catch (error) {
        const message = toSaveErrorMessage(error)
        setSaveError(message)
        throw new Error(message)
      }
    },
    [dispatch]
  )

  useEffect(() => {
    let isCancelled = false

    void (async () => {
      try {
        const loaded = await loadWorldFromIndexedDb(createInitialWorld)
        if (isCancelled) {
          return
        }
        if (loaded) {
          dispatch({ type: 'replace_world', world: loaded })
          lastAutoSavedDayRef.current = Math.floor(loaded.time.day)
        } else {
          lastAutoSavedDayRef.current = 1
        }
        setSaveError(null)
      } catch (error) {
        if (isCancelled) {
          return
        }
        setSaveError(toSaveErrorMessage(error))
      } finally {
        if (!isCancelled) {
          setSaveReady(true)
        }
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [dispatch])

  useEffect(() => {
    if (!saveReady) {
      return
    }

    const currentDay = Math.floor(session.world.time.day)
    const lastSavedDay = lastAutoSavedDayRef.current

    if (lastSavedDay === null) {
      lastAutoSavedDayRef.current = currentDay
      return
    }

    if (currentDay <= lastSavedDay) {
      return
    }

    void persistWorldToIndexedDb(session.world)
      .then(() => {
        lastAutoSavedDayRef.current = currentDay
        setSaveError(null)
      })
      .catch((error) => {
        setSaveError(toSaveErrorMessage(error))
      })
  }, [saveReady, session.world])

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
      saveReady,
      saveError,
      saveNow,
      exportSave,
      importSave,
    }
  }, [
    exportSave,
    importSave,
    saveError,
    saveReady,
    saveNow,
    selectBlock,
    session,
    setSelectedBlockGraph,
    tickWorld,
    unlockBlock,
  ])

  return <WorldSessionContext.Provider value={value}>{children}</WorldSessionContext.Provider>
}

export function useWorldSession(): WorldSessionContextValue {
  const context = useContext(WorldSessionContext)
  if (!context) {
    throw new Error('useWorldSession must be used within WorldSessionProvider')
  }
  return context
}

function toSaveErrorMessage(error: unknown): string {
  if (error instanceof SaveFormatError) {
    return `[${error.code}] ${error.message}`
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Unknown save error.'
}
