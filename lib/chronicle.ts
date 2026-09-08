import { bond, reads, type YardState } from './yard'

/**
 * THE CHRONICLE — the half of the yard that does NOT forget.
 *
 * JP asked how the yard could make stories the way a fortress does. Three of the
 * four things DF does it with were already here: events with named participants,
 * a personality that explains them, and something that demands the player act.
 * This is the fourth and it is the one the stories actually live in.
 *
 * ── WHY MEMORIES ALONE CANNOT MAKE A STORY ───────────────────────────────────
 *
 * The yard's memories fade at SPAN and that rule is right — a bond has to be kept
 * up, and a friendship you stopped tending should cool. But it means nothing here
 * is ever REMEMBERED. Read the yard on Friday and Monday's falling-out is simply
 * gone, along with any sense that the yard has been going on without you.
 *
 * DF keeps both. A dwarf's thoughts fade; Legends keeps every notable event
 * forever, and that permanent layer is what people actually retell.
 *
 * ── ONLY CROSSINGS. NOT A SECOND LOG ─────────────────────────────────────────
 *
 * The temptation is to keep everything, which would make this a copy of the log
 * that never shrinks. What goes in is only the moment something BECAME true: the
 * hour a pair stopped being wary and started being friendly, the day a cat asked
 * to go out and you took it. Six hundred greetings are not a story. The hour two
 * cats crossed into friends is.
 *
 * That also keeps it small enough to store. A busy yard produces a handful of
 * crossings a day, not hundreds.
 *
 * ── NO PROSE HERE ────────────────────────────────────────────────────────────
 *
 * An entry carries WHAT HAPPENED and nothing else — uids, the two words a bond
 * moved between, the hour. The sentence is built where it is drawn, out of the
 * same placeholder tables as everything else, so JP's wording changes in one
 * place and old entries change with it.
 */

export type Entry =
  /** A pair's bond moved from one of `reads()`'s words to another. */
  | { at: number; what: 'bond'; a: string; b: string; from: string; to: string }
  /** A strange mood: taken out, or left unanswered when the day turned. */
  | { at: number; what: 'mood'; a: string; answered: boolean }

/**
 * HOW MANY ENTRIES ARE KEPT.
 *
 * Legends is unbounded because DF writes to disk. This is localStorage, shared
 * with the yard itself, and a chronicle that grows forever would eventually cost
 * somebody their save. Eighty is a few months of a busy yard, and it is far more
 * than anybody scrolls.
 */
const KEEP = 80

/**
 * HOW FAR PAST A THRESHOLD A BOND HAS TO BE before the crossing is believed.
 *
 * WITHOUT THIS THE CHRONICLE IS NOISE, and that was measured rather than
 * guessed. The first version recorded any change in `reads()` and produced FIFTY
 * entries in a single day, most of them the same pair going back and forth:
 *
 *   69h  Clover and Mochi        wary -> friendly
 *   71h  Clover and Mochi        friendly -> wary
 *   70h  Dandelion and Juniper   wary -> friendly
 *   71h  Dandelion and Juniper   friendly -> wary
 *
 * That is not two cats making up and falling out twice in three hours. It is one
 * bond sitting ON a threshold while its oldest memory decays, wobbling across it
 * by a point at a time — the classic noisy comparator, and this is the classic
 * fix.
 *
 * TWO, and the ceiling is four. `reads()` cuts at 13 / 5 / -9 / -19, so
 * "friendly" is only eight points wide; a margin of four would leave it no firm
 * middle at all and the word could never be recorded.
 */
const MARGIN = 2

/**
 * The word for this bond, but only if it is CLEARLY that word.
 *
 * Null while a bond is within MARGIN of either edge of its band — not "no
 * relationship", but "not settled enough to write down". The chronicle waits.
 */
function firm(y: YardState, a: string, b: string): string | null {
  const n = bond(y, a, b)
  const word = reads(n)
  if (reads(n - MARGIN) !== word || reads(n + MARGIN) !== word) return null
  return word
}

/** A pair, in a fixed order, so the same two cats always make the same key. */
export const pairKey = (a: string, b: string) => (a < b ? a + '|' + b : b + '|' + a)

/**
 * EVERY BOND WORD THAT FIRMLY CHANGED between two states.
 *
 * Called with the state either side of ONE tick, so the hour is exact rather
 * than "sometime while you were away". Each pair is compared once — `bond()` is
 * symmetric, and recording it twice would say the same thing about the same hour
 * from both sides.
 *
 * `last` is what the chronicle already says about each pair, so a bond that wanders
 * out of a band and back into the SAME one writes nothing. The caller keeps it
 * up to date as entries come out, or a long catch-up would re-record the same
 * crossing on every tick after it.
 */
export function crossings(before: YardState, after: YardState, last: Map<string, string>): Entry[] {
  const out: Entry[] = []
  const cats = after.cats

  for (let i = 0; i < cats.length; i++) {
    for (let j = i + 1; j < cats.length; j++) {
      const a = cats[i].uid, b = cats[j].uid
      /*
       * A cat that has just arrived has no "before" to have crossed FROM. Its
       * first reading is where it starts, not a change.
       */
      if (!before.cats.some(c => c.uid === a) || !before.cats.some(c => c.uid === b)) continue

      const now = firm(after, a, b)
      if (!now) continue

      const key = pairKey(a, b)
      const was = last.get(key) ?? firm(before, a, b)
      /*
       * Nothing to say when the pair was never firm about anything either — a
       * yard's opening hours are every pair drifting off zero, and none of that
       * is a story.
       */
      if (!was || was === now) { last.set(key, was ?? now); continue }

      out.push({ at: after.ticks, what: 'bond', a, b, from: was, to: now })
      last.set(key, now)
    }
  }

  return out
}

/** What the chronicle already says about each pair, for `crossings` to carry on from. */
export function lastWords(entries: Entry[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const e of entries) if (e.what === 'bond') m.set(pairKey(e.a, e.b), e.to)
  return m
}

/* ── STORAGE. localStorage, like everything else — this app has no database. ── */

const key = (yardKey: string) => `${yardKey}.chronicle`

function read(yardKey: string): Entry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(key(yardKey))
    const all = raw ? JSON.parse(raw) : []
    return Array.isArray(all) ? all : []
  } catch { return [] }
}

/** Newest first, which is the order it is read in. */
export function history(yardKey: string): Entry[] {
  return read(yardKey).slice().reverse()
}

export function record(yardKey: string, entries: Entry[]) {
  if (typeof window === 'undefined' || !entries.length) return
  const all = [...read(yardKey), ...entries]
  try {
    window.localStorage.setItem(key(yardKey), JSON.stringify(all.slice(-KEEP)))
  } catch {}
}

export function forgetHistory(yardKey: string) {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(key(yardKey)) } catch {}
}
