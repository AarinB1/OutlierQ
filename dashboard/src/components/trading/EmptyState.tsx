interface EmptyStateProps {
  icon?: string
  title: string
  subtitle?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export default function EmptyState({ icon = '◇', title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-txt-tertiary text-4xl mb-4">{icon}</div>
      <p className="text-txt-secondary text-sm mb-1">{title}</p>
      {subtitle && <p className="text-txt-tertiary text-xs mb-4 max-w-md">{subtitle}</p>}
      {action && (
        <button onClick={action.onClick} className="btn-primary text-xs px-4 py-2">
          {action.label}
        </button>
      )}
    </div>
  )
}
