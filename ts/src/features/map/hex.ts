import type { BlockCoord } from '../../types'

const SQRT_3 = Math.sqrt(3)

export interface PixelPoint {
  x: number
  y: number
}

export function axialToPixel(coord: BlockCoord, size: number): PixelPoint {
  return {
    x: size * SQRT_3 * (coord.q + coord.r / 2),
    y: size * 1.5 * coord.r,
  }
}

export function hexPolygonPoints(center: PixelPoint, size: number): string {
  const points: string[] = []
  for (let i = 0; i < 6; i += 1) {
    const angle = ((60 * i - 30) * Math.PI) / 180
    const x = center.x + size * Math.cos(angle)
    const y = center.y + size * Math.sin(angle)
    points.push(`${x},${y}`)
  }
  return points.join(' ')
}
