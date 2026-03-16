export function SkeletonSignalCard() {
  return (
    <div className="card border-l-[3px] border-l-border py-5">
      <div className="flex items-center justify-between mb-4">
        <div className="skeleton h-7 w-24 rounded" />
        <div className="skeleton h-5 w-14 rounded-full" />
      </div>
      <div className="mb-4 space-y-2">
        <div className="skeleton h-6 w-28 rounded" />
        <div className="skeleton h-3 w-20 rounded" />
      </div>
      <div className="skeleton h-8 w-full rounded mb-4" />
      <div className="mb-4 space-y-2">
        <div className="flex justify-between">
          <div className="skeleton h-3 w-16 rounded" />
          <div className="skeleton h-3 w-10 rounded" />
        </div>
        <div className="skeleton h-1.5 w-full rounded-full" />
      </div>
      <div className="flex gap-1.5 mb-4">
        <div className="skeleton h-4 w-16 rounded-full" />
        <div className="skeleton h-4 w-12 rounded-full" />
        <div className="skeleton h-4 w-20 rounded-full" />
      </div>
      <div className="pt-3 border-t border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="skeleton h-2 w-2 rounded-full" />
          <div className="skeleton h-3 w-14 rounded" />
        </div>
        <div className="skeleton h-3 w-20 rounded" />
      </div>
    </div>
  )
}

export function SkeletonEventCard() {
  return (
    <div className="card py-4 px-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="skeleton h-5 w-16 rounded" />
        <div className="skeleton h-4 w-24 rounded-full" />
        <div className="skeleton h-4 w-14 rounded" />
        <div className="skeleton h-4 w-10 rounded ml-auto" />
      </div>
      <div className="flex gap-3 mb-3">
        <div className="skeleton h-3 w-16 rounded" />
        <div className="skeleton h-3 w-24 rounded" />
      </div>
      <div className="flex gap-1.5">
        <div className="skeleton h-4 w-14 rounded-full" />
        <div className="skeleton h-4 w-16 rounded-full" />
        <div className="skeleton h-4 w-12 rounded-full" />
      </div>
    </div>
  )
}

export function SkeletonStatCard() {
  return (
    <div className="card">
      <div className="skeleton h-10 w-24 rounded mb-3" />
      <div className="skeleton h-3 w-16 rounded" />
    </div>
  )
}
