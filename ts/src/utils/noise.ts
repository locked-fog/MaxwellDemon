interface Vec2 {
  x: number
  y: number
}

export interface FbmOptions {
  octaves?: number
  lacunarity?: number
  gain?: number
}

const DEFAULT_FBM_OPTIONS: Required<FbmOptions> = {
  octaves: 4,
  lacunarity: 2,
  gain: 0.5,
}

export function perlin2(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = x0 + 1
  const y1 = y0 + 1

  const sx = fade(x - x0)
  const sy = fade(y - y0)

  const n00 = dotGridGradient(x0, y0, x, y, seed)
  const n10 = dotGridGradient(x1, y0, x, y, seed)
  const n01 = dotGridGradient(x0, y1, x, y, seed)
  const n11 = dotGridGradient(x1, y1, x, y, seed)

  const ix0 = lerp(n00, n10, sx)
  const ix1 = lerp(n01, n11, sx)
  return clampRange(lerp(ix0, ix1, sy), -1, 1)
}

export function fbm2(x: number, y: number, seed: number, options: FbmOptions = {}): number {
  const { octaves, lacunarity, gain } = { ...DEFAULT_FBM_OPTIONS, ...options }

  let frequency = 1
  let amplitude = 1
  let value = 0
  let amplitudeTotal = 0

  for (let octave = 0; octave < octaves; octave += 1) {
    value += perlin2(x * frequency, y * frequency, seed + octave * 1013) * amplitude
    amplitudeTotal += amplitude
    amplitude *= gain
    frequency *= lacunarity
  }

  if (amplitudeTotal <= 0) {
    return 0
  }

  return clampRange(value / amplitudeTotal, -1, 1)
}

function dotGridGradient(ix: number, iy: number, x: number, y: number, seed: number): number {
  const gradient = gradientAt(ix, iy, seed)
  const dx = x - ix
  const dy = y - iy
  return dx * gradient.x + dy * gradient.y
}

function gradientAt(ix: number, iy: number, seed: number): Vec2 {
  const angle = hashToUnit(ix, iy, seed) * Math.PI * 2
  return {
    x: Math.cos(angle),
    y: Math.sin(angle),
  }
}

function hashToUnit(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123
  return value - Math.floor(value)
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clampRange(value: number, min: number, max: number): number {
  if (value < min) {
    return min
  }
  if (value > max) {
    return max
  }
  return value
}
