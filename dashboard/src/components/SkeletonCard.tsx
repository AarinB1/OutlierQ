/** Skeleton that mimics SignalCard layout */
export function SkeletonSignalCard() {
  return (
    <div className="bg-surface-secondary border border-border rounded-card p-6 overflow-hidden">
      <div className="flex items-start justify-between mb-4">
        <div className="skeleton h-7 w-24 rounded" />
        <div className="skeleton h-5 w-14 rounded-md" />
      </div>
      <div className="flex items-baseline gap-3 mb-5">
        <div className="skeleton h-6 w-16 rounded" />
        <div className="skeleton h-3 w-20 rounded" />
      </div>
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1.5">
          <div className="skeleton h-3 w-16 rounded" />
          <div className="skeleton h-3 w-8 rounded" />
        </div>
        <div className="h-1 w-full rounded-full bg-white/5">
          <div className="skeleton h-full w-3/4 rounded-full" />
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <div className="skeleton h-4 w-20 rounded" />
        <div className="skeleton h-4 w-24 rounded" />
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <div className="skeleton h-4 w-16 rounded" />
        <div className="skeleton h-4 w-12 rounded" />
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div className="flex items-center gap-2">
          <div className="skeleton w-1.5 h-1.5 rounded-full" />
          <div className="skeleton h-3 w-14 rounded" />
        </div>
        <div className="skeleton h-3 w-20 rounded" />
      </div>
    </div>
  )
}

/** Skeleton that mimics EventTimeline card shape */
export function SkeletonEventCard() {
  return (
    <div className="relative pl-8 pb-6">
      <div className="absolute left-0 top-3 w-2 h-2 rounded-full bg-surface-tertiary" />
      <div className="bg-surface-secondary border border-border rounded-card py-4 px-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="skeleton h-5 w-16 rounded" />
          <div className="skeleton h-5 w-20 rounded-md" />
          <div className="skeleton h-3 w-12 rounded ml-auto" />
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div className="skeleton h-3 w-16 rounded" />
          <div className="skeleton h-3 w-20 rounded" />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <div className="skeleton h-4 w-14 rounded" />
          <div className="skeleton h-4 w-16 rounded" />
          <div className="skeleton h-4 w-12 rounded" />
        </div>
      </div>
    </div>
  )
}

/** Skeleton that mimics stat number cards in AccuracyPanel */
export function SkeletonStatCard() {
  return (
    <div className="bg-surface-secondary border border-border rounded-card p-6">
      <div className="skeleton h-10 w-20 rounded mb-2" />
      <div className="skeleton h-3 w-16 rounded" />
    </div>
  )
}
