'use client'

/**
 * STAMINA: A CAT CAN LOSE THREE GAUNTLETS, THEN IT RESTS.
 *
 * JP, 2026-10-06: "cats should have stamina; so they cant spam quick fight all
 * the time. maybe they have energy for 3 losses after that they need to rest;
 * which then go into the yard and spending time with your cat can reduce the
 * timer but not lower than half the time". Then, deciding the open points:
 *
 *   rest        8 hours
 *   costs       a LOST gauntlet round, one energy; wins are free
 *   quick fight no stamina at all — "quick fights are stamina less but save no
 *               data" (see Cradle: a quick fight records nothing)
 *   yard        "yard open + actions": the rest runs at double speed while the
 *               yard is open, and each thing done there (answering a cat,
 *               placing an item) takes ACTION_MS off
 *   floor       never under half the rest: 4 hours from the moment it began
 *
 * Kept per cat — a holder's token uid, or `guest:<code>` — in localStorage, like
 * everything else here: this app has no database. So it stops a player spamming
 * by habit, not a determined one; clearing the browser resets it, as it resets
 * the yard and the loot.
 */
export const MAX_ENERGY = 3
export const REST_MS = 8 * 60 * 60 * 1000
/** The floor: a rest can be cut to half, never further. */
export const MIN_REST_MS = REST_MS / 2
/** One thing done in the yard: answering a cat, placing an item. */
export const ACTION_MS = 20 * 60 * 1000

const KEY = 'cradle.stamina.v1'

type Entry = {
  /** Gauntlet losses since the last rest ended. */
  spent: number
  /** When the rest began, or null while the cat still has energy. */
  restFrom: number | null
  /** Time taken off the rest by the yard, in ms. */
  credit: number
}
type All = Record<string, Entry>

const BLANK: Entry = { spent: 0, restFrom: null, credit: 0 }

function read(): All {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as All } catch { return {} }
}
function write(all: All) {
  try { window.localStorage.setItem(KEY, JSON.stringify(all)) } catch {}
  // The yard and the menu both show it, so both hear about a change.
  try { window.dispatchEvent(new Event('cradle-stamina')) } catch {}
}

/** When a rest that began at `from`, with `credit` taken off, ends. */
const endOf = (e: Entry) =>
  (e.restFrom ?? 0) + Math.max(MIN_REST_MS, REST_MS - e.credit)

export type Stamina = {
  energy: number
  resting: boolean
  /** When the rest ends, ms since the epoch; null while not resting. */
  until: number | null
  /** The soonest the yard can bring it to: the floor. */
  floor: number | null
}

/** Where a cat stands now. A rest that has run out ends here, on read. */
export function stamina(cat: string, now = Date.now()): Stamina {
  const all = read()
  const e = all[cat] ?? BLANK
  if (e.restFrom !== null && now >= endOf(e)) {
    all[cat] = { ...BLANK }
    write(all)
    return { energy: MAX_ENERGY, resting: false, until: null, floor: null }
  }
  if (e.restFrom !== null) {
    return { energy: 0, resting: true, until: endOf(e), floor: e.restFrom + MIN_REST_MS }
  }
  return { energy: MAX_ENERGY - e.spent, resting: false, until: null, floor: null }
}

/** A lost gauntlet round. The third sends the cat to rest. */
export function spendEnergy(cat: string, now = Date.now()): Stamina {
  const all = read()
  const e = all[cat] ?? { ...BLANK }
  if (e.restFrom === null) {
    const spent = e.spent + 1
    all[cat] = spent >= MAX_ENERGY ? { spent, restFrom: now, credit: 0 } : { ...e, spent }
    write(all)
  }
  return stamina(cat, now)
}

/** Time off every resting cat: `ms` of yard time, or an action's worth. */
export function restInYard(ms: number) {
  const all = read()
  let changed = false
  for (const [cat, e] of Object.entries(all)) {
    if (e.restFrom === null) continue
    all[cat] = { ...e, credit: Math.min(REST_MS - MIN_REST_MS, e.credit + ms) }
    changed = true
  }
  if (changed) write(all)
}

/** Every cat resting right now, soonest back first. */
export function resting(now = Date.now()): { cat: string; until: number; floor: number }[] {
  return Object.keys(read())
    .map(cat => ({ cat, s: stamina(cat, now) }))
    .filter(x => x.s.resting)
    .map(x => ({ cat: x.cat, until: x.s.until!, floor: x.s.floor! }))
    .sort((a, b) => a.until - b.until)
}

/** "7h 40m", "25m", "under a minute". */
export function restLeft(until: number, now = Date.now()): string {
  const m = Math.ceil((until - now) / 60000)
  if (m <= 0) return 'any moment'
  const h = Math.floor(m / 60)
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

/*
 * ONE ACTION'S WORTH, AT MOST EVERY ACTION_GAP. Opening your cat or placing an
 * item takes ACTION_MS off — but tapping a cat twelve times in a row is not
 * twelve visits, so the credit comes at most once per gap.
 */
export const ACTION_GAP = 10 * 60 * 1000
const LAST = 'cradle.stamina.lastAction'

/** Something done with your cats in the yard. True when it took time off. */
export function yardAction(now = Date.now()): boolean {
  if (!resting(now).length) return false
  let last = 0
  try { last = Number(window.localStorage.getItem(LAST) ?? 0) } catch {}
  if (now - last < ACTION_GAP) return false
  try { window.localStorage.setItem(LAST, String(now)) } catch {}
  restInYard(ACTION_MS)
  return true
}
