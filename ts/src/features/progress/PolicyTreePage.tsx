import { PageCard } from '../../ui/PageCard'

const policyChecklist = ['>= 30 政策项', '>= 3 主线', '代价与收益绑定', '即时 modifier 生效']

export function PolicyTreePage() {
  return (
    <PageCard title="政策树" subtitle="取舍系统与全局 modifier">
      <ul>
        {policyChecklist.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </PageCard>
  )
}
