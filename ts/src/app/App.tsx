import { useCallback, useEffect, useMemo, useState } from 'react'
import './app.css'
import {
  clearWorldSaveFromIndexedDb,
  decodeWorldSaveFromBase64,
  loadWorldFromIndexedDb,
  persistWorldToIndexedDb,
} from '../features/save'
import { useWorldSession, WorldSessionProvider } from './state/worldState'
import { BlockPanelPage } from '../features/block/BlockPanelPage'
import { GraphEditorPage } from '../features/graph/GraphEditorPage'
import { MapPage } from '../features/map/MapPage'
import { PolicyTreePage } from '../features/progress/PolicyTreePage'
import { TechTreePage } from '../features/progress/TechTreePage'
import { TradePage } from '../features/trade/TradePage'
import { createInitialWorld } from './state/worldLogic'

type AppSection = 'map' | 'block' | 'graph' | 'tech' | 'policy' | 'trade'

interface SectionDef {
  id: AppSection
  label: string
}

const sections: SectionDef[] = [
  { id: 'map', label: 'Map' },
  { id: 'block', label: 'Block Panel' },
  { id: 'graph', label: 'Graph Editor' },
  { id: 'tech', label: 'Tech Tree' },
  { id: 'policy', label: 'Policy Tree' },
  { id: 'trade', label: 'Trade' },
]

const DEFAULT_MAP_CELLS = 300
const MIN_MAP_CELLS = 91
const MAX_MAP_CELLS = 3000
const MIN_MAP_SEED = 1
const MAX_MAP_SEED = 2147483647
const SIM_SPEED_OPTIONS = [
  {
    id: '1x',
    label: '1x (1t/s)',
    intervalMs: 1000,
    tickBatch: 1,
    requiredTier: 1,
    unlockHint: 'Base speed',
  },
  {
    id: '2x',
    label: '2x',
    intervalMs: 500,
    tickBatch: 1,
    requiredTier: 2,
    unlockHint: 'Need 80 power_cell and 25 chip in inventory',
  },
  {
    id: '4x',
    label: '4x',
    intervalMs: 250,
    tickBatch: 1,
    requiredTier: 3,
    unlockHint: 'Need 350 power_cell, 120 chip, and 200 alloy',
  },
  {
    id: '8x',
    label: '8x',
    intervalMs: 125,
    tickBatch: 1,
    requiredTier: 4,
    unlockHint: 'Need 30 anchor_matter or 10 seed_core',
  },
] as const

type SimSpeedId = (typeof SIM_SPEED_OPTIONS)[number]['id']

function App() {
  const [isBootChecking, setIsBootChecking] = useState(true)
  const [bootError, setBootError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<AppSection>('map')
  const [isGameStarted, setIsGameStarted] = useState(false)
  const [sessionId, setSessionId] = useState(1)
  const [activeMapCellCount, setActiveMapCellCount] = useState(DEFAULT_MAP_CELLS)
  const [activeMapSeed, setActiveMapSeed] = useState(() => createRandomMapSeed())
  const [draftMapCellCount, setDraftMapCellCount] = useState(String(DEFAULT_MAP_CELLS))
  const [draftMapSeed, setDraftMapSeed] = useState(() => String(createRandomMapSeed()))
  const [setupError, setSetupError] = useState<string | null>(null)
  const [showSetupImportPanel, setShowSetupImportPanel] = useState(false)
  const [setupImportText, setSetupImportText] = useState('')

  useEffect(() => {
    let isCancelled = false

    void (async () => {
      try {
        const loaded = await loadWorldFromIndexedDb(createInitialWorld)
        if (isCancelled) {
          return
        }

        if (loaded) {
          setActiveMapCellCount(loaded.mapCellCount)
          setActiveMapSeed(loaded.mapSeed)
          setDraftMapCellCount(String(loaded.mapCellCount))
          setDraftMapSeed(String(loaded.mapSeed))
          setIsGameStarted(true)
        }
        setBootError(null)
      } catch (error) {
        if (!isCancelled) {
          setBootError(toErrorMessage(error))
        }
      } finally {
        if (!isCancelled) {
          setIsBootChecking(false)
        }
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [])

  async function startGame(): Promise<void> {
    const parsedCells = Number.parseInt(draftMapCellCount, 10)
    const parsedSeed = Number.parseInt(draftMapSeed, 10)

    if (!Number.isFinite(parsedCells)) {
      setSetupError('Map size must be an integer.')
      return
    }
    if (!Number.isFinite(parsedSeed)) {
      setSetupError('Map seed must be an integer.')
      return
    }

    const clampedCells = Math.min(MAX_MAP_CELLS, Math.max(MIN_MAP_CELLS, parsedCells))
    const clampedSeed = Math.min(MAX_MAP_SEED, Math.max(MIN_MAP_SEED, Math.abs(parsedSeed)))

    try {
      await clearWorldSaveFromIndexedDb()
    } catch (error) {
      setSetupError(toErrorMessage(error))
      return
    }

    setActiveMapCellCount(clampedCells)
    setActiveMapSeed(clampedSeed)
    setSessionId((value) => value + 1)
    setActiveSection('map')
    setSetupError(null)
    setBootError(null)
    setShowSetupImportPanel(false)
    setSetupImportText('')
    setIsGameStarted(true)
  }

  async function importSaveFromSetup(): Promise<void> {
    const encoded = setupImportText.trim()
    if (!encoded) {
      setSetupError('Please paste save content before importing.')
      return
    }

    try {
      const world = decodeWorldSaveFromBase64(encoded, createInitialWorld)
      await persistWorldToIndexedDb(world)

      setActiveMapCellCount(world.mapCellCount)
      setActiveMapSeed(world.mapSeed)
      setDraftMapCellCount(String(world.mapCellCount))
      setDraftMapSeed(String(world.mapSeed))
      setSessionId((value) => value + 1)
      setActiveSection('map')
      setSetupError(null)
      setBootError(null)
      setShowSetupImportPanel(false)
      setSetupImportText('')
      setIsGameStarted(true)
    } catch (error) {
      setSetupError(toErrorMessage(error))
    }
  }

  if (isBootChecking) {
    return (
      <div className="app-shell setup-shell">
        <section className="setup-card">
          <h1>Maxwell Demon v0.1</h1>
          <p>Checking local save data...</p>
          {bootError ? <p className="setup-error">{bootError}</p> : null}
        </section>
      </div>
    )
  }

  if (!isGameStarted) {
    return (
      <div className="app-shell setup-shell">
        <section className="setup-card">
          <h1>Maxwell Demon v0.1</h1>
          <p>Configure world size or import a save before starting.</p>
          <label className="setup-label" htmlFor="map-cell-count">
            Map Cells
          </label>
          <input
            id="map-cell-count"
            className="setup-input"
            type="number"
            min={MIN_MAP_CELLS}
            max={MAX_MAP_CELLS}
            value={draftMapCellCount}
            onChange={(event) => setDraftMapCellCount(event.target.value)}
          />
          <p className="setup-hint">
            Recommended: {DEFAULT_MAP_CELLS} (minimum {MIN_MAP_CELLS}, maximum {MAX_MAP_CELLS})
          </p>
          <label className="setup-label" htmlFor="map-seed">
            Map Seed
          </label>
          <div className="setup-seed-row">
            <input
              id="map-seed"
              className="setup-input"
              type="number"
              min={MIN_MAP_SEED}
              max={MAX_MAP_SEED}
              value={draftMapSeed}
              onChange={(event) => setDraftMapSeed(event.target.value)}
            />
            <button
              type="button"
              className="setup-btn"
              onClick={() => setDraftMapSeed(String(createRandomMapSeed()))}
            >
              Randomize
            </button>
          </div>
          <p className="setup-hint">Same seed + same map cells {'=>'} same terrain and yield distribution.</p>
          {setupError ? <p className="setup-error">{setupError}</p> : null}
          <div className="setup-actions">
            <button
              type="button"
              className="setup-btn primary"
              onClick={() => {
                void startGame()
              }}
            >
              Start New Game
            </button>
            <button
              type="button"
              className="setup-btn"
              onClick={() => setShowSetupImportPanel((value) => !value)}
            >
              {showSetupImportPanel ? 'Cancel Import' : 'Import Save'}
            </button>
            <button
              type="button"
              className="setup-btn"
              onClick={() => {
                setDraftMapCellCount(String(DEFAULT_MAP_CELLS))
                setDraftMapSeed(String(activeMapSeed))
              }}
            >
              Reset Defaults
            </button>
          </div>
          {showSetupImportPanel ? (
            <div className="save-io-panel setup-import-panel">
              <label className="save-io-label" htmlFor="setup-save-import">
                Paste save content
              </label>
              <textarea
                id="setup-save-import"
                className="save-io-textarea"
                value={setupImportText}
                onChange={(event) => setSetupImportText(event.target.value)}
                placeholder="MD_SAVE_B64_V1...."
              />
              <div className="save-io-actions">
                <button
                  type="button"
                  className="runtime-btn"
                  onClick={() => {
                    void importSaveFromSetup()
                  }}
                >
                  Load Save
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    )
  }

  return (
    <WorldSessionProvider
      key={sessionId}
      initialMapCellCount={activeMapCellCount}
      initialMapSeed={activeMapSeed}
    >
      <GameSessionFrame
        activeSection={activeSection}
        onChangeSection={setActiveSection}
        onNewWorldSetup={() => setIsGameStarted(false)}
      />
    </WorldSessionProvider>
  )
}

export default App

interface GameSessionFrameProps {
  activeSection: AppSection
  onChangeSection: (section: AppSection) => void
  onNewWorldSetup: () => void
}

function GameSessionFrame({
  activeSection,
  onChangeSection,
  onNewWorldSetup,
}: GameSessionFrameProps) {
  const { world, tickWorld, saveReady, saveError, saveNow, exportSave, importSave } = useWorldSession()
  const [isRunning, setIsRunning] = useState(false)
  const [speedId, setSpeedId] = useState<SimSpeedId>('1x')
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const [showImportPanel, setShowImportPanel] = useState(false)
  const [importText, setImportText] = useState('')
  const [showExportPanel, setShowExportPanel] = useState(false)
  const [exportText, setExportText] = useState('')
  const speedUnlockTier = useMemo(() => resolveSpeedUnlockTier(world), [world])
  const selectedSpeed = SIM_SPEED_OPTIONS.find((option) => option.id === speedId) ?? SIM_SPEED_OPTIONS[0]
  const speed =
    selectedSpeed.requiredTier <= speedUnlockTier
      ? selectedSpeed
      : [...SIM_SPEED_OPTIONS]
          .reverse()
          .find((option) => option.requiredTier <= speedUnlockTier) ?? SIM_SPEED_OPTIONS[0]

  useEffect(() => {
    if (!isRunning) {
      return
    }
    const timerId = window.setInterval(() => {
      tickWorld(speed.tickBatch)
    }, speed.intervalMs)
    return () => window.clearInterval(timerId)
  }, [isRunning, speed, tickWorld])

  const handleCopyExport = useCallback(async () => {
    try {
      const encoded = exportText || (await exportSave())
      setExportText(encoded)
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(encoded)
        setSaveNotice('Save copied to clipboard.')
      } else {
        setSaveNotice('Clipboard is unavailable in this browser.')
      }
    } catch (error) {
      setSaveNotice(error instanceof Error ? error.message : 'Save export failed.')
    }
  }, [exportSave, exportText])

  const handleDownloadExportFile = useCallback(async () => {
    try {
      const encoded = exportText || (await exportSave())
      setExportText(encoded)

      const blob = new Blob([encoded], { type: 'text/plain;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const fileName = buildSaveFileName()
      anchor.href = url
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      window.URL.revokeObjectURL(url)
      setSaveNotice(`Save exported to file: ${fileName}`)
    } catch (error) {
      setSaveNotice(error instanceof Error ? error.message : 'Save export failed.')
    }
  }, [exportSave, exportText])

  const handleSaveNow = useCallback(async () => {
    try {
      await saveNow()
      setSaveNotice('World saved.')
    } catch (error) {
      setSaveNotice(error instanceof Error ? error.message : 'Save failed.')
    }
  }, [saveNow])

  const handlePlayPauseToggle = useCallback(() => {
    setIsRunning((value) => !value)
    void saveNow()
      .then(() => {
        setSaveNotice('World saved on play/pause.')
      })
      .catch((error) => {
        setSaveNotice(error instanceof Error ? error.message : 'Save failed.')
      })
  }, [saveNow])

  const handleImportSave = useCallback(async () => {
    const encoded = importText.trim()
    if (!encoded) {
      setSaveNotice('Paste save content before loading.')
      return
    }

    try {
      await importSave(encoded)
      setIsRunning(false)
      setImportText('')
      setShowImportPanel(false)
      setSaveNotice('Save imported successfully.')
    } catch (error) {
      setSaveNotice(error instanceof Error ? error.message : 'Save import failed.')
    }
  }, [importSave, importText])

  const page = useMemo(() => {
    switch (activeSection) {
      case 'map':
        return <MapPage onOpenBlockGraph={() => onChangeSection('graph')} />
      case 'block':
        return <BlockPanelPage />
      case 'graph':
        return <GraphEditorPage />
      case 'tech':
        return <TechTreePage />
      case 'policy':
        return <PolicyTreePage />
      case 'trade':
        return <TradePage />
      default:
        return null
    }
  }, [activeSection, onChangeSection])

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Maxwell Demon v0.1</h1>
        <p>
          Full-content release baseline | map cells: {world.mapCellCount} | seed: {world.mapSeed}
        </p>
        <div className="app-runtime-row">
          <span className={isRunning ? 'sim-state running' : 'sim-state'}>
            {isRunning ? 'Running' : 'Paused'}
          </span>
          <span className="sim-time">
            Day {formatDay(world.time.day)} | Tick {world.time.tick}
          </span>
          <button type="button" className="runtime-btn" onClick={handlePlayPauseToggle}>
            {isRunning ? 'Pause' : 'Play'}
          </button>
          <button type="button" className="runtime-btn" onClick={() => tickWorld(1)}>
            Step
          </button>
          <button type="button" className="runtime-btn" onClick={handleSaveNow} disabled={!saveReady}>
            Save Now
          </button>
          <button
            type="button"
            className="runtime-btn"
            onClick={() => {
              setShowExportPanel((value) => !value)
              if (showImportPanel) {
                setShowImportPanel(false)
              }
            }}
            disabled={!saveReady}
          >
            Export Save
          </button>
          <button
            type="button"
            className="runtime-btn"
            onClick={() => {
              setShowImportPanel((value) => !value)
              if (showExportPanel) {
                setShowExportPanel(false)
              }
            }}
          >
            Load Save
          </button>
          <label className="runtime-speed-field">
            <span>Speed</span>
            <select
              value={speedId}
              onChange={(event) => {
                const nextId = event.target.value as SimSpeedId
                const next = SIM_SPEED_OPTIONS.find((option) => option.id === nextId)
                if (!next || next.requiredTier > speedUnlockTier) {
                  return
                }
                setSpeedId(nextId)
              }}
              className="runtime-speed-select"
            >
              {SIM_SPEED_OPTIONS.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                  disabled={option.requiredTier > speedUnlockTier}
                  title={option.unlockHint}
                >
                  {option.requiredTier > speedUnlockTier
                    ? `${option.label} [locked]`
                    : option.label}
                </option>
              ))}
            </select>
          </label>
          <span className="runtime-unlock-hint">{resolveSpeedUnlockHint(speedUnlockTier)}</span>
          <span className="runtime-unlock-hint">
            {saveError
              ? `Save error: ${saveError}`
              : saveNotice ?? (saveReady ? 'Auto save: every game day (IndexedDB)' : 'Loading save...')}
          </span>
          <button type="button" className="new-world-btn" onClick={onNewWorldSetup}>
            New World Setup
          </button>
        </div>
        {showExportPanel ? (
          <section className="save-io-panel">
            <p className="save-io-label">Export Save</p>
            <div className="save-io-actions">
              <button type="button" className="runtime-btn" onClick={handleCopyExport}>
                Copy to Clipboard
              </button>
              <button type="button" className="runtime-btn" onClick={handleDownloadExportFile}>
                Export to File
              </button>
            </div>
            <textarea
              className="save-io-textarea"
              value={exportText}
              onChange={(event) => setExportText(event.target.value)}
              placeholder="Exported save content will appear here..."
              readOnly
            />
          </section>
        ) : null}
        {showImportPanel ? (
          <section className="save-io-panel">
            <label className="save-io-label" htmlFor="runtime-save-import">
              Paste save content
            </label>
            <textarea
              id="runtime-save-import"
              className="save-io-textarea"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="MD_SAVE_B64_V1...."
            />
            <div className="save-io-actions">
              <button type="button" className="runtime-btn" onClick={handleImportSave}>
                Load Save
              </button>
              <button
                type="button"
                className="runtime-btn"
                onClick={() => {
                  setShowImportPanel(false)
                  setImportText('')
                }}
              >
                Cancel
              </button>
            </div>
          </section>
        ) : null}
      </header>

      <nav className="app-nav" aria-label="primary">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={section.id === activeSection ? 'nav-btn active' : 'nav-btn'}
            onClick={() => onChangeSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>

      <main className="app-main">{page}</main>
    </div>
  )
}

function createRandomMapSeed(): number {
  return Math.floor(Math.random() * MAX_MAP_SEED) + 1
}

function formatDay(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  const rounded = Math.round(value * 10) / 10
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
    return `${Math.round(rounded)}`
  }
  return rounded.toFixed(1)
}

function buildSaveFileName(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  const hours = `${now.getHours()}`.padStart(2, '0')
  const minutes = `${now.getMinutes()}`.padStart(2, '0')
  const seconds = `${now.getSeconds()}`.padStart(2, '0')
  return `maxwell-demon-save-${year}${month}${day}-${hours}${minutes}${seconds}.txt`
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return 'Unknown error.'
}

function resolveSpeedUnlockTier(world: { blocks: Array<{ inventory: Record<string, number> }> }): number {
  const total = sumInventories(world.blocks)
  if ((total.anchor_matter ?? 0) >= 30 || (total.seed_core ?? 0) >= 10) {
    return 4
  }
  if ((total.power_cell ?? 0) >= 350 && (total.chip ?? 0) >= 120 && (total.alloy ?? 0) >= 200) {
    return 3
  }
  if ((total.power_cell ?? 0) >= 80 && (total.chip ?? 0) >= 25) {
    return 2
  }
  return 1
}

function resolveSpeedUnlockHint(tier: number): string {
  const next = SIM_SPEED_OPTIONS.find((option) => option.requiredTier === tier + 1)
  if (!next) {
    return 'All speed tiers unlocked.'
  }
  return `Next speed unlock: ${next.unlockHint}`
}

function sumInventories(
  blocks: Array<{ inventory: Record<string, number> }>
): Record<string, number> {
  const total: Record<string, number> = {}
  for (const block of blocks) {
    for (const [resourceId, qty] of Object.entries(block.inventory)) {
      if (!Number.isFinite(qty) || qty <= 0) {
        continue
      }
      total[resourceId] = (total[resourceId] ?? 0) + qty
    }
  }
  return total
}
