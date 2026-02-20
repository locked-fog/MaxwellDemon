import { PageCard } from '../../ui/PageCard'

const techChecklist = ['>= 50 科技项', '前置校验', '成本支付', '解锁生效（影响 sim）']

export function TechTreePage() {
  return (
    <PageCard title="科技树" subtitle="Tech unlock / 进度推进">
      <ul>
        {techChecklist.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </PageCard>
  )
}
