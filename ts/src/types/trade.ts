import type { Id, ResourceId } from './common'

export interface MarketOffer {
  id: Id
  resourceId: ResourceId
  side: 'buy' | 'sell'
  unitPrice: number
  quantity: number
}

export interface QuestObjective {
  resourceId: ResourceId
  qty: number
}

export interface QuestReward {
  credits: number
  resources: Array<{ resourceId: ResourceId; qty: number }>
  reputation?: number
}

export interface QuestState {
  id: Id
  kind: 'daily' | 'weekly'
  objectives: QuestObjective[]
  reward: QuestReward
  expiresAtUnixMs: number
  completed: boolean
  claimed: boolean
}

export interface ContractState {
  id: Id
  required: QuestObjective[]
  dueGameDay: number
  penaltyCredits: number
  penaltyReputation: number
  fulfilled: boolean
}

export interface TradeState {
  credits: number
  reputation: number
  dailyResetAtUnixMs: number
  weeklyResetAtUnixMs: number
  quests: QuestState[]
  contracts: ContractState[]
}
