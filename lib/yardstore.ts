import { open, catchUp, PROPS, type Memory, type PropKind, type Resident, type YardState } from '@/lib/yard'

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

/**
 * WHICH YARD IS BEING REMEMBERED.
 *
 * The demo yard on the front page is a real simulation of real cats, so it earns
 * memories and bonds exactly like a player's own — and it must NOT be written
 * over the player's. Somebody who looks at the demo, then connects a wallet,
 * would otherwise find their first real yard already carrying a stranger's
 * history and a seed it did not choose.
 *
 * A separate key rather than a flag that skips saving, because the demo is worth
 * remembering between visits: come back tomorrow and the demo has moved on too,
 * which is the whole thing being demonstrated.
 */
const KEY = 'cradle.yard.v1'
export const DEMO_KEY = 'cradle.yard.demo.v1'
const HOUR = 60 * 60 * 1000

/** A day away is as much as the yard will play out. See above. */
export const MAX_TICKS = 24

type Stored = YardState & { at: number }

function load(key = KEY): Stored | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const v = JSON.parse(raw)
    // A half-written or hand-edited value must start a fresh yard, not crash one.
    if (!Array.isArray(v?.cats) || !Array.isArray(v?.kept)) return null
    return v as Stored
  } catch {
    return null
  }
}

function save(s: Stored, key = KEY) {
  try { window.localStorage.setItem(key, JSON.stringify(s)) } catch {}
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
    /*
     * FURNITURE SURVIVES A VISIT. It is the one thing in the yard the player
     * chose, and a yard that forgot it every morning would be asking them to
     * furnish it again forever.
     *
     * Read defensively: a yard stored before props existed has none of this, and
     * an older value must open an empty yard rather than crash a new one.
     */
    props: Array.isArray(prev.props) ? prev.props : [],
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
export function visit(cats: Resident[], key = KEY): Visit {
  const prev = load(key)
  const now = Date.now()

  const seed = prev?.seed ?? ((Math.random() * 0xffffffff) >>> 0)
  const base = reconcile(prev, cats, seed)

  const elapsed = prev ? now - prev.at : 0
  const hours = Math.min(MAX_TICKS, Math.floor(elapsed / HOUR))

  const { state, happened } = hours > 0 ? catchUp(base, hours) : { state: base, happened: [] }

  save({ ...state, at: now }, key)
  return { state, happened, hours, fresh: !prev }
}

/**
 * Put something in the yard, or take it away. Returns the yard as it now stands.
 *
 * WRITES STRAIGHT THROUGH, and does not run any ticks. Furnishing is not an event
 * in the yard's history — the cats do not remember the day the toy arrived, they
 * simply start playing. Ticking here would also mean the number of times somebody
 * fiddled with the furniture changed how much time had passed.
 *
 * The effect shows up on the NEXT visit, which is the same promise the rest of
 * the yard makes: come back later and they will have got on with it.
 */
/*
 * ONE PROP AT A TIME, AND THE STORE DECIDES WHAT IS THERE NOW.
 *
 * This took the whole new set, and it had a real bug: three buttons tapped in
 * quick succession all computed their new set from the SAME rendered value, so
 * the last tap won and the other two were lost. Measured — putting out all three
 * left only the perch.
 *
 * Reading the current set from storage inside the toggle removes the race
 * entirely, because every call starts from what is actually saved rather than
 * from whatever the caller last rendered.
 */
export function furnish(prop: PropKind, key = KEY): YardState | null {
  const prev = load(key)
  if (!prev) return null
  const now = Array.isArray(prev.props) ? prev.props : []
  const next: Stored = {
    ...prev,
    props: PROPS.filter(p => (p === prop ? !now.includes(p) : now.includes(p))),
  }
  save(next, key)
  return next
}

/** What is out there now, without arriving. Null before the first visit. */
export function furniture(key = KEY): PropKind[] {
  const prev = load(key)
  return prev && Array.isArray(prev.props) ? prev.props : []
}

/**
 * Who was in the yard when it was last looked at.
 *
 * The yard's own page needs the resident list and cannot rebuild it the way the
 * Cradle does: that list is the player's OWN cats — found through a wallet, a
 * connector and two collections — joined to the cats of everybody they follow.
 * Reproducing that on a second page would be a second copy of the hardest lookup
 * in the app, free to disagree with the first.
 *
 * The saved yard already holds exactly that list, because `visit()` wrote it. So
 * the page reads it rather than earning it again. The cost is honest and small:
 * somebody who opens /yard having never opened the game sees nothing, and is
 * told to start at the front door.
 */
export function residents(key = KEY): Resident[] {
  const prev = load(key)
  return prev && Array.isArray(prev.cats) ? prev.cats : []
}

/** Start again. For a yard that has gone wrong, or a cat list worth resetting. */
export function forget(key = KEY) {
  try { window.localStorage.removeItem(key) } catch {}
}
