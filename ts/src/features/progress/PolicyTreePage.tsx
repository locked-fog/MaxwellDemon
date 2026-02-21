import { useMemo, useState } from 'react'
import { useWorldSession } from '../../app/state/worldState'
import { canSelectPolicy, computeProgressModifiers, computeUnlockState, progressData } from '.'
import type { PolicyDef, PolicyTrack } from '../../types'
import { PageCard } from '../../ui/PageCard'
import './progress.css'

const TRACK_ORDER: Record<string, number> = {
  Industry: 0,
  Ecology: 1,
  Faith: 2,
  Trade: 3,
}

type PolicyViewStatus = 'unlockable' | 'locked' | 'selected'

interface PolicyViewModel {
  policy: PolicyDef
  status: PolicyViewStatus
  reason?: string
}

export function PolicyTreePage() {
  const { world, togglePolicy } = useWorldSession()
  const [notice, setNotice] = useState<string | null>(null)
  const [showUnlockable, setShowUnlockable] = useState(true)
  const [showLocked, setShowLocked] = useState(false)
  const [showSelected, setShowSelected] = useState(false)
  const modifiers = useMemo(() => computeProgressModifiers(world.progress), [world.progress])
  const unlockState = useMemo(() => computeUnlockState(world.progress), [world.progress])
  const sortedPolicies = useMemo(() => {
    return progressData.orderedPolicyIds
      .map((id) => progressData.policyById.get(id))
      .filter((policy): policy is PolicyDef => Boolean(policy))
      .sort((left, right) => {
        const trackDiff = (TRACK_ORDER[left.track] ?? 0) - (TRACK_ORDER[right.track] ?? 0)
        if (trackDiff !== 0) {
          return trackDiff
        }
        return (left.order ?? 0) - (right.order ?? 0)
      })
  }, [])
  const viewModels = useMemo<PolicyViewModel[]>(() => {
    return sortedPolicies.map((policy) => {
      const selected = world.progress.selectedPolicyIds.includes(policy.id)
      if (selected) {
        return { policy, status: 'selected' }
      }
      const check = canSelectPolicy(world, policy.id)
      if (check.ok) {
        return { policy, status: 'unlockable' }
      }
      return {
        policy,
        status: 'locked',
        reason: check.reason,
      }
    })
  }, [sortedPolicies, world])
  const visibleModels = useMemo(() => {
    return viewModels.filter((item) => {
      if (item.status === 'unlockable') {
        return showUnlockable
      }
      if (item.status === 'locked') {
        return showLocked
      }
      return showSelected
    })
  }, [showLocked, showSelected, showUnlockable, viewModels])
  const trackModels = useMemo(() => groupPoliciesByTrack(visibleModels), [visibleModels])
  const unlockableCount = useMemo(
    () => viewModels.filter((item) => item.status === 'unlockable').length,
    [viewModels]
  )

  return (
    <PageCard title="政策树" subtitle="树形路径视图；默认仅显示当前可选择">
      <div className="progress-header-grid">
        <p>已选政策：{world.progress.selectedPolicyIds.length}</p>
        <p>政策槽：{unlockState.policySlotCount}</p>
        <p>总政策：{progressData.policies.length}</p>
        <p>当前可选择：{unlockableCount}</p>
        <p>
          throughput/power/entropy：{formatMetric(modifiers.throughputMultiplier)} /{' '}
          {formatMetric(modifiers.powerEfficiencyMultiplier)} / {formatMetric(modifiers.entropyGainMultiplier)}
        </p>
      </div>

      <section className="progress-visibility-row">
        <label>
          <input
            type="checkbox"
            checked={showUnlockable}
            onChange={(event) => setShowUnlockable(event.target.checked)}
          />
          仅当前可选择
        </label>
        <label>
          <input type="checkbox" checked={showLocked} onChange={(event) => setShowLocked(event.target.checked)} />
          显示不可选择
        </label>
        <label>
          <input
            type="checkbox"
            checked={showSelected}
            onChange={(event) => setShowSelected(event.target.checked)}
          />
          显示已生效
        </label>
      </section>

      {notice ? <p className="progress-notice">{notice}</p> : null}

      {visibleModels.length === 0 ? <p>当前筛选条件下没有政策项。</p> : null}

      <div className="policy-tree-root">
        {trackModels.map((trackModel) => {
          const depths = buildTrackDepthMap(trackModel.items.map((item) => item.policy))
          const columns = groupByDepth(trackModel.items, depths)
          return (
            <section key={trackModel.track} className="policy-track-tree">
              <header className="policy-track-header">
                <h3>{trackModel.track}</h3>
                <p>visible: {trackModel.items.length}</p>
              </header>
              <div className="policy-tree-columns">
                {columns.map((column, depth) => (
                  <div key={`${trackModel.track}_${depth}`} className="policy-tree-column">
                    <p className="policy-tree-depth">D{depth}</p>
                    {column.map((item) => {
                      const selected = item.status === 'selected'
                      const unlockable = item.status === 'unlockable'
                      const policy = item.policy
                      const prereqNames =
                        policy.prereq.length === 0
                          ? 'none'
                          : policy.prereq.map((id) => progressData.policyById.get(id)?.name ?? id).join(' / ')
                      return (
                        <article
                          key={policy.id}
                          className={selected ? 'progress-card unlocked policy-node' : 'progress-card policy-node'}
                        >
                          <header className="progress-card-header">
                            <h3>{policy.name}</h3>
                            <span className="progress-era">{policy.track}</span>
                          </header>
                          <p className="progress-desc">{policy.desc}</p>
                          <p>id: {policy.id}</p>
                          <p>前置路径：{prereqNames}</p>
                          <p>效果：{policy.effects.map(formatEffect).join(' | ')}</p>
                          <p>状态：{selected ? '已生效' : unlockable ? '可选择' : item.reason ?? '不可选择'}</p>
                          <button
                            type="button"
                            disabled={!selected && !unlockable}
                            onClick={() => {
                              const result = togglePolicy(policy.id)
                              if (!result.ok) {
                                setNotice(result.reason ?? '政策切换失败。')
                                return
                              }
                              setNotice(selected ? `政策已取消：${policy.name}` : `政策已生效：${policy.name}`)
                            }}
                          >
                            {selected ? 'Disable' : 'Enable'}
                          </button>
                        </article>
                      )
                    })}
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </PageCard>
  )
}

function formatEffect(effect: { kind: string; target?: string; operator?: string; value?: number }): string {
  if (effect.kind !== 'modifier') {
    return effect.kind
  }
  return `${effect.target} ${effect.operator} ${formatMetric(effect.value ?? 0)}`
}

function formatMetric(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  const rounded = Math.round(safe * 100) / 100
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
    return `${Math.round(rounded)}`
  }
  return rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function groupPoliciesByTrack(items: PolicyViewModel[]): Array<{ track: PolicyTrack; items: PolicyViewModel[] }> {
  const byTrack = new Map<PolicyTrack, PolicyViewModel[]>()
  const tracks: PolicyTrack[] = ['Industry', 'Ecology', 'Faith', 'Trade']
  for (const track of tracks) {
    byTrack.set(track, [])
  }
  for (const item of items) {
    const list = byTrack.get(item.policy.track)
    if (list) {
      list.push(item)
    }
  }
  return tracks.map((track) => ({
    track,
    items: (byTrack.get(track) ?? []).sort((left, right) => {
      const orderDiff = (left.policy.order ?? 0) - (right.policy.order ?? 0)
      if (orderDiff !== 0) {
        return orderDiff
      }
      return left.policy.id.localeCompare(right.policy.id)
    }),
  }))
}

function buildTrackDepthMap(policies: PolicyDef[]): ReadonlyMap<string, number> {
  const byId = new Map(policies.map((policy) => [policy.id, policy]))
  const memo = new Map<string, number>()
  const visiting = new Set<string>()

  const resolveDepth = (policyId: string): number => {
    if (memo.has(policyId)) {
      return memo.get(policyId) ?? 0
    }
    if (visiting.has(policyId)) {
      return 0
    }
    visiting.add(policyId)
    const policy = byId.get(policyId)
    if (!policy) {
      visiting.delete(policyId)
      memo.set(policyId, 0)
      return 0
    }

    let depth = 0
    for (const prereqId of policy.prereq) {
      const prereq = byId.get(prereqId)
      if (!prereq || prereq.track !== policy.track) {
        continue
      }
      depth = Math.max(depth, resolveDepth(prereqId) + 1)
    }
    visiting.delete(policyId)
    memo.set(policyId, depth)
    return depth
  }

  for (const policy of policies) {
    resolveDepth(policy.id)
  }

  return memo
}

function groupByDepth(
  items: PolicyViewModel[],
  depthById: ReadonlyMap<string, number>
): PolicyViewModel[][] {
  const maxDepth = items.reduce((max, item) => Math.max(max, depthById.get(item.policy.id) ?? 0), 0)
  const columns: PolicyViewModel[][] = Array.from({ length: maxDepth + 1 }, () => [])
  for (const item of items) {
    const depth = depthById.get(item.policy.id) ?? 0
    columns[depth].push(item)
  }
  return columns
}
