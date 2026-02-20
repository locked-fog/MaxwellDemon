import { useMemo, useState } from 'react'
import './app.css'
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
  { id: 'map', label: '地图' },
  { id: 'block', label: '区块面板' },
  { id: 'graph', label: '工作流编辑器' },
  { id: 'tech', label: '科技树' },
  { id: 'policy', label: '政策树' },
  { id: 'trade', label: '交易/商人' },
]

function App() {
  const [activeSection, setActiveSection] = useState<AppSection>('map')

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

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Maxwell Demon v0.1</h1>
        <p>完整内容版开发基线</p>
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
  )
}

export default App
