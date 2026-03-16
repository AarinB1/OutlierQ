export function SkeletonSignalCard() {
  return (
    <div className="card space-y-4 overflow-hidden border-l-[3px] border-l-border">
      <div className="flex items-start justify-between">
        <div className="skeleton h-7 w-24 rounded-md" />
        <div className="skeleton h-6 w-16 rounded-full" />
      </div>

      <div className="flex items-center gap-3">
        <div className="skeleton h-6 w-24 rounded-md" />
        <div className="skeleton h-4 w-20 rounded-md" />
      </div>

      <div className="skeleton h-8 w-full rounded-lg" />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="skeleton h-3 w-16 rounded" />
          <div className="skeleton h-3 w-10 rounded" />
        </div>
        <div className="skeleton h-1.5 w-full rounded-full" />
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="skeleton h-5 w-20 rounded-full" />
        <div className="skeleton h-5 w-14 rounded-full" />
        <div className="skeleton h-5 w-24 rounded-full" />
      </div>

      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="skeleton h-2 w-2 rounded-full" />
            <div className="skeleton h-3 w-16 rounded" />
          </div>
          <div className="flex items-center gap-2">
            <div className="skeleton h-3 w-12 rounded" />
            <div className="skeleton h-3 w-14 rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function SkeletonEventCard() {
  return (
    <div className="relative pl-8">
      <div className="absolute left-0 top-3">
        <div className="skeleton h-2.5 w-2.5 rounded-full" />
      </div>
      <div className="card space-y-3 py-4 px-5">
        <div className="flex items-center gap-3">
          <div className="skeleton h-5 w-14 rounded-md" />
          <div className="skeleton h-5 w-24 rounded-full" />
          <div className="skeleton h-4 w-16 rounded" />
          <div className="ml-auto flex items-center gap-2">
            <div className="skeleton h-1 w-10 rounded-full" />
            <div className="skeleton h-4 w-10 rounded" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="skeleton h-3 w-16 rounded" />
          <div className="skeleton h-3 w-20 rounded" />
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="skeleton h-5 w-16 rounded-full" />
          <div className="skeleton h-5 w-20 rounded-full" />
          <div className="skeleton h-5 w-14 rounded-full" />
        </div>
      </div>
    </div>
  )
}

export function SkeletonStatCard() {
  return (
    <div className="card space-y-3">
      <div className="skeleton h-3 w-20 rounded" />
      <div className="skeleton h-10 w-24 rounded-md" />
      <div className="skeleton h-2 w-full rounded-full" />
    </div>
  )
}
