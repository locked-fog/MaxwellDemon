export function createId(prefix: string, seed: number): string {
  return `${prefix}_${seed.toString(36)}`
}
