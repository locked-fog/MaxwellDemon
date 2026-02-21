import { useMemo, useState } from 'react'
import { useWorldSession } from '../../app/state/worldState'
import { canUnlockTech, progressData } from '.'
import type { TechDef } from '../../types'
import { PageCard } from '../../ui/PageCard'
import './progress.css'

type TechViewStatus = 'unlockable' | 'locked' | 'unlocked'

interface TechViewModel {
  tech: TechDef
  status: TechViewStatus
  reason?: string
}

export function TechTreePage() {
  const { world, unlockTech, getWorldScience } = useWorldSession()
  const [notice, setNotice] = useState<string | null>(null)
  const [showUnlockable, setShowUnlockable] = useState(true)
  const [showLocked, setShowLocked] = useState(false)
  const [showUnlocked, setShowUnlocked] = useState(false)
  const science = getWorldScience()
  const sortedTechs = useMemo(() => {
    return progressData.orderedTechIds
      .map((id) => progressData.techById.get(id))
      .filter((tech): tech is TechDef => Boolean(tech))
  }, [])
  const items = useMemo(() => {
    const viewModels: TechViewModel[] = sortedTechs.map((tech) => {
      if (world.progress.unlockedTechIds.includes(tech.id)) {
        return { tech, status: 'unlocked' }
      }
      const check = canUnlockTech(world, tech.id)
      if (check.ok) {
        return { tech, status: 'unlockable' }
      }
      return {
        tech,
        status: 'locked',
        reason: check.reason,
      }
    })

    return viewModels.filter((item) => {
      if (item.status === 'unlockable') {
        return showUnlockable
      }
      if (item.status === 'locked') {
        return showLocked
      }
      return showUnlocked
    })
  }, [showLocked, showUnlockable, showUnlocked, sortedTechs, world])

  const unlockableCount = useMemo(
    () => sortedTechs.filter((tech) => canUnlockTech(world, tech.id).ok).length,
    [sortedTechs, world]
  )

  return (
    <PageCard title="科技树" subtitle="默认仅显示当前可解锁；按解说顺序排序">
      <div className="progress-header-grid">
        <p>已解锁：{world.progress.unlockedTechIds.length}</p>
        <p>总科技：{progressData.techs.length}</p>
        <p>当前可解锁：{unlockableCount}</p>
        <p>可用 science：{formatMetric(science)}</p>
        <p>当前时代：{world.progress.era}</p>
      </div>

      <section className="progress-visibility-row">
        <label>
          <input
            type="checkbox"
            checked={showUnlockable}
            onChange={(event) => setShowUnlockable(event.target.checked)}
          />
          仅当前可解锁
        </label>
        <label>
          <input type="checkbox" checked={showLocked} onChange={(event) => setShowLocked(event.target.checked)} />
          显示不可解锁
        </label>
        <label>
          <input
            type="checkbox"
            checked={showUnlocked}
            onChange={(event) => setShowUnlocked(event.target.checked)}
          />
          显示已解锁
        </label>
      </section>

      {notice ? <p className="progress-notice">{notice}</p> : null}

      {items.length === 0 ? <p>当前筛选条件下没有科技项。</p> : null}

      <div className="progress-list">
        {items.map(({ tech, status, reason }) => {
          const unlocked = status === 'unlocked'
          const unlockable = status === 'unlockable'
          const prereqNames =
            tech.prereq.length === 0
              ? 'none'
              : tech.prereq.map((id) => progressData.techById.get(id)?.name ?? id).join(' / ')

          return (
            <article key={tech.id} className={unlocked ? 'progress-card unlocked' : 'progress-card'}>
              <header className="progress-card-header">
                <h3>{tech.name}</h3>
                <span className="progress-era">{tech.era}</span>
              </header>
              <p className="progress-desc">{tech.desc}</p>
              <p>id: {tech.id}</p>
              <p>前置：{prereqNames}</p>
              <p>cost(science)：{formatMetric(tech.cost.science)}</p>
              <p>
                状态：
                {unlocked ? '已解锁' : unlockable ? '可解锁' : reason ?? '不可解锁'}
              </p>
              <button
                type="button"
                disabled={!unlockable}
                onClick={() => {
                  const result = unlockTech(tech.id)
                  if (!result.ok) {
                    setNotice(result.reason ?? '科技解锁失败。')
                    return
                  }
                  setNotice(`科技已解锁：${tech.name}`)
                }}
              >
                {unlocked ? 'Unlocked' : 'Unlock'}
              </button>
            </article>
          )
        })}
      </div>
    </PageCard>
  )
}

function formatMetric(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0
  const rounded = Math.round(safe * 100) / 100
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
    return `${Math.round(rounded)}`
  }
  return rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}
