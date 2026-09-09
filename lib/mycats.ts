import type { Resident } from './yard'
import { myCats, localUid, nameFor } from './stable'

/**
 * THE CATS YOU OWN, AS THEY LOOKED THE DAY YOU WON THEM.
 *
 * JP, 2026-09-09: "we can prob just have people have the same type of cats just
 * change the name; and then for updates i just add traits."
 *
 * Both halves of that work, and the second half needed this file to be safe.
 *
 * -- SAME CATS, DIFFERENT NAMES ----------------------------------------------
 *
 * There is no separate art set for the app. A local cat is composed from the
 * SAME `layers/` the collection is drawn from, so it is the same kind of animal
 * with the same faces and the same rarities. What makes one yours is its name,
 * and `nameFor` already lets you change it — applied here so a renamed cat is
 * renamed everywhere, exactly as a token cat's name is.
 *
 * -- AND WHY ADDING A TRAIT WOULD HAVE RUINED EVERY EXISTING CAT --------------
 *
 * MEASURED over 5000 cats, before this existed:
 *
 *   add ONE face (10 -> 11)        49.4% of existing cats got a different face
 *   add ONE background (23 -> 24)  51.6% got a different background
 *
 * That is not a rounding error, it is half the population. `weighted()` walks a
 * cumulative total, so growing the list moves every boundary after the insert
 * point: the same seed lands somewhere else. Ship an update that adds a face and
 * half the players open the app to a cat that is not the one they had.
 *
 * A SEED IS NOT AN IDENTITY, THEN. THE RESOLVED CAT IS.
 *
 * So the first time a cat is looked up, what it turned out to be is written
 * down, and that is what it is from then on. Adding traits afterwards can only
 * affect cats that have not been drawn yet — which is exactly the update JP
 * wants: new cats get the new faces, and nobody's existing cat changes.
 *
 * It also means the server is asked once per cat, ever.
 */

const LOOKS = 'cradle.looks.v1'

/** What was written down for a cat. The three traits, its art, and its given name. */
type Look = Pick<Resident, 'uid' | 'name' | 'face' | 'bg' | 'coat' | 'art'>

type Store = Record<string, Look>

function read(): Store {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(LOOKS)
    const all = raw ? JSON.parse(raw) : {}
    return all && typeof all === 'object' ? all : {}
  } catch { return {} }
}

function write(all: Store) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(LOOKS, JSON.stringify(all)) } catch {}
}

/**
 * Turn seeds into cats, asking the server only about ones never seen before.
 *
 * THE NAME IS APPLIED LAST, over whatever was written down. A look is settled
 * once and never revisited; a name is the one thing about a cat that is meant to
 * change, so it is read fresh every time rather than baked into the record.
 */
export async function resolveCats(seeds: number[]): Promise<Resident[]> {
  const known = read()
  const missing = seeds.filter(n => !known[localUid(n)])

  if (missing.length) {
    try {
      const r = await fetch(`/api/stable?seeds=${missing.join(',')}`)
      const d = await r.json()
      for (const got of (d?.residents ?? []) as Look[]) {
        if (got?.uid) known[got.uid] = got
      }
      write(known)
    } catch {
      /*
       * OFFLINE, OR THE SERVER IS DOWN. Cats already written down still show;
       * ones never seen are left out rather than invented, because inventing one
       * would write the wrong cat down permanently the moment it was cached.
       */
    }
  }

  return seeds
    .map(n => known[localUid(n)])
    .filter(Boolean)
    .map(c => ({ ...c, name: nameFor(c.uid) ?? c.name, owner: null }))
}

/** Every cat this device holds, resolved. The yard's whole population in the app build. */
export const myRoster = () => resolveCats(myCats())

/**
 * Forget what a cat looked like, so it is drawn again from the current layers.
 *
 * Not used by the game — a cat's look is meant to be permanent. It exists for
 * the case where the art itself was wrong and a cat should be re-drawn, which is
 * a decision somebody makes on purpose rather than a thing that happens.
 */
export function forgetLook(uid: string) {
  const all = read()
  delete all[uid]
  write(all)
}
