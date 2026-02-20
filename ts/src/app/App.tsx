import { useMemo, useState } from 'react'
import './app.css'
import { WorldSessionProvider } from './state/worldState'
import { BlockPanelPage } from '../features/block/BlockPanelPage'
import { GraphEditorPage } from '../features/graph/GraphEditorPage'
import { MapPage } from '../features/map/MapPage'
import { PolicyTreePage } from '../features/progress/PolicyTreePage'
import { TechTreePage } from '../features/progress/TechTreePage'
import { TradePage } from '../features/trade/TradePage'

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

function App() {
  const [activeSection, setActiveSection] = useState<AppSection>('map')
  const [isGameStarted, setIsGameStarted] = useState(false)
  const [sessionId, setSessionId] = useState(1)
  const [activeMapCellCount, setActiveMapCellCount] = useState(DEFAULT_MAP_CELLS)
  const [draftMapCellCount, setDraftMapCellCount] = useState(String(DEFAULT_MAP_CELLS))
  const [setupError, setSetupError] = useState<string | null>(null)

  const page = useMemo(() => {
    switch (activeSection) {
      case 'map':
        return <MapPage />
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
  }, [activeSection])

  function startGame(): void {
    const parsed = Number.parseInt(draftMapCellCount, 10)
    if (!Number.isFinite(parsed)) {
      setSetupError('Map size must be an integer.')
      return
    }
    const clamped = Math.min(MAX_MAP_CELLS, Math.max(MIN_MAP_CELLS, parsed))
    setActiveMapCellCount(clamped)
    setSessionId((value) => value + 1)
    setActiveSection('map')
    setSetupError(null)
    setIsGameStarted(true)
  }

  if (!isGameStarted) {
    return (
      <div className="app-shell setup-shell">
        <section className="setup-card">
          <h1>Maxwell Demon v0.1</h1>
          <p>Configure world size before starting a new game.</p>
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
          {setupError ? <p className="setup-error">{setupError}</p> : null}
          <div className="setup-actions">
            <button type="button" className="setup-btn primary" onClick={startGame}>
              Start New Game
            </button>
            <button
              type="button"
              className="setup-btn"
              onClick={() => setDraftMapCellCount(String(DEFAULT_MAP_CELLS))}
            >
              Reset to 300
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <WorldSessionProvider key={sessionId} initialMapCellCount={activeMapCellCount}>
      <div className="app-shell">
        <header className="app-header">
          <h1>Maxwell Demon v0.1</h1>
          <p>Full-content release baseline | map cells: {activeMapCellCount}</p>
          <button type="button" className="new-world-btn" onClick={() => setIsGameStarted(false)}>
            New World Setup
          </button>
        </header>

        <nav className="app-nav" aria-label="primary">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={section.id === activeSection ? 'nav-btn active' : 'nav-btn'}
              onClick={() => setActiveSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <main className="app-main">{page}</main>
      </div>
    </WorldSessionProvider>
  )
}

export default App
