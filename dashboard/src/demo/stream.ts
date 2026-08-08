/**
 * Synthetic replacement for the SSE signal stream (`EventSource('/api/stream')`).
 *
 * Emits one pre-authored signal every ~25s and loops the queue forever, so the
 * Signals page visibly updates while someone is watching. Looped emissions get
 * a fresh id suffix (`-r1`, `-r2`, ...) because `SignalList` de-duplicates by
 * id and would otherwise ignore the second pass. Each emitted signal is also
 * written into the mock store so a later refetch stays consistent with what the
 * viewer already saw.
 */

import { STREAM_FIRST_DELAY_MS, STREAM_INTERVAL_MS } from './demoConfig'
import { DATASET } from './fixtures'
import { ingestStreamSignal } from './mockTransport'
import type { Signal } from '../types'

export function subscribeDemoSignalStream(onSignal: (signal: Signal) => void): () => void {
  const queue = DATASET.streamQueue
  if (queue.length === 0) return () => {}

  let cursor = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  const emit = () => {
    if (stopped) return
    const lap = Math.floor(cursor / queue.length)
    const base = queue[cursor % queue.length]
    cursor += 1
    const signal: Signal = lap === 0
      ? base
      : { ...base, id: `${base.id}-r${lap}`, created_at: new Date().toISOString() }
    ingestStreamSignal(signal)
    onSignal(signal)
    timer = setTimeout(emit, STREAM_INTERVAL_MS)
  }

  timer = setTimeout(emit, STREAM_FIRST_DELAY_MS)

  return () => {
    stopped = true
    if (timer != null) clearTimeout(timer)
  }
}
