/**
 * Seeded PRNG for the static demo fixtures. No external dependency.
 *
 * mulberry32 — 32-bit state, ~2^32 period, good enough statistical quality for
 * synthetic price paths and categorical draws, and small enough to read.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number
  /** Uniform in [min, max). */
  float(min: number, max: number): number
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number
  /** True with probability p. */
  chance(p: number): boolean
  /** Uniform choice from a non-empty array. */
  pick<T>(items: readonly T[]): T
  /** Weighted choice; weights must be positive and the same length as items. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T
  /** Fisher-Yates copy — never mutates the input. */
  shuffle<T>(items: readonly T[]): T[]
  /** Standard normal via Box-Muller. */
  normal(): number
  /**
   * Bell-shaped value in [min, max] built from the mean of `bumps` uniforms.
   * Used to cluster confidences plausibly instead of spreading them uniformly.
   */
  clustered(min: number, max: number, bumps?: number): number
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed)
  const rng: Rng = {
    next,
    float: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)],
    weighted: (items, weights) => {
      const total = weights.reduce((a, b) => a + b, 0)
      let roll = next() * total
      for (let i = 0; i < items.length; i += 1) {
        roll -= weights[i]
        if (roll <= 0) return items[i]
      }
      return items[items.length - 1]
    },
    shuffle: (items) => {
      const copy = items.slice()
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1))
        const tmp = copy[i]
        copy[i] = copy[j]
        copy[j] = tmp
      }
      return copy
    },
    normal: () => {
      // Box-Muller; guard against log(0).
      const u = Math.max(next(), Number.EPSILON)
      const v = next()
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    },
    clustered: (min, max, bumps = 3) => {
      let sum = 0
      for (let i = 0; i < bumps; i += 1) sum += next()
      return min + (sum / bumps) * (max - min)
    },
  }
  return rng
}

/** Stable 32-bit hash so arbitrary user input (a typed ticker) gets a fixed seed. */
export function hashSeed(text: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
