/**
 * THE YARD, PETITE — what your cats got up to while you were out.
 *
 * A small version of `Code/Social.cs` from the s&box build. THAT ONE IS THE FULL
 * REALISATION and this is deliberately less: the desktop game keeps the props,
 * the tuned temperaments and the affinity that decides who clashes. This gives a
 * phone the part that matters — you come back and something happened.
 *
 * ── WHAT IS LEFT OUT, AND WHY ────────────────────────────────────────────────
 *
 * NO TYPE CHART. The full yard's `Affinity()` subtracts 3 when one cat's element
 * beats the other's, and that reads `Combat.Types[].Strong` — the strength table
 * that `data/combat.json` holds and that never leaves that repository. THIS REPO
 * IS PUBLIC. Porting affinity as written would publish the chart, so the rivalry
 * term is simply not here.
 *
 * NO TUNED TEMPERAMENTS EITHER. The game's faces carry measured `random`,
 * `fumble` and `power` values, and those are balance data from the same file. The
 * LABEL is not: every V2 cat wears its Face in public metadata, exactly as move
 * NAMES crossed over to lib/moves.ts while their power and accuracy stayed home.
 * So the labels come across and the numbers below are this version's own.
 *
 * NO PROPS. A toy, a bowl and a perch are what make the desktop playground a
 * choice. A phone has nowhere to put them.
 *
 * ── WHAT IS KEPT, BECAUSE IT IS THE POINT ────────────────────────────────────
 *
 * MEMORIES FADE AND A BOND IS DERIVED FROM WHAT IS LEFT. Never stored as a
 * running total — the s&box build measured that fault: a total hit the cap after
 * 27 ticks and every pair ended up inseparable, so the history stopped meaning
 * anything. A bond has to be kept up, and it cools while you are away. That is
 * the reason to come back tomorrow, and it is the Dwarf Fortress shape: thoughts
 * fade, and a relationship is what remains.
 *
 * DETERMINISTIC. Each cat draws from a stream seeded by the yard, the tick and
 * its place in the line, so adding a cat cannot change what earlier cats did and
 * a visit replays exactly. Nothing runs in the background: being away N ticks IS
 * calling `tick()` N times on return.
 */

/** One thing that happened, and how much it moved the pair. */
export type Memory = {
  tick: number
  a: string
  b: string
  kind: DeedKind
  delta: number
}

export type DeedKind = 'greet' | 'play' | 'groom' | 'showoff' | 'share' | 'snub' | 'squabble'

/**
 * FURNITURE. It is MECHANICAL, not scenery — this is the rule the full build
 * measured and it is why the yard is worth furnishing at all.
 *
 * A toy, a bowl and a perch each make one deed POSSIBLE. Take the toy away and
 * cats stop playing; the desktop measured 8 play events with it and 0 without.
 * Scenery that only decorated would make furnishing a menu rather than a choice.
 *
 * `share` comes back with the bowl. It was dropped from the petite yard along
 * with the props, for the stated reason that "a phone has nowhere to put them" —
 * which was true of a wall of text and is not true of a map.
 *
 * `wash` IS NEW, AND IT IS THE ONE THE RULE WAS MISSING.
 *
 * `groom` was the only deed with nothing standing behind it: it was gated on
 * warmth alone, so the warmest thing two cats can do for each other was the one
 * thing the player had no say in. Measured over 400 ticks with the other three
 * out, groom fired 56 times; with nothing out it fired 0, because bonds never
 * got warm enough to reach its gate. It was already ANSWERING to the furniture
 * without ever being ABOUT it.
 *
 * So it gets a thing of its own. The gate at 10 stays exactly where it was
 * measured — soap decides whether grooming is on the table at all, and warmth
 * still decides whether it happens.
 */
export type PropKind = 'toy' | 'bowl' | 'perch' | 'wash'

export const PROPS: PropKind[] = ['toy', 'bowl', 'perch', 'wash']

/** What each deed needs standing in the yard before it can happen at all. */
export const NEEDS: Partial<Record<DeedKind, PropKind>> = {
  play:    'toy',
  share:   'bowl',
  showoff: 'perch',
  groom:   'wash',
}

export type Deed = {
  kind: DeedKind
  delta: number
  /** The bond this deed needs before it is even possible. */
  need: number
}

export const BOND_MIN = -100
export const BOND_MAX = 100

/**
 * HOW LONG A MEMORY LASTS, in ticks. 24, as the full build measured.
 *
 * Two cats act about once a tick between them, so a bond settles near its rate
 * times half the Span rather than climbing forever. At 40 a squabbling pair
 * still reached the floor and stayed pinned there.
 */
export const SPAN = 24

/**
 * SMALL DELTAS, ON PURPOSE. Doubled, a squabbling pair reached the floor and the
 * relationship had nowhere left to go.
 *
 * `play` reaches from well below zero — two cats who have fallen out can still
 * be brought back together by playing. `groom` needs real warmth first: you do
 * not groom a cat you have just met.
 */
export const DEEDS: Deed[] = [
  { kind: 'greet',    delta:  1, need:  -40 },
  { kind: 'play',     delta:  3, need:  -70 },
  /*
   * GROOM'S GATE IS 10, NOT 30, AND THAT IS MEASURED.
   *
   * At 30 it fired twice in four hundred ticks. Not because grooming should be
   * rare — because a bond simply does not reach 30. Sampled over 9600 readings
   * the range is -29 to +18 with a median of -3, so a gate at 30 was outside the
   * scale the simulation actually produces.
   *
   * It still needs real warmth: 10 sits inside the top tenth of bonds, so you
   * still do not groom a cat you have just met. It is now reachable by a pair who
   * have been getting on, which is what the rule was always for.
   */
  { kind: 'groom',    delta:  4, need:   10 },
  { kind: 'showoff',  delta:  2, need:  -20 },
  { kind: 'share',    delta:  2, need:  -70 },
  { kind: 'snub',     delta: -2, need:  -60 },
  { kind: 'squabble', delta: -4, need: -100 },
]

/**
 * A TEMPERAMENT, keyed by the Face every cat wears in its public metadata.
 *
 * `act` is how often it does anything at all, `clumsy` how often a kind deed
 * comes out wrong, `bold` how far it leans toward showing off and squabbling
 * rather than greeting and grooming.
 *
 * These are THIS VERSION'S numbers, ordered to match the labels the game uses —
 * focused is the steadiest, erratic the least. The desktop's measured values stay
 * with the desktop.
 */
const TEMPERS: Record<string, { act: number; clumsy: number; bold: number; label: string }> = {
  Korin:    { act: 0.20, clumsy: 0.00, bold: 0.30, label: 'focused' },
  Frekcles: { act: 0.35, clumsy: 0.00, bold: 0.45, label: 'plucky' },
  chupa:    { act: 0.40, clumsy: 0.02, bold: 0.55, label: 'hungry' },
  hehe:     { act: 0.40, clumsy: 0.00, bold: 0.70, label: 'smug' },
  uwu:      { act: 0.45, clumsy: 0.02, bold: 0.20, label: 'sweet' },
  whyy:     { act: 0.45, clumsy: 0.08, bold: 0.25, label: 'defeatist' },
  'Wont u': { act: 0.50, clumsy: 0.04, bold: 0.35, label: 'pleading' },
  Aliem:    { act: 0.50, clumsy: 0.02, bold: 0.65, label: 'alien' },
  huh:      { act: 0.60, clumsy: 0.12, bold: 0.45, label: 'confused' },
  silly:    { act: 0.75, clumsy: 0.06, bold: 0.60, label: 'erratic' },
}

const PLAIN = { act: 0.35, clumsy: 0.02, bold: 0.45, label: 'plain' }

export const temperOf = (face?: string | null) =>
  (face && TEMPERS[face]) || PLAIN

/**
 * xorshift, matching the s&box build's Rng exactly.
 *
 * Its own comment there says `_s ^= (uint)((int)_s >> 17); // signed, as
 * JavaScript does it` — the C# goes out of its way to reproduce JavaScript's
 * ARITHMETIC shift. Coming back the other way is therefore free: JS bitwise
 * operators are already int32 and already signed. Only the final read is
 * reinterpreted as unsigned.
 */
function rng(seed: number) {
  let s = seed | 0
  return () => {
    s ^= s << 13
    s ^= s >> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

/**
 * A BOND NEEDS AN ADOPTED CAT. THIS IS THE RULE, NOT A SIDE EFFECT.
 *
 * A guest cat is a number on one phone. It can fight, it can win, it can be
 * named — but it is not held by anybody, so there is nothing for a relationship
 * to be anchored to. Two people can be sitting on the same guest id; a bond
 * between cats that are not owned is a bond between nobody.
 *
 * So the yard admits ADOPTED cats only. That is deliberate and it is the point of
 * adopting: winning a cat does not only hand over a token, it opens the half of
 * the game where the cats have a history with each other. A guest is shown the
 * yard and told what it is for.
 *
 * Enforced HERE rather than at the call site, because a call site can forget.
 */
export const adopted = (uid: string) => !!uid && !uid.startsWith('guest:')

/**
 * One cat standing in the yard.
 *
 * `art` is carried here rather than looked up per render because the map draws
 * every resident as its own portrait, and /api/yard already knows the URL — the
 * alternative is the viewer rebuilding it from a uid and the two disagreeing the
 * first time a collection changes where its images live.
 */
export type Resident = {
  uid: string
  name: string
  face?: string | null
  art?: string | null
  /**
   * WHOSE IT IS, when that is known.
   *
   * /api/yard resolves it for a cat reached through the follow graph and
   * leaves it null for a demo one, where the holding address is known and the
   * Farcaster account behind it is not.
   */
  owner?: { fid: number; username: string; pfp: string | null } | null
  /** A cat in the demo yard: minted and owned, but not through anyone follows. */
  demo?: boolean
  /**
   * THE `Background` TRAIT, which is what its name is printed in.
   *
   * Carried on the resident rather than looked up, for the same reason `face`
   * is: the metadata fetch happens once in the API, and every surface that draws
   * a cat is downstream of the saved yard. See lib/catink.ts.
   */
  bg?: string | null
  /**
   * THE `Body Color` TRAIT — the cat's coat, in the words of its own metadata.
   *
   * Here for the creature sheet's description and nothing else. The values are
   * names rather than colours ("dore", "King of the jungle"), so this is read as
   * prose, never as a colour. `bg` is the one that becomes ink.
   */
  coat?: string | null
}

export type YardState = {
  seed: number
  ticks: number
  cats: Resident[]
  /** Guest cats that asked to come in. They cannot bond; see `adopted`. */
  turnedAway: number
  /** What is standing in the yard. See `NEEDS` — this decides what can happen. */
  props: PropKind[]
  /** Everything anyone still remembers, oldest first. */
  kept: Memory[]
}

/**
 * Open a yard. Guests are turned away at the gate and counted, so the page can
 * say WHY it is empty rather than showing an empty pen with no explanation.
 *
 * A yard also needs two cats to be a yard at all — one cat has nobody to have a
 * history with — so `waiting` is the honest answer to "where is everybody".
 */
export function open(seed: number, cats: Resident[], props: PropKind[] = []): YardState {
  const let_in = cats.filter(c => adopted(c.uid))
  return {
    seed: seed | 0,
    ticks: 0,
    cats: let_in,
    turnedAway: cats.length - let_in.length,
    /*
     * AN EMPTY YARD IS THE DEFAULT, and that is the point. A yard with nothing in
     * it can only greet, groom, snub and squabble — the cats have no reason to do
     * anything together until somebody puts something there.
     */
    props: PROPS.filter(p => props.includes(p)),
    kept: [],
  }
}

/** Whether anything can happen here yet. Two adopted cats is the floor. */
export const waiting = (y: YardState) => y.cats.length < 2

const same = (m: Memory, a: string, b: string) =>
  (m.a === a && m.b === b) || (m.a === b && m.b === a)

/** How strongly a memory still counts. 1 when new, 0 when forgotten. */
export const weight = (m: Memory, ticks: number) =>
  Math.max(0, 1 - (ticks - m.tick) / SPAN)

/**
 * A bond is the SUM OF WHAT IS STILL REMEMBERED, never a stored total — two
 * sources of truth and the stored one wins silently.
 *
 * Symmetric on purpose: one number per PAIR, so "A likes B" cannot drift away
 * from "B likes A".
 */
export function bond(y: YardState, a: string, b: string): number {
  let sum = 0
  for (const m of y.kept) if (same(m, a, b)) sum += m.delta * weight(m, y.ticks)
  return Math.max(BOND_MIN, Math.min(BOND_MAX, Math.round(sum)))
}

/**
 * WHAT THEY HAVE IN COMMON, before they have any history — the petite half.
 *
 * The full build also subtracts for a type rivalry, which is what turns
 * proximity into a grudge. That term reads the strength table and cannot live in
 * a public repository, so here two cats only ever have things IN common. Bonds
 * skew warmer than the desktop's, and that is the honest shape of the trade.
 */
export function affinity(a: Resident, b: Resident): number {
  return a.face && a.face === b.face ? 2 : 0
}

/** Which deed a cat reaches for. History gates; the rest only leans. */
function choose(
  t: ReturnType<typeof temperOf>,
  b: number,
  aff: number,
  props: PropKind[],
  r: () => number,
): Deed | null {
  /*
   * HISTORY GATES, VALUES ONLY LEAN. Folding affinity into what is POSSIBLE let
   * one bad matchup lock out every warm deed from the first tick. A rivalry may
   * make a row likely; it must never make friendship impossible.
   *
   * FURNITURE GATES THE SAME WAY, and only the deed that needs it. No toy means
   * no play; it does not make a cat quieter in general, it removes one thing it
   * could have done. That is what makes furnishing the yard a real choice rather
   * than a difficulty setting.
   */
  const open = DEEDS.filter(d => {
    if (b < d.need) return false
    const wants = NEEDS[d.kind]
    return !wants || props.includes(wants)
  })
  if (!open.length) return null

  let best: Deed | null = null
  let bestScore = -Infinity
  for (const d of open) {
    const warm = d.delta > 0
    let score = warm ? 1 - t.bold : t.bold
    // A warm history makes warmth likelier, and /120 rather than /60: at 60 a
    // negative bond made a squabble likelier, which made the bond worse, and it
    // latched at the floor.
    score += (warm ? b : -b) / 120
    score += (warm ? aff : -aff) * 0.1
    score += r() * (0.5 + t.act * 3)
    if (score > bestScore) { bestScore = score; best = d }
  }
  return best
}

/**
 * One tick of yard life. Returns what happened, and folds it into the state.
 *
 * Forgotten memories are DROPPED here rather than left to accumulate: if it is
 * no longer remembered it no longer counts, and there is nowhere else holding a
 * total that could disagree.
 */
export function tick(y: YardState): { state: YardState; happened: Memory[] } {
  const ticks = y.ticks + 1
  const happened: Memory[] = []
  const kept = y.kept.slice()

  for (let i = 0; i < y.cats.length; i++) {
    const me = y.cats[i]
    const others = y.cats.filter(c => c.uid !== me.uid)
    if (!others.length) continue

    // Its own stream, so adding a cat cannot change what earlier cats did.
    const r = rng((y.seed ^ Math.imul(ticks, 0x9e3779b9) ^ Math.imul(i, 0x85ebca6b)) | 0)
    const t = temperOf(me.face)
    if (r() > 0.25 + t.act) continue

    const target = others[Math.min(Math.floor(r() * others.length), others.length - 1)]
    const b = bond({ ...y, ticks, kept }, me.uid, target.uid)
    const deed = choose(t, b, affinity(me, target), y.props, r)
    if (!deed) continue

    let delta = deed.delta
    // A clumsy cat means well and still knocks the bowl over.
    if (delta > 0 && r() < t.clumsy) delta = -Math.max(1, Math.floor(delta / 2))

    const m: Memory = { tick: ticks, a: me.uid, b: target.uid, kind: deed.kind, delta }
    kept.push(m)
    happened.push(m)
  }

  return {
    state: { ...y, ticks, kept: kept.filter(m => weight(m, ticks) > 0) },
    happened,
  }
}

/** Run a whole absence at once. Being away N ticks IS N ticks. */
export function catchUp(
  y: YardState,
  ticks: number,
  /**
   * Called with the state either side of EVERY tick, if anybody is watching.
   *
   * Added for the chronicle, which has to notice the exact hour a bond crossed
   * from one word to another. Comparing only the start and the end of a visit
   * would date a crossing "sometime in the last nine hours" and would miss a
   * pair that fell out and made up while you were away.
   *
   * An observer, not a hook: it cannot change what happens, and `catchUp` does
   * exactly what it did before when nothing is passed.
   */
  onTick?: (before: YardState, after: YardState) => void,
): { state: YardState; happened: Memory[] } {
  let state = y
  const happened: Memory[] = []
  for (let i = 0; i < ticks; i++) {
    const step = tick(state)
    onTick?.(state, step.state)
    state = step.state
    happened.push(...step.happened)
  }
  return { state, happened }
}

/** One cat's memories, newest first. If it is in here, it counts toward the bond. */
export const diary = (y: YardState, uid: string, most = 20) =>
  y.kept.filter(m => m.a === uid || m.b === uid).slice(-most).reverse()

/**
 * EVERYTHING THAT IS STILL REMEMBERED BETWEEN TWO CATS, newest first.
 *
 * JP: "one of my most favourite things in Dwarf Fortress was looking at
 * conversations dwarves would have… right now I only see that they're friends,
 * and I don't think that should be what I should be seeing. I should be seeing
 * cat one and cat two are talking, and then click into detail."
 *
 * A bond word is a VERDICT — the sum of this list, reduced to one adjective. It
 * is the answer, and he is right that it is the least interesting thing on the
 * page. This is the working: the actual events between two cats, which is what
 * the verdict was computed from and what a conversation in DF is made of.
 *
 * Nothing is stored for it. Every memory already names both cats.
 */
export const between = (y: YardState, a: string, b: string, most = 20) =>
  y.kept.filter(m => same(m, a, b)).slice(-most).reverse()

/**
 * How a bond reads. PLACEHOLDER WORDS — the full build says the same, and they
 * are JP's to replace. Nothing here should put prose in his game.
 *
 * ── THE THRESHOLDS ARE MEASURED, NOT GUESSED ─────────────────────────────────
 *
 * They used to be 40 / 15 / -15 / -40, written for the -100..100 the bond is
 * CLAMPED to rather than the range it actually occupies. Over 9600 readings from
 * 60 yards, furnished and bare, the real spread is:
 *
 *   min -29 · 1% -20 · 10% -12 · median -3 · 90% +7 · 99% +13 · max +18
 *
 * So four fifths of the scale was never used, and the words landed like this:
 *
 *   enemies 0.0%   cold 5.3%   wary 94.4%   friendly 0.3%   inseparable 0.0%
 *
 * Two of the five could not happen at all and almost every pair in the game read
 * "wary" forever — which says the yard is doing nothing, when it is not.
 *
 * These cuts put the extremes at roughly the top and bottom 1-2%, so
 * "inseparable" and "enemies" stay rare enough to mean something and the middle
 * three actually move. The BOND was not touched: this is the vocabulary being
 * fitted to the simulation rather than the simulation to the vocabulary.
 */
export function reads(b: number): string {
  if (b >= 13) return 'inseparable'
  if (b >= 5)  return 'friendly'
  if (b > -9)  return 'wary'
  if (b > -19) return 'cold'
  return 'enemies'
}
