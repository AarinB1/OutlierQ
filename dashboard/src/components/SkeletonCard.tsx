export function SkeletonSignalCard() {
  return (
    <div className="bg-surface-secondary border border-border rounded-card p-6 border-l-[3px] border-l-border">
      <div className="flex items-start justify-between mb-4">
        <div className="skeleton h-7 w-20 rounded" />
        <div className="skeleton h-6 w-14 rounded-md" />
      </div>
      <div className="flex items-baseline gap-3 mb-5">
        <div className="skeleton h-6 w-24 rounded" />
        <div className="skeleton h-4 w-20 rounded" />
      </div>
      <div className="mb-4">
        <div className="flex justify-between mb-1.5">
          <div className="skeleton h-3 w-16 rounded" />
          <div className="skeleton h-3 w-8 rounded" />
        </div>
        <div className="skeleton h-1.5 w-full rounded-full" />
      </div>
      <div className="skeleton h-8 w-full rounded mb-3" />
      <div className="flex gap-1.5 mb-3">
        <div className="skeleton h-5 w-16 rounded-md" />
        <div className="skeleton h-5 w-10 rounded" />
        <div className="skeleton h-5 w-10 rounded" />
      </div>
      <div className="border-t border-border pt-3 mt-auto flex justify-between">
        <div className="flex items-center gap-2">
          <div className="skeleton h-2 w-2 rounded-full" />
          <div className="skeleton h-3 w-16 rounded" />
        </div>
        <div className="skeleton h-3 w-20 rounded" />
      </div>
    </div>
  )
}

export function SkeletonEventCard() {
  return (
    <div className="relative pl-8 pb-6">
      <div className="skeleton absolute left-0 top-3 w-2 h-2 rounded-full" />
      <div className="bg-surface-secondary border border-border rounded-card py-4 px-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="skeleton h-5 w-14 rounded" />
          <div className="skeleton h-5 w-20 rounded-md" />
          <div className="skeleton h-4 w-12 rounded" />
          <div className="skeleton h-4 w-8 rounded ml-auto" />
        </div>
        <div className="flex gap-3">
          <div className="skeleton h-3 w-14 rounded" />
          <div className="skeleton h-3 w-20 rounded" />
        </div>
        <div className="flex gap-1.5 mt-2.5">
          <div className="skeleton h-5 w-12 rounded" />
          <div className="skeleton h-5 w-14 rounded" />
          <div className="skeleton h-5 w-10 rounded" />
        </div>
      </div>
    </div>
  )
}

export function SkeletonStatCard() {
  return (
    <div className="bg-surface-secondary border border-border rounded-card p-6">
      <div className="skeleton h-10 w-24 rounded mb-2" />
      <div className="skeleton h-3 w-16 rounded" />
    </div>
  )
}
