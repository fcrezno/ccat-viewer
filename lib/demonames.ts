/**
 * NAMES FOR THE DEMO YARD'S CATS.
 *
 * ── PLACEHOLDER PROSE. THESE ARE JP'S TO REPLACE. ────────────────────────────
 *
 * The same standing rule the rest of the yard is written under: `reads()`
 * returns placeholder bond words, `TOGETHER` placeholder headlines, `PROP_WHY`
 * placeholder furniture copy. None of it is meant to end up in the game as
 * written. Swap the list below and everything downstream follows.
 *
 * ── WHY THE DEMO YARD NEEDS THEM AND A REAL YARD DOES NOT ────────────────────
 *
 * A Clanker Cat has no name of its own to show. Checked against the live
 * metadata rather than assumed:
 *
 *   V2 token 346  ->  "Clanker Cats V2 #346"   the number, said twice
 *   V1 token 1    ->  "Clanker Cats #46"       a DIFFERENT number
 *   V1 token 42   ->  "Clanker Cats #16"       and again
 *
 * So V2's metadata name carries nothing the id does not, and V1's would print
 * the WRONG number on a cat. A name the player typed themselves lives in
 * `lib/stable.ts`, in their own localStorage — this app has no database, so
 * nobody else can ever read it.
 *
 * In a real yard the number is the honest label, and JP's rule for an unclaimed
 * cat has always been the number and nothing else: those cats belong to people
 * you follow, and the yard says whose they are. The demo yard is strangers' cats
 * shown to a stranger with no owner to name, and there "#346 and #140 are not
 * speaking" reads like a ledger rather than like a yard.
 *
 * ── THE LIST DECIDES EVERYTHING. LENGTH INCLUDED. ────────────────────────────
 *
 * Nothing below assumes how many names there are. A longer list means fewer cats
 * get shifted off the name their own id picked (see `cast`); a shorter one still
 * works. Paste twelve or paste five hundred.
 */
export const DEMO_NAMES: string[] = [
  'Biscuit', 'Marmalade', 'Pepper', 'Mochi', 'Waffles', 'Olive',
  'Domino', 'Tuna', 'Clover', 'Sable', 'Pumpkin', 'Noodle',
  'Ash', 'Juniper', 'Bramble', 'Poppy', 'Wren', 'Tabby',
  'Sesame', 'Winter', 'Cricket', 'Fig', 'Rusty', 'Willow',
  'Cinder', 'Maple', 'Pickle', 'Otto', 'Nutmeg', 'Bean',
  'Thistle', 'Comet', 'Saffron', 'Boots', 'Hazel', 'Mittens',
  'Cobweb', 'Sorrel', 'Pebble', 'Dandelion',
]

/**
 * FNV-1a over the uid.
 *
 * Any stable hash would do; this one is four lines and has no dependencies. The
 * property that matters is that it is a pure function of the STRING — the same
 * cat gets the same name on every machine, on every request, forever.
 */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * The name this cat carries, on its own.
 *
 * KEYED ON THE UID, never on its place in the cast. The demo cast rotates every
 * ten minutes and pulls a different eight holders each time; a cat that comes
 * back has to come back as ITSELF, or the yard is a slideshow of strangers
 * rather than a place with regulars in it.
 */
export function demoName(uid: string): string {
  if (!DEMO_NAMES.length) return uid.split(':')[1] ? `#${uid.split(':')[1]}` : uid
  return DEMO_NAMES[hash(uid) % DEMO_NAMES.length]
}

/**
 * Every name in one cast, with collisions moved along rather than given up on.
 *
 * A list shorter than the collection cannot promise that two cats never WANT the
 * same name, and printing "Marmalade and Marmalade are not speaking" is worse
 * than printing a number. The first version therefore sent the loser back to its
 * id — and measured over 20000 casts of eight, that put a bare number in the
 * yard 52% of the time. Half the casts had one cat wearing a token id next to
 * seven cats with names, which reads as a bug rather than as a fallback.
 *
 * So a collision walks forward through the list to the next free name instead.
 * Nobody is ever nameless, and nothing but the colliding cat is affected.
 *
 * Measured over the same 20000 casts, with the 40 names above: no cast shows a
 * number, no cast shows one name twice, and 91.4% of cats wear the name their
 * own uid picked. The other one in twelve is standing next to somebody who got
 * there first.
 *
 * The walk starts from the hash and wraps, so it is decided by the cast's order
 * rather than by whichever request happened to arrive first.
 *
 * THE NUMBER IS STILL THE LAST RESORT, for the one case where it is the truth:
 * a list shorter than the cast has no free name left to walk to.
 */
export function cast(uids: string[]): Map<string, string> {
  const out = new Map<string, string>()
  const used = new Set<string>()
  const L = DEMO_NAMES.length

  for (const uid of uids) {
    let got: string | null = null

    for (let step = 0; step < L; step++) {
      const tryThis = DEMO_NAMES[(hash(uid) + step) % L]
      if (!used.has(tryThis)) { got = tryThis; break }
    }

    if (got) { used.add(got); out.set(uid, got) }
    else out.set(uid, `#${uid.split(':')[1] ?? uid}`)
  }

  return out
}
