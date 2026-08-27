import { open, catchUp, type Memory, type Resident, type YardState } from '@/lib/yard'

/**
 * THE YARD, BETWEEN VISITS.
 *
 * lib/yard.ts is a pure simulation with no notion of time or storage. This is the
 * part that remembers, decides how much happened while you were gone, and hands
 * back what to read about.
 *
 * ── ONE TICK IS AN HOUR ──────────────────────────────────────────────────────
 *
 * Not an arbitrary number. A memory lasts SPAN = 24 ticks, so at this rate a
 * memory lasts A DAY and a bond has to be kept up daily to hold. That is the
 * scale the whole thing was tuned for — come back tomorrow and your cats still
 * know each other; leave it a week and they have drifted.
 *
 * A faster tick would burn through the memory span in an afternoon and make every
 * bond permanent-feeling; a slower one would mean nothing ever happened.
 *
 * ── AND A DAY IS THE MOST YOU CAN BANK ───────────────────────────────────────
 *
 * Capped at 24 ticks however long you were away. Without a cap, coming back after
 * a month would run 700 ticks — every memory inside the span would be from the
 * last day of it anyway, so the extra work changes nothing you can see, and it
 * would take a visible moment to compute. Being gone a month and being gone a day
 * land in the same place, which is also the honest thing to tell somebody.
 */

const KEY = 'cradle.yard.v1'
const HOUR = 60 * 60 * 1000

/** A day away is as much as the yard will play out. See above. */
export const MAX_TICKS = 24

type Stored = YardState & { at: number }

function load(): Stored | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    // A half-written or hand-edited value must start a fresh yard, not crash one.
    if (!Array.isArray(v?.cats) || !Array.isArray(v?.kept)) return null
    return v as Stored
  } catch {
    return null
  }
}

function save(s: Stored) {
  try { window.localStorage.setItem(KEY, JSON.stringify(s)) } catch {}
}

/**
 * Fold today's residents into yesterday's yard.
 *
 * The list is not stable between visits — you follow somebody new, or somebody
 * sells a cat — so the stored state is reconciled against whoever is here NOW.
 *
 * MEMORIES OF A DEPARTED CAT ARE DROPPED. Keeping them would leave bonds pointing
 * at a cat that is no longer in the yard and cannot be shown, which reads as the
 * page having lost something rather than as somebody having left.
 */
function reconcile(prev: Stored | null, cats: Resident[], seed: number): YardState {
  if (!prev) return open(seed, cats)

  const here = new Set(cats.map(c => c.uid))
  return {
    seed: prev.seed,
    ticks: prev.ticks,
    cats,
    turnedAway: 0,
    kept: prev.kept.filter(m => here.has(m.a) && here.has(m.b)),
  }
}

export type Visit = {
  state: YardState
  /** What happened while you were away, newest last. */
  happened: Memory[]
  /** How many hours were played out, after the cap. */
  hours: number
  /** True the very first time, when there is no absence to report. */
  fresh: boolean
}

/**
 * Arrive at the yard.
 *
 * Everything that happens is computed HERE, on arrival, from the time elapsed —
 * nothing runs in the background and nothing needs to. Being away N hours is
 * exactly N ticks, which is also why two devices given the same cats and the same
 * absence produce the same yard.
 */
export function visit(cats: Resident[]): Visit {
  const prev = load()
  const now = Date.now()

  const seed = prev?.seed ?? ((Math.random() * 0xffffffff) >>> 0)
  const base = reconcile(prev, cats, seed)

  const elapsed = prev ? now - prev.at : 0
  const hours = Math.min(MAX_TICKS, Math.floor(elapsed / HOUR))

  const { state, happened } = hours > 0 ? catchUp(base, hours) : { state: base, happened: [] }

  save({ ...state, at: now })
  return { state, happened, hours, fresh: !prev }
}

/** Start again. For a yard that has gone wrong, or a cat list worth resetting. */
export function forget() {
  try { window.localStorage.removeItem(KEY) } catch {}
}
