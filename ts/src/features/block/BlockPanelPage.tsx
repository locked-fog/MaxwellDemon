import { useWorldSession } from '../../app/state/worldState'
import { PageCard } from '../../ui/PageCard'

export function BlockPanelPage() {
  const { selectedBlock, unlockBlock, canUnlock, listNeighbors } = useWorldSession()

  if (!selectedBlock) {
    return (
      <PageCard title="Block Panel" subtitle="No block selected">
        <p>Select a block on the map first.</p>
      </PageCard>
    )
  }

  const neighbors = listNeighbors(selectedBlock.id)

  return (
    <PageCard title="Block Panel" subtitle="Local block state and logistics context">
      <p>ID: {selectedBlock.id}</p>
      <p>
        Coord: ({selectedBlock.coord.q}, {selectedBlock.coord.r})
      </p>
      <p>Terrain: {selectedBlock.terrain}</p>
      <p>Unlocked: {selectedBlock.unlocked ? 'yes' : 'no'}</p>
      <p>Capacity Slots: {selectedBlock.capacitySlots}</p>
      <p>Outlet Capacity / Tick: {selectedBlock.outletCapacityPerTick}</p>

      {!selectedBlock.unlocked && canUnlock(selectedBlock.id) ? (
        <button type="button" onClick={() => unlockBlock(selectedBlock.id)}>
          Unlock this block
        </button>
      ) : null}

      <h3>Extraction Rate / Tick</h3>
      <ul>
        {Object.entries(selectedBlock.extractionRatePerTick).map(([resourceId, qty]) => (
          <li key={resourceId}>
            {resourceId}: {formatMetric(qty)}
          </li>
        ))}
      </ul>

      <h3>Inventory</h3>
      {Object.keys(selectedBlock.inventory).length === 0 ? (
        <p>Empty</p>
      ) : (
        <ul>
          {Object.entries(selectedBlock.inventory).map(([resourceId, qty]) => (
            <li key={resourceId}>
              {resourceId}: {formatMetric(qty)}
            </li>
          ))}
        </ul>
      )}

      <h3>Neighbors</h3>
      <ul>
        {neighbors.map((neighbor) => (
          <li key={neighbor.id}>
            {neighbor.id} ({neighbor.coord.q}, {neighbor.coord.r}) -{' '}
            {neighbor.unlocked ? 'unlocked' : 'locked'}
          </li>
        ))}
      </ul>
    </PageCard>
  )
}

function formatMetric(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0
  const rounded = Math.round(safe * 100) / 100
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
    return `${Math.round(rounded)}`
  }
  return rounded.toFixed(2)
}
