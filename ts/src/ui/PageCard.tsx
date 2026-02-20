import type { CSSProperties, ReactNode } from 'react'

interface PageCardProps {
  title: string
  subtitle: string
  children?: ReactNode
}

export function PageCard({ title, subtitle, children }: PageCardProps) {
  return (
    <section style={cardStyle}>
      <h2 style={titleStyle}>{title}</h2>
      <p style={subtitleStyle}>{subtitle}</p>
      {children}
    </section>
  )
}

const cardStyle: CSSProperties = {
  border: '1px solid #22364c',
  borderRadius: '14px',
  background: '#0f1a29',
  padding: '16px',
  boxSizing: 'border-box',
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: '1.1rem',
}

const subtitleStyle: CSSProperties = {
  margin: '6px 0 0',
  color: '#9fb2c9',
  fontSize: '0.92rem',
}
