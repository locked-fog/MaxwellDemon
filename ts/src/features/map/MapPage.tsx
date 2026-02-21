import { useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { BlockState, TerrainId } from '../../types'
import { useWorldSession } from '../../app/state/worldState'
import { PageCard } from '../../ui/PageCard'
import { axialToPixel, hexPolygonPoints } from './hex'
import './map.css'

const HEX_SIZE = 44
const VIEW_PADDING = 52

const TERRAIN_COLORS: Record<TerrainId, string> = {
  plains: '#97b95a',
  forest: '#3c7f4f',
  mountain: '#9f9691',
  water: '#2f6fa8',
  coast: '#c7ae77',
}

interface MapPageProps {
  onOpenBlockGraph?: (blockId: string) => void
}

export function MapPage({ onOpenBlockGraph }: MapPageProps) {
  const { world, selectedBlockId, selectedBlock, selectBlock, unlockBlock, canUnlock } = useWorldSession()
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const suppressTileClickRef = useRef(false)
  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
    moved: false,
  })

  const layout = useMemo(() => buildMapLayout(world.blocks), [world.blocks])
  const zoomedWidth = Math.max(420, layout.bounds.width * zoom)
  const zoomedHeight = Math.max(380, layout.bounds.height * zoom)

  function applyZoom(next: number): void {
    const clamped = Math.min(3, Math.max(0.45, next))
    setZoom(clamped)
  }

  function onMapPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) {
      return
    }
    const container = scrollRef.current
    if (!container) {
      return
    }
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: container.scrollLeft,
      startScrollTop: container.scrollTop,
      moved: false,
    }
    setIsDragging(false)
  }

  function onMapPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const container = scrollRef.current
    const drag = dragRef.current
    if (!container || !drag.active) {
      return
    }

    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      drag.moved = true
      setIsDragging(true)
    }

    if (!drag.moved) {
      return
    }

    container.scrollLeft = drag.startScrollLeft - deltaX
    container.scrollTop = drag.startScrollTop - deltaY
  }

  function onMapPointerUp(): void {
    const drag = dragRef.current
    if (!drag.active) {
      return
    }

    suppressTileClickRef.current = drag.moved
    drag.active = false
    drag.moved = false
    setIsDragging(false)
  }

  function onTileClick(blockId: string): void {
    if (suppressTileClickRef.current) {
      suppressTileClickRef.current = false
      return
    }
    selectBlock(blockId)
  }

  function onTileDoubleClick(blockId: string): void {
    if (suppressTileClickRef.current) {
      suppressTileClickRef.current = false
      return
    }
    selectBlock(blockId)
    onOpenBlockGraph?.(blockId)
  }

  return (
    <PageCard title="Map" subtitle="Hex world, block selection, and unlock flow">
      <div className="map-layout">
        <div className="map-svg-wrap">
          <div className="map-tools">
            <button type="button" className="map-tool-btn" onClick={() => applyZoom(zoom - 0.15)}>
              -
            </button>
            <input
              className="map-zoom-slider"
              type="range"
              min={0.45}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(event) => applyZoom(Number.parseFloat(event.target.value))}
            />
            <button type="button" className="map-tool-btn" onClick={() => applyZoom(zoom + 0.15)}>
              +
            </button>
            <button type="button" className="map-tool-btn" onClick={() => applyZoom(1)}>
              100%
            </button>
            <span className="map-zoom-text">{Math.round(zoom * 100)}%</span>
            <span className="map-count-text">tiles: {world.blocks.length}</span>
          </div>

          <div
            ref={scrollRef}
            className={isDragging ? 'map-scroll dragging' : 'map-scroll'}
            onPointerDown={onMapPointerDown}
            onPointerMove={onMapPointerMove}
            onPointerUp={onMapPointerUp}
            onPointerCancel={onMapPointerUp}
            onPointerLeave={onMapPointerUp}
          >
            <svg
              className="map-svg"
              width={zoomedWidth}
              height={zoomedHeight}
              viewBox={`${layout.bounds.minX} ${layout.bounds.minY} ${layout.bounds.width} ${layout.bounds.height}`}
              aria-label="hex world map"
            >
              {layout.tiles.map((tile) => (
                <polygon
                  key={`fill_${tile.block.id}`}
                  points={tile.polygon}
                  fill={tile.fill}
                  className="map-fill"
                  onClick={() => onTileClick(tile.block.id)}
                  onDoubleClick={() => onTileDoubleClick(tile.block.id)}
                />
              ))}

              {layout.tiles.map((tile) => (
                <polygon key={`border_${tile.block.id}`} points={tile.polygon} className="map-border-base" />
              ))}

              {layout.tiles.map((tile) => {
                const unlockable = !tile.block.unlocked && canUnlock(tile.block.id)
                if (!unlockable) {
                  return null
                }
                return (
                  <polygon
                    key={`unlockable_${tile.block.id}`}
                    points={tile.polygon}
                    className="map-border-unlockable"
                  />
                )
              })}

              {layout.tiles.map((tile) => {
                const isSelected = tile.block.id === selectedBlockId
                if (!isSelected) {
                  return null
                }
                return (
                  <polygon
                    key={`selected_${tile.block.id}`}
                    points={tile.polygon}
                    className="map-border-selected"
                  />
                )
              })}

              {layout.tiles.map((tile) => (
                <text key={`label_${tile.block.id}`} x={tile.labelX} y={tile.labelY} className="map-label">
                  {tile.block.coord.q},{tile.block.coord.r}
                </text>
              ))}
            </svg>
          </div>
        </div>

        <aside className="map-side">
          {selectedBlock ? (
            <>
              <h3 className="map-side-title">Selected Block</h3>
              <p className="map-meta">ID: {selectedBlock.id}</p>
              <p className="map-meta">
                Coord: ({selectedBlock.coord.q}, {selectedBlock.coord.r})
              </p>
              <p className="map-meta">Terrain: {selectedBlock.terrain}</p>
              <p className="map-meta">Unlocked: {selectedBlock.unlocked ? 'yes' : 'no'}</p>
              <p className="map-meta">
                Yield (sum/tick): {formatMetric(sumValues(selectedBlock.extractionRatePerTick))}
              </p>
              <p className="map-hint">Tip: double-click a tile to jump to Graph Editor.</p>

              {!selectedBlock.unlocked && canUnlock(selectedBlock.id) ? (
                <button
                  type="button"
                  className="map-action-btn"
                  onClick={() => unlockBlock(selectedBlock.id)}
                >
                  Unlock Block
                </button>
              ) : null}

              {!selectedBlock.unlocked && !canUnlock(selectedBlock.id) ? (
                <p className="map-hint">Unlock requires an adjacent unlocked block.</p>
              ) : null}
            </>
          ) : (
            <p className="map-hint">Select a block to inspect details.</p>
          )}
        </aside>
      </div>
    </PageCard>
  )
}

function sumValues(values: Record<string, number>): number {
  let total = 0
  for (const qty of Object.values(values)) {
    if (Number.isFinite(qty)) {
      total += qty
    }
  }
  return total
}

function formatMetric(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0
  const rounded = Math.round(safe * 100) / 100
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
    return `${Math.round(rounded)}`
  }
  return rounded.toFixed(2)
}

interface MapTileView {
  block: BlockState
  fill: string
  polygon: string
  labelX: number
  labelY: number
}

interface MapLayout {
  tiles: MapTileView[]
  bounds: {
    minX: number
    minY: number
    width: number
    height: number
  }
}

function buildMapLayout(blocks: BlockState[]): MapLayout {
  const centers = blocks.map((block) => {
    const point = axialToPixel(block.coord, HEX_SIZE)
    return { block, point }
  })

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const { point } of centers) {
    minX = Math.min(minX, point.x - HEX_SIZE)
    maxX = Math.max(maxX, point.x + HEX_SIZE)
    minY = Math.min(minY, point.y - HEX_SIZE)
    maxY = Math.max(maxY, point.y + HEX_SIZE)
  }

  const bounds = {
    minX: minX - VIEW_PADDING,
    minY: minY - VIEW_PADDING,
    width: maxX - minX + VIEW_PADDING * 2,
    height: maxY - minY + VIEW_PADDING * 2,
  }

  const tiles = centers.map(({ block, point }) => {
    const baseColor = TERRAIN_COLORS[block.terrain]
    return {
      block,
      fill: block.unlocked ? baseColor : '#1a2230',
      polygon: hexPolygonPoints(point, HEX_SIZE),
      labelX: point.x,
      labelY: point.y + 4,
    }
  })

  return { tiles, bounds }
}
