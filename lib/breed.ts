import type { Resident } from './yard'

/**
 * WHERE KITTENS COME FROM.
 *
 * JP, 2026-09-10: "web app and game will have breeding."
 *
 * -- THE ONE RULE THIS HAD TO NOT BREAK -------------------------------------
 *
 * A cat's fight stats are a pure function of its id and nothing else:
 *
 *   ownedCat(tokenId)  ->  seeded(Number(tokenId) * 2654435761)  ->  hp, atk, def, spd
 *
 * That is what makes a cat the same cat on every device that looks at it, and it
 * is the standing rule that a typed name must not re-roll the stats.
 *
 * So a kitten cannot simply be handed stats — the moment stats are STORED rather
 * than derived they can be edited, and "your cat is your save file" stops being
 * true. But a kitten whose id is random is not descended from anything either:
 * breed your two best fighters, get a stranger.
 *
 * THE WAY OUT IS TO DERIVE THE ID FROM THE PARENTS. A kitten's seed is a hash of
 * the pair and its birth order, so:
 *
 *   - stats are still a pure function of the seed. Nothing is stored, nothing
 *     can be edited, and the rule is untouched.
 *   - the seed is a fact about the parents, so the kitten really is theirs.
 *   - the same two cats always produce the same first kitten, the same second,
 *     and so on. A pairing is a DISCOVERY rather than a slot machine: you can
 *     hunt for a good one and tell somebody else about it.
 *
 * -- LOOKS INHERIT. ABILITY IS FAMILY LUCK. ---------------------------------
 *
 * Each of the three layers comes from one parent or the other, so every trait a
 * kitten has is visibly its mother's or its father's. Nothing is invented and
 * there are no mutations, which keeps this honest: if you see a face on a kitten,
 * one of the two cats in front of you has it.
 *
 * NEW TRAITS STILL REACH THE POPULATION, just not here. A won cat is drawn from
 * the CURRENT layer pool (see lib/mycats.ts), so a face added in an update
 * arrives on the next cat somebody wins and spreads from there by breeding. That
 * is the right way round: breeding shuffles what exists, winning introduces.
 *
 * It also lands on the right side of the standing rule that a prize is ART and
 * not a stat item. Breeding gives you a cat that LOOKS like its parents; how
 * good it is was decided by the hash.
 *
 * -- AND IT COSTS NOTHING ---------------------------------------------------
 *
 * JP: "I don't think it needs to cost anything. I just want it to be more open."
 *
 * No fee, no token, no resource. The only condition is that the two cats
 * actually like each other, which is not a cost — it is the yard doing the thing
 * the yard is for. See BOND_TO_BREED.
 */

/**
 * HOW WARM A PAIR HAS TO BE. 5 is `friendly` in `reads()`.
 *
 * Measured across 1440 yards at six ages, 22.5% of pairs read friendly at any
 * moment and 1.3% read inseparable. Friendly is the right gate: common enough
 * that a furnished yard produces one within a few days, rare enough that it is
 * something that HAPPENED rather than a button that was always lit.
 *
 * Requiring inseparable would have made breeding a 1-in-70 event, which is a
 * mechanic nobody would ever see.
 *
 * THE YARD IS THE ONLY WAY TO MOVE THIS. Bonds come from deeds, deeds need
 * furniture, and a bond cools if you stay away — so breeding is downstream of
 * everything else in the yard, which is exactly where it belongs.
 */
export const BOND_TO_BREED = 5

export const canBreed = (bond: number) => bond >= BOND_TO_BREED

/** The three drawn layers, which are the whole of what a kitten inherits. */
export type Look = { face: string | null; bg: string | null; coat: string | null }

export type Kitten = Look & {
  /** Its id. Stats derive from this, exactly as they do from a token id. */
  seed: number
  /** Who it came from, so a family tree can be read back. */
  parents: [string, string]
  /** Which child of this pair it is, counting from 1. */
  order: number
}

/**
 * A stable number for a string. FNV-1a WITH a finaliser.
 *
 * The finaliser is not decoration. Plain FNV-1a leaves the low bits barely
 * mixed, and this codebase has already been bitten by exactly that: a hash
 * without one gave sixty days of identical yards. Two cat ids differing in one
 * character must give kittens that are not near-identical.
 */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  // murmur3 finaliser
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** The same xorshift the yard and the arena run on. */
function rng(seed: number) {
  let s = seed | 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

/**
 * THE SEED FOR THE nth KITTEN OF A PAIR.
 *
 * SORTED FIRST, so A with B and B with A are the same pairing. Without that,
 * which cat the player happened to tap first would decide what the kitten was —
 * a fact about the interface leaking into the animal.
 */
export function kittenSeed(a: string, b: string, order: number): number {
  const [x, y] = a <= b ? [a, b] : [b, a]
  return hash(`${x}|${y}|${order}`)
}

/**
 * What two cats have, and which number child this is. Deterministic.
 *
 * `order` counts from 1 and must be the number of children this pair ALREADY
 * has, plus one — otherwise a pair would keep producing its first kitten.
 */
export function childOf(a: Resident, b: Resident, order: number): Kitten {
  const seed = kittenSeed(a.uid, b.uid, order)
  const r = rng(seed)

  /*
   * ONE COIN PER LAYER, and the parent that loses the coin still gave the cat
   * its other traits. A kitten that took everything from one side would look
   * like a copy of that parent rather than like a child of both, and with three
   * layers that happens one time in four — often enough to notice, which is why
   * the coins are drawn separately rather than once for the whole cat.
   */
  return {
    seed,
    face: (r() < 0.5 ? a : b).face ?? null,
    bg:   (r() < 0.5 ? a : b).bg   ?? null,
    coat: (r() < 0.5 ? a : b).coat ?? null,
    parents: [a.uid, b.uid],
    order,
  }
}

/**
 * The picture of a cat described by its traits rather than by a seed.
 *
 * A won cat is `?seed=N`, because a seed is what drew it. A kitten was never
 * drawn from a seed — its layers were inherited one at a time — so it has to ask
 * for those three layers by name. See /api/cat-art.
 */
export function artFor(look: Look): string {
  const q = new URLSearchParams()
  if (look.bg) q.set('bg', look.bg)
  if (look.coat) q.set('body', look.coat)
  if (look.face) q.set('face', look.face)
  return `/api/cat-art?${q.toString()}`
}
