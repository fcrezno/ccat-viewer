import { PROPS, type PropKind } from './yard'
import { ITEMS } from './items'

/**
 * WHAT A CAT HAS WON, AND WHAT IT IS CARRYING.
 *
 * JP: "give it like a item bag; but it can only hold one; think like badges in
 * pokemon. a cats worth is by the loot they have."
 *
 * Two different things, and keeping them apart is the whole design:
 *
 *   THE BAG    everything this cat has ever won. Permanent, never spent, only
 *              added to. It is the cat's RECORD — the badge case. Nothing about
 *              it changes what the cat does.
 *
 *   HELD       one item out of the bag, carried. This is the one that does
 *              something, and it is one at a time because that makes giving it a
 *              DECISION rather than inventory management.
 *
 * So worth and effect are separated. A cat with nine items in its bag is worth
 * more than a cat with one, and it is no stronger in the yard for it.
 *
 * ── WHAT A HELD ITEM ACTUALLY DOES ───────────────────────────────────────────
 *
 * Every item is a skin over one of the four props (lib/items.ts), and a prop is
 * what makes one deed possible: toy → play, bowl → share, perch → showoff,
 * wash → groom. Furniture is what is out for EVERYONE; a held item is this cat's
 * own, so it can still play in a bare yard.
 *
 * See `choose` in lib/yard.ts — the gate is
 * `props.includes(wants) || holds === wants`, and that is the entire mechanic.
 *
 * ── IT NEVER TOUCHES A FIGHT. THIS IS THE LINE. ──────────────────────────────
 *
 * The standing rule is that a run unlocks ART — faces, skins, colours — not stat
 * items, because stat items break parity in a fight. A held item changes what
 * cats do WITH EACH OTHER in the yard and nothing else. The moment one alters a
 * fight it is a stat item and that rule is gone.
 *
 * ── localStorage, LIKE EVERYTHING ELSE ───────────────────────────────────────
 *
 * This app has no database. A bag lives on the device that won it, which is the
 * same deal the guest cat, the yard and the chronicle already run on.
 */

const KEY = 'cradle.loot.v1'

/** One cat's loot. `holds` is a FILE NAME from lib/items.ts, or null. */
export type Loot = {
  /** Item file names, in the order they were won. */
  bag: string[]
  /** Which of them is being carried, if any. */
  holds: string | null
}

const EMPTY: Loot = { bag: [], holds: null }

type Store = Record<string, Loot>

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

export function lootOf(uid: string): Loot {
  const had = read()[uid]
  if (!had) return EMPTY
  return {
    bag: Array.isArray(had.bag) ? had.bag : [],
    holds: typeof had.holds === 'string' ? had.holds : null,
  }
}

/**
 * Put an item in a cat's bag.
 *
 * A DUPLICATE IS NOT ADDED TWICE. The bag is a record of what this cat has, not
 * a count of how often it won it — badges do not stack. Winning one you already
 * have is a miss, and the prize screen is what should stop that being common.
 *
 * The first item a cat ever wins is picked up automatically: a bag with one
 * thing in it and nothing held is a decision nobody would enjoy making.
 */
export function win(uid: string, file: string): Loot {
  const all = read()
  const now = all[uid] ?? { bag: [], holds: null }
  if (!now.bag.includes(file)) now.bag = [...now.bag, file]
  if (!now.holds) now.holds = file
  all[uid] = now
  write(all)
  return now
}

/** Carry one of the cat's own items, or nothing. Refuses what is not in the bag. */
export function hold(uid: string, file: string | null): Loot {
  const all = read()
  const now = all[uid] ?? { bag: [], holds: null }
  if (file === null || now.bag.includes(file)) now.holds = file
  all[uid] = now
  write(all)
  return now
}

/* ── reading an item back ─────────────────────────────────────────────────── */

/** Every item, flattened, with the prop each one stands for. */
const BY_FILE = new Map<string, { file: string; label: string; prop: PropKind }>()
for (const prop of PROPS) {
  for (const it of ITEMS[prop]) BY_FILE.set(it.file, { ...it, prop })
}

export const itemByFile = (file: string) => BY_FILE.get(file) ?? null

/**
 * WHICH PROP THIS CAT IS CARRYING, which is all the simulation needs to know.
 *
 * The sim has no idea what a "feather" is and should not: it deals in four
 * mechanics. This is the whole of the translation between the loot and the yard.
 */
export function holdsProp(uid: string): PropKind | null {
  const f = lootOf(uid).holds
  return f ? (BY_FILE.get(f)?.prop ?? null) : null
}

/** Every item there is, for a prize screen to draw from. */
export const ALL_ITEMS = [...BY_FILE.values()]
