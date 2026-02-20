import { PageCard } from '../../ui/PageCard'

const graphChecklist = ['节点增删改', '连线规则校验', '参数面板', '运行状态映射', '图状态持久化']

export function GraphEditorPage() {
  return (
    <PageCard title="工作流编辑器" subtitle="Graph / Node / Edge 操作中心">
      <ul>
        {graphChecklist.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </PageCard>
  )
}
