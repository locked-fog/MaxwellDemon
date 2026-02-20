import { PageCard } from '../../ui/PageCard'

const blockChecklist = ['库存', '地形', '容量', '邻接信息', '产线摘要（吞吐/瓶颈）']

export function BlockPanelPage() {
  return (
    <PageCard title="区块面板" subtitle="区块内状态聚合与入口">
      <ul>
        {blockChecklist.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </PageCard>
  )
}
