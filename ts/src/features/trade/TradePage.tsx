import { PageCard } from '../../ui/PageCard'

const tradeChecklist = ['本地市场', '商人库存与价格波动', '日常/周常刷新', '合同履约与信誉']

export function TradePage() {
  return (
    <PageCard title="交易/商人" subtitle="市场、任务、合同和信誉系统">
      <ul>
        {tradeChecklist.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </PageCard>
  )
}
