import type { PropKind } from './yard'

/**
 * WHAT A CAT HAS TAUGHT ITSELF, an hour at a time.
 *
 * JP: "a way to train, like, IVs... we could probably use the yard itself to
 * train their IVs as a cat can use, like, games to get a little bit smarter or go
 * on a computer or do their laundry or cook, stuff like that."
 *
 * -- WHY THESE ARE NOT IVs, AND WHY THAT IS THE BETTER VERSION ----------------
 *
 * IVs in the Pokemon sense are hidden numbers added to COMBAT stats, and this
 * game cannot hold those honestly. Two reasons, both concrete:
 *
 *   1. A cat's fight stats are rolled from its TOKEN ID and nothing else -- see
 *      `ownedCat` in lib/arena.ts, `seeded(Number(tokenId) * 2654435761)`. That
 *      is the standing rule that a typed name must not re-roll the stats, and it
 *      is what makes a cat the same cat on every device that looks at it.
 *
 *   2. There is no server holding this. Training lives in localStorage, so a
 *      number that reached a fight would be a number one player's phone made up
 *      about itself and the other player had to believe. The gauntlet is paced by
 *      the server precisely so it cannot be told what happened.
 *
 * So training is a SECOND LAYER over an unchangeable base, and it stays in the
 * yard. That keeps the rule that a run wins ART and not stat items, and it keeps
 * this cheap: nothing here has to be verified by anybody.
 *
 * -- ONE PROP, ONE DEED, ONE SKILL -------------------------------------------
 *
 * The yard already says a prop makes a deed possible: toy -> play, bowl -> share,
 * perch -> showoff, wash -> groom. A skill is the third column of that same
 * table, so nothing new has to be balanced against anything.
 *
 *   toy    the handheld, the film, the walnut     WITS
 *   bowl   the food                               COOK
 *   perch  the record, the magazine               POISE
 *   wash   the soap                               TIDY
 *
 * A cat alone with the thing gets better at the thing. Being good at it makes the
 * cat MORE LIKELY to reach for the deed it belongs to, and LESS LIKELY to make a
 * mess of it -- see `lean` and `steadier` below. Nothing else.
 *
 * -- AND IT IS A SKILL, NOT A BOND, SO IT DOES NOT FADE -----------------------
 *
 * The whole point of a bond is that it has to be kept up: memories decay and the
 * bond is only ever the sum of what is left. A skill is the opposite, and that
 * contrast is the reason to have both. You come back tomorrow because the bonds
 * cooled; you come back next month because the cat is nearly a master cook.
 *
 * Which means it is STORED, like the chronicle and the loot, and not derived.
 */

/**
 * WHAT EACH SKILL IS CALLED, and what an hour of it looks like.
 *
 * `chore` is the sentence the yard log prints; `of` names the deed the skill
 * belongs to, for the creature sheet. Placeholder prose -- JP's to replace,
 * exactly like the bond words in `reads()`.
 */
export const SKILLS: Record<PropKind, { name: string; chore: string; of: string }> = {
  toy:   { name: 'wits',  chore: 'spent the hour teaching itself something', of: 'playing' },
  bowl:  { name: 'cook',  chore: 'spent the hour learning to cook',          of: 'sharing' },
  perch: { name: 'poise', chore: 'practised until it looked easy',           of: 'showing off' },
  wash:  { name: 'tidy',  chore: 'did the washing, properly this time',      of: 'grooming' },
}

/**
 * THE FOUR, IN ORDER. Read off SKILLS rather than imported from lib/yard.ts,
 * because yard.ts imports THIS file -- a value import in both directions is a
 * runtime cycle, and `import type` is erased before it can be one.
 *
 * It cannot drift from PROPS: SKILLS is typed `Record<PropKind, ...>`, so a
 * fifth prop fails to compile here before it can go wrong anywhere else.
 */
const KINDS = Object.keys(SKILLS) as PropKind[]

const KEY = 'cradle.skills.v1'

/** Hours logged at each thing. A missing prop is an hour never spent. */
export type Skills = Partial<Record<PropKind, number>>

type Store = Record<string, Skills>

function read(): Store {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(KEY)
    const all = raw ? JSON.parse(raw) : {}
    return all && typeof all === 'object' ? all : {}
  } catch { return {} }
}

function write(all: Store) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(KEY, JSON.stringify(all)) } catch {}
}

export function skillsOf(uid: string): Skills {
  const had = read()[uid]
  if (!had) return {}
  const out: Skills = {}
  for (const p of KINDS) {
    const n = had[p]
    if (typeof n === 'number' && n > 0) out[p] = Math.floor(n)
  }
  return out
}

/**
 * Log the hours a visit produced, for every cat at once.
 *
 * One write for the whole catch-up rather than one per hour: a day away is 24
 * ticks and several cats, and each of those would otherwise be a separate
 * read-modify-write of the same key.
 */
export function train(hours: Record<string, Skills>) {
  if (!Object.keys(hours).length) return
  const all = read()
  for (const [uid, got] of Object.entries(hours)) {
    const now: Skills = { ...(all[uid] ?? {}) }
    for (const p of KINDS) {
      const add = got[p]
      if (add) now[p] = (now[p] ?? 0) + add
    }
    all[uid] = now
  }
  write(all)
}

/* -- THE LADDER ------------------------------------------------------------ */

/**
 * HOURS NEEDED FOR EACH RUNG, and the gaps widen sharply on purpose.
 *
 * ── MEASURED, AND THE FIRST GUESS WAS WRONG BY SIX TIMES ─────────────────────
 *
 * These were [1, 3, 6, 10, 15, 21, 28, 36, 45], written off an estimate that a
 * cat would do about three quarters of an hour a day at each prop. The rate is
 * right; what the estimate missed is that a visit banks up to 24 hours at once
 * and the ladder is climbed EVERY DAY.
 *
 * Measured over 60 yards of 6 cats, all four props out:
 *
 *   one month     median `proficient`, 2-3% already at the top
 *   three months  87% of every cat at the top of every skill
 *
 * A ladder that everybody finishes in a season is not a ladder — it is a loading
 * bar. Worse with one prop out, where 96% were at the top inside a MONTH.
 *
 * ── WHAT THESE ARE FITTED TO ─────────────────────────────────────────────────
 *
 * The measured rate is 0.8 chore-hours a day at each prop with all four out, and
 * four times that with one. So, visiting daily:
 *
 *   ALL FOUR OUT     `adequate` in a month, `skilled` at three, the top in a year
 *   ONE THING OUT    `adequate` in a week, `skilled` in three, the top in a season
 *
 * SPECIALISING IS THE FAST PATH, and it now costs something real: a yard with one
 * thing in it can only do one deed. That is the trade the furniture menu is for.
 *
 * The bottom is deliberately close together — three days to the first rung, so
 * something is visibly moving in the first week — and the top is deliberately far
 * away, because the top rung is the one that is supposed to be worth having.
 */
const RUNGS = [2, 8, 20, 40, 70, 110, 165, 220, 288]

/**
 * PLACEHOLDER WORDS -- Dwarf Fortress's own ladder, and JP's to replace, exactly
 * like the bond words in `reads()`. Nothing here should put prose in his game.
 */
const RANKS = [
  'untrained', 'dabbling', 'novice', 'adequate', 'competent',
  'skilled', 'proficient', 'talented', 'expert', 'master',
]

/** How far up the ladder, 0 (never tried) to RUNGS.length. */
export function rank(hours = 0): number {
  let n = 0
  for (const need of RUNGS) if (hours >= need) n++
  return n
}

export const TOP = RUNGS.length

/** How that rank reads. See RANKS -- placeholder prose. */
export const rankReads = (n: number) => RANKS[Math.max(0, Math.min(RANKS.length - 1, n))]

/** Hours still to go before the next rung, or null at the top. */
export function toNext(hours = 0): number | null {
  for (const need of RUNGS) if (hours < need) return need - hours
  return null
}

/* -- WHAT BEING GOOD AT SOMETHING DOES ------------------------------------- */

/**
 * HOW MUCH A SKILL LEANS A CAT TOWARD ITS OWN DEED. It NEVER gates one.
 *
 * The yard's rule is that history gates and everything else only leans, and a
 * skill is emphatically an "everything else": a cat that has never cooked can
 * still share, it just reaches for it less often than the one who has.
 *
 * 0.30 at the top of the ladder is deliberately small next to the random term,
 * which is `r() * (0.5 + act * 3)` and spans 1.1 to 2.75. A master cook is a cat
 * that shares NOTICEABLY more, not a cat that only ever shares.
 */
export const LEAN = 0.30

export const lean = (hours = 0) => (rank(hours) / TOP) * LEAN

/**
 * AND HOW MUCH LESS OFTEN IT GETS IT WRONG.
 *
 * A clumsy cat means well and knocks the bowl over -- `t.clumsy` in lib/yard.ts.
 * Practice is the answer to exactly that, and it is the effect worth having: it
 * cannot inflate a bond, because all it does is stop a kind deed turning into an
 * unkind one. The ceiling of what a cat can do is untouched; the floor rises.
 *
 * At the top rung it reaches zero. Forty five hours at one chore is a season of
 * visits, and a cat that has put that in has earned not dropping the bowl.
 */
export const steadier = (clumsy: number, hours = 0) => clumsy * (1 - rank(hours) / TOP)
