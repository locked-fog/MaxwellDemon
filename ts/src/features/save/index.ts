export interface SaveMigration {
  fromVersion: number
  toVersion: number
  migrate: (raw: unknown) => unknown
}

export const saveVersion = 1
