import type {
  NodeTypeDef,
  PolicyDef,
  QuestDef,
  RecipeDef,
  ResourceDef,
  StoryEventDef,
  TechDef,
  TraderDef,
} from '../types'

export interface DataBundle {
  resources: ResourceDef[]
  nodeTypes: NodeTypeDef[]
  recipes: RecipeDef[]
  techs: TechDef[]
  policies: PolicyDef[]
  traders: TraderDef[]
  dailyQuests: QuestDef[]
  weeklyQuests: QuestDef[]
  storyEvents: StoryEventDef[]
}
