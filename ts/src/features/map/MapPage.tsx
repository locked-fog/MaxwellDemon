import { PageCard } from '../../ui/PageCard'

const mapChecklist = [
  '六边形网格渲染',
  '区块解锁',
  '区块选择与进入',
  '邻接/抽取约束显示',
]

export function MapPage() {
  return (
    <PageCard title="地图系统" subtitle="World / Block / 邻接关系入口">
      <ul>
        {mapChecklist.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </PageCard>
  )
}
