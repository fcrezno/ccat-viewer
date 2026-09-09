import { propFor, type Memory, type PropKind, type Resident, type YardState } from './yard'

/**
 * WHERE EVERYTHING IS STANDING — a Dwarf Fortress overworld, cat-sized.
 *
 * JP: "for the yard i would like it to be similar to the look of dwarf fortress;
 * but a very petit version… these cats arent mineing or anything; so i would just
 * like to focus on the social aspects."
 *
 * ── WHY A MAP IS NOW POSSIBLE AT ALL ─────────────────────────────────────────
 *
 * Yard.tsx argued against one, and the argument was sound as far as it went: the
 * cats are 250x199 PORTRAITS with no walk cycles, so a garden of them milling
 * about is not art this game has.
 *
 * A DF overworld does not need a walk cycle. Nothing animates — a creature is one
 * tile that is simply THERE, and the map is read rather than watched. That is
 * exactly what a portrait can do.
 *
 * ── NOTHING IS STORED. POSITION IS DERIVED. ──────────────────────────────────
 *
 * The same rule the bond follows: a bond is the sum of what is still remembered
 * and is never stored, because a stored total would be a second source of truth
 * and would win silently. Positions are the same. There is no movement loop and
 * no saved coordinates — `layout()` is a pure function of the yard, so the map
 * cannot drift out of agreement with the simulation it is drawing.
 *
 * ── AND SO THE MAP MEANS SOMETHING ───────────────────────────────────────────
 *
 * A cat stands next to the last thing it used. A cat that just played is by the
 * toy; a cat that just shared is at the bowl; a cat that greeted somebody is
 * beside them. So the arrangement is not decoration — it is the most recent tick,
 * drawn. Two cats together in a corner have a history, and you can see it before
 * you read a word of the log.
 */

/** Small on purpose. Petite, and it fits a phone across without scrolling. */
export const COLS = 13
export const ROWS = 8

export type Cell = { x: number; y: number }

export type Placed =
  | { what: 'cat';  cell: Cell; cat: Resident; doing: Memory | null }
  | { what: 'prop'; cell: Cell; prop: PropKind }


/** The same xorshift the yard runs on, so a layout replays exactly like a visit. */
function rng(seed: number) {
  let s = seed | 0
  return () => {
    s ^= s << 13
    s ^= s >> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

/** A stable number for a string, so a cat's home spot follows its uid. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h | 0
}

const key = (c: Cell) => c.y * COLS + c.x

/**
 * The nearest free cell, searched in rings so the nudge is small and stable.
 *
 * Two cats CANNOT share a tile. Overlapping them would hide one behind the other
 * and the map would be quietly lying about who is present — the one thing a map
 * of who-is-here must not do.
 */
function free(want: Cell, taken: Set<number>): Cell {
  const at = (x: number, y: number) => ({
    x: Math.max(0, Math.min(COLS - 1, x)),
    y: Math.max(0, Math.min(ROWS - 1, y)),
  })
  if (!taken.has(key(want))) return want
  for (let ring = 1; ring < Math.max(COLS, ROWS); ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue
        const c = at(want.x + dx, want.y + dy)
        if (!taken.has(key(c))) return c
      }
    }
  }
  return want
}

/** Where the furniture stands. Fixed by the yard's seed — it does not wander. */
function propCells(y: YardState): Map<PropKind, Cell> {
  const out = new Map<PropKind, Cell>()
  const taken = new Set<number>()

  y.props.forEach((p, i) => {
    const r = rng((y.seed ^ Math.imul(i + 1, 0x9e3779b9) ^ hash(p)) | 0)
    /*
     * Kept off the edges. A prop in a corner has fewer cells beside it, so the
     * cats using it would pile into the same nudge and read as a queue.
     */
    const want = {
      x: 2 + Math.floor(r() * (COLS - 4)),
      y: 1 + Math.floor(r() * (ROWS - 2)),
    }
    const cell = free(want, taken)
    taken.add(key(cell))
    out.set(p, cell)
  })

  return out
}

/** One step off a cell, chosen deterministically. Used to stand BESIDE a thing. */
function beside(c: Cell, r: () => number): Cell {
  const ring = [
    [0, -1], [1, 0], [0, 1], [-1, 0],
    [1, -1], [1, 1], [-1, 1], [-1, -1],
  ]
  const [dx, dy] = ring[Math.floor(r() * ring.length) % ring.length]
  return {
    x: Math.max(0, Math.min(COLS - 1, c.x + dx)),
    y: Math.max(0, Math.min(ROWS - 1, c.y + dy)),
  }
}

/**
 * HOW FAR BACK THE WALK IS COMPUTED.
 *
 * Positions are derived by walking every cat forward from a start, so the cost is
 * ticks x cats. A yard accumulates ticks for as long as it is visited, and there
 * is no reason to replay a fortnight to know where somebody is standing: forty
 * ticks is far more than enough to cross a 13x8 yard several times over.
 */
const WALK_FROM = 40


/** Eight-directional, in a fixed order so ties always break the same way. */
const AROUND: [number, number][] = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
  [1, -1], [1, 1], [-1, 1], [-1, -1],
]

const inside = (c: Cell) => c.x >= 0 && c.x < COLS && c.y >= 0 && c.y < ROWS

/**
 * A DIJKSTRA MAP — how far every tile is from the goal, going round what is in
 * the way.
 *
 * The roguelike technique, and the one Brogue moves its creatures with. Flood
 * outward from the goal over passable tiles, then a creature simply steps to the
 * lowest-valued neighbour and it is walking an optimal path without ever holding
 * one.
 *
 * WHY IT REPLACED A STRAIGHT LINE. `Math.sign()` toward the goal is right on open
 * ground and wrong the moment anything is in the way: a cat with another cat
 * between it and the bowl kept walking into it and standing still, or shuffled
 * sideways and lost the thread. This routes AROUND, which is the difference
 * between a queue and a jam.
 *
 * The goal itself is always reachable in the map even when something is standing
 * on it — it is a destination, not a tile to be occupied, and flooding from it
 * regardless is what lets a cat walk up to a spot that is momentarily taken.
 */
function dijkstra(goal: Cell, blocked: Set<number>): Map<number, number> {
  const dist = new Map<number, number>()
  dist.set(key(goal), 0)
  let edge = [goal]

  while (edge.length) {
    const next: Cell[] = []
    for (const c of edge) {
      const d = dist.get(key(c))!
      for (const [dx, dy] of AROUND) {
        const n = { x: c.x + dx, y: c.y + dy }
        if (!inside(n)) continue
        const k = key(n)
        if (dist.has(k) || blocked.has(k)) continue
        dist.set(k, d + 1)
        next.push(n)
      }
    }
    edge = next
  }
  return dist
}

/**
 * Roll downhill: the neighbour closest to the goal, or stay put.
 *
 * Never more than one tile, because it only ever looks at neighbours — which is
 * the property that took three attempts to get right the first time.
 */
function downhill(from: Cell, dist: Map<number, number>, taken: Set<number>): Cell {
  let best = from
  let bestD = dist.get(key(from)) ?? Infinity

  for (const [dx, dy] of AROUND) {
    const n = { x: from.x + dx, y: from.y + dy }
    if (!inside(n) || taken.has(key(n))) continue
    const d = dist.get(key(n))
    if (d !== undefined && d < bestD) { bestD = d; best = n }
  }
  return best
}

/**
 * THE LAST THING EACH CAT ACTUALLY DID, up to this tick.
 *
 * WATCHED MEMORIES ARE NOT IT, and that filter is the whole reason this is one
 * function instead of the two identical loops it replaced. A witnessed memory
 * names the ONLOOKER as `a` and the cat it watched as `b`; counted as a deed it
 * would draw a cat squabbling with somebody it never touched, give it the wrong
 * glyph and pose, and walk it to the prop of a row it only saw.
 *
 * Both callers need the same answer — where a cat stands and what it is shown
 * doing must agree — so they now cannot disagree.
 */
function latestDone(y: YardState, tick: number): Map<string, Memory> {
  const last = new Map<string, Memory>()
  for (const m of y.kept) if (m.tick <= tick && !m.seen) { last.set(m.a, m); last.set(m.b, m) }
  return last
}

/**
 * WHERE EACH CAT WANTS TO BE at a given tick — not where it is.
 *
 * A cat that just played is heading for the toy; one that greeted somebody is
 * heading for them; one nobody remembers is drifting around its own patch.
 */
function targets(y: YardState, tick: number, props: Map<PropKind, Cell>, at: Map<string, Cell>) {
  const last = latestDone(y, tick)

  const want = new Map<string, Cell>()
  for (const cat of y.cats) {
    const doing = last.get(cat.uid) ?? null
    const r = rng((y.seed ^ hash(cat.uid) ^ Math.imul(tick + 1, 0x85ebca6b)) | 0)

    /* Nothing to do: its own patch, which only drifts a tile at a time anyway. */
    let goal: Cell = { x: Math.floor(r() * COLS), y: Math.floor(r() * ROWS) }

    if (doing) {
      const wants = propFor(doing.kind)
      const propCell = wants ? props.get(wants) : undefined
      if (propCell) {
        goal = beside(propCell, r)
      } else {
        const otherUid = doing.a === cat.uid ? doing.b : doing.a
        const there = at.get(otherUid)
        if (there) goal = beside(there, r)
      }
    }
    want.set(cat.uid, goal)
  }
  return want
}

/**
 * WHERE EVERYBODY IS STANDING, having walked there.
 *
 * JP: "they shouldn't be teleporting from place to place… make their movements
 * make sense… they should be walking, or at least moving within the tile frames
 * to their location."
 *
 * The first version derived a position from a cat's latest memory and nothing
 * else, so every tick placed it wherever that tick implied — and a cat that
 * played by the toy and then greeted somebody across the yard simply appeared
 * there. Correct about where it belonged, and nonsense as movement.
 *
 * Now each cat holds a position and takes ONE STEP a tick toward what it wants,
 * eight-directionally, exactly as a creature in DF does. Crossing the yard takes
 * as many turns as it takes. The path is not stored anywhere: walking from a
 * fixed start with a seeded goal is deterministic, so the same yard always walks
 * the same way and the map still cannot disagree with the simulation.
 */
function walk(y: YardState, upTo: number): Map<string, Cell> {
  const props = propCells(y)
  const propKeys = new Set([...props.values()].map(key))
  /*
   * THE WALK STARTS AT A FIXED TICK, anchored to the yard rather than to the tick
   * being asked for.
   *
   * This was `upTo - WALK_FROM`, which slid the starting line forward with every
   * question — so tick 44 and tick 45 were two DIFFERENT walks from two different
   * starts, and comparing them showed cats moving four tiles in a turn. The walk
   * has to be one path sampled at points, not a fresh path per point.
   */
  const from = Math.max(0, y.ticks - WALK_FROM)

  /* Everybody starts on their own patch, seeded by who they are. */
  const at = new Map<string, Cell>()
  for (const cat of y.cats) {
    const r = rng((y.seed ^ hash(cat.uid)) | 0)
    at.set(cat.uid, { x: Math.floor(r() * COLS), y: Math.floor(r() * ROWS) })
  }

  // Asked for a tick older than the walk goes back to: everybody is at the start.
  if (upTo < from) return at

  for (let t = from; t <= upTo; t++) {
    const want = targets(y, t, props, at)

    /*
     * EVERY CAT'S CURRENT TILE IS RESERVED BEFORE ANYBODY MOVES.
     *
     * This started as just the furniture, and it let two cats end up on one tile:
     * a cat that cannot move stays where it is, but somebody earlier in the order
     * may already have moved ONTO that tile, because a cat that has not moved yet
     * was not occupying anything as far as this set was concerned.
     *
     * Reserving up front and releasing on the way out is the ordinary fix, and it
     * also stops the order cats are processed in deciding who gets to walk
     * through whom.
     */
    const taken = new Set<number>(propKeys)
    for (const cat of y.cats) taken.add(key(at.get(cat.uid)!))

    for (const cat of y.cats) {
      const here = at.get(cat.uid)!
      const goal = want.get(cat.uid)!
      /*
       * The map is built round what is standing in the way THIS turn — the
       * furniture and every cat already moved — so a cat routes around the queue
       * rather than into it. One map per cat per tick is nothing on 104 tiles.
       */
      /*
       * Its OWN tile is not an obstacle to itself, so it comes out of the set for
       * the length of its own move — otherwise a cat hemmed in on all sides could
       * not even stay where it was standing.
       */
      const mine = key(here)
      taken.delete(mine)
      const next = (here.x === goal.x && here.y === goal.y)
        ? here
        : downhill(here, dijkstra(goal, taken), taken)
      taken.add(mine)
      /*
       * A BLOCKED CAT STEPS ASIDE OR STAYS. It does NOT go looking for space.
       *
       * This used the same ring search the props use, which finds the nearest
       * free tile however far that is — and that put moves of two and three tiles
       * back into a walk that had just been made one tile a turn. Measured: 34 of
       * 80 moves were longer than a step.
       *
       * Now the only tiles it will consider are the ones it could actually reach
       * this turn, and if none of them are free it waits. A crowd round the bowl
       * should look like a queue, not like cats being flung out of it.
       */
      const cell = taken.has(key(next)) ? here : next
      // Give up the tile being left, claim the one being taken.
      taken.delete(key(here))
      taken.add(key(cell))
      at.set(cat.uid, cell)
    }
  }
  return at
}

/** The yard as it stood at a particular tick, everybody having walked there. */
export function layoutAt(y: YardState, tick: number): Placed[] {
  const props = propCells(y)
  const at = walk(y, Math.max(0, Math.min(tick, y.ticks)))

  const last = latestDone(y, tick)

  const out: Placed[] = []
  const taken = new Set<number>()
  for (const [prop, cell] of props) { taken.add(key(cell)); out.push({ what: 'prop', cell, prop }) }
  for (const cat of y.cats) {
    const cell = at.get(cat.uid)!
    taken.add(key(cell))
    out.push({ what: 'cat', cell, cat, doing: last.get(cat.uid) ?? null })
  }
  return out
}

export function layout(y: YardState): Placed[] {
  return layoutAt(y, y.ticks)
}

/**
 * What a cat is doing, for the tile's own label.
 *
 * PLACEHOLDER WORDS, like `reads()` and `SAYS` — one word each so a tile can
 * carry it. They are JP's to replace and nothing here should ship as his voice.
 */
export const DOING: Record<Memory['kind'], string> = {
  greet:    'saying hello',
  play:     'playing',
  groom:    'grooming',
  showoff:  'showing off',
  share:    'sharing',
  snub:     'ignoring someone',
  squabble: 'squabbling',
  /* On its own with something. See lib/skills.ts. */
  wits:     'working something out',
  cook:     'cooking',
  poise:    'practising',
  tidy:     'doing the washing',
}

/**
 * WHAT A CAT'S BODY IS DOING — and it only ever changes on the turn.
 *
 * JP, three times: "no interpolation", "make it more janky", "or like how DF
 * handles dwarf interactions".
 *
 * The first attempt reused the tama-* animations from the tamagotchi screen.
 * Stepping them with `steps(1, end)` was not enough and it was the wrong fix: a
 * CSS animation runs on ITS OWN clock, so the cats kept moving between ticks
 * while the world stood still. In Dwarf Fortress nothing moves between turns —
 * a creature is a character on a tile, and it is somewhere else when the turn
 * advances or it is not.
 *
 * So there is no animation and no transition here at all. A pose is a small whole
 * number of pixels derived from the CURRENT TICK, held until the tick changes,
 * and cut to instantly when it does. That is a real discontinuity, which is what
 * feedback-animation-literal.md says janky actually means.
 *
 * ── IT GOES ON THE PORTRAIT, NOT THE TILE ────────────────────────────────────
 *
 * The tile's transform is its POSITION on the grid. Putting a pose there would
 * overwrite the position and pile every cat into the top-left corner.
 */
export function poseOf(doing: Memory | null, tick: number): string {
  if (!doing) return 'none'          // Standing still stands still.

  /*
   * A POSE BELONGS TO THE HOUR IT HAPPENED. THIS IS WHY THE CATS LOOKED OFF THE
   * GRID.
   *
   * JP: "please center the cats in the grid."
   *
   * `doing` is the last thing anybody REMEMBERS this cat doing, and a memory
   * lasts a day — so it can be twenty-three hours old. The poses were applied to
   * it whatever its age, and two of them are HELD rather than alternating:
   * `showoff` is translateY(-5px) and `poise` is translateY(-3px), with nothing
   * to bring them back down.
   *
   * So a cat that showed off once floated a sixth of a cell above its tile until
   * it did something else — measured on the live map at dy -5.20, -4.95 and
   * -4.69 against dx under 0.35 everywhere. Three of eight cats were levitating.
   * Squabble and tidy do the same sideways, frozen on whichever half of their
   * two-frame shove `tick % 2` landed on.
   *
   * Nothing was wrong with the grid. The cats were standing on it correctly and
   * then being moved off it by a gesture that had no end.
   *
   * A pose is what a cat is doing NOW, so it lasts one hour. The mood glyph is
   * the part that persists, and it should: that is the difference between what a
   * cat is doing and what it last did. It is also the Dwarf Fortress reading —
   * nothing carries between turns.
   */
  if (doing.tick !== tick) return 'none'

  const beat = tick % 2 === 0

  switch (doing.kind) {
    /*
     * BIG ENOUGH TO SEE. These were 1-2px, which on a 30px tile is nothing at
     * all — a pose that cannot be seen is not a pose. A quarter of a tile reads
     * as a shove; a pixel reads as a rendering artefact.
     */
    // A shove, thrown the other way each turn.
    case 'squabble': return `translateX(${beat ? 5 : -5}px)`
    // Off the ground on alternate turns. Two frames, no arc between them.
    case 'play':     return beat ? 'translateY(-6px)' : 'none'
    case 'greet':    return beat ? 'translateY(-3px)' : 'none'
    // Held, not alternating — it is posing, not moving.
    case 'showoff':  return 'translateY(-5px)'
    case 'groom':    return beat ? 'translateX(3px)' : 'none'
    case 'share':    return beat ? 'translateY(2px)' : 'none'
    /*
     * A SNUB IS THE CAT NOT DOING ANYTHING, and that is now what it looks like.
     *
     * JP: "I don't think you need to flip cats left or right for them to look at
     * anything. I think I should just keep it static as is, like, for a fortress."
     *
     * This was `scaleX(-1)` — turned away, which needed the sprite to have a
     * FRONT. These are hand-drawn portraits, not a side-on sprite sheet with a
     * facing, and mirroring one mirrors the drawing rather than turning a
     * creature round. A fortress does not turn its glyphs either.
     *
     * Nothing is lost that was carrying the meaning: the grey `·` on the tile and
     * the log line both say it, and standing still while somebody else is trying
     * is the snub.
     */
    case 'snub':     return 'none'

    /*
     * A CAT ON ITS OWN, BUSY. Smaller than the deeds on purpose — a chore is an
     * hour of quiet work, not an event, and it should not pull the eye across a
     * yard where something is actually happening between two cats.
     */
    case 'wits':     return beat ? 'translateY(-2px)' : 'none'
    case 'cook':     return beat ? 'translateX(2px)' : 'none'
    // Up on the thing, and holding it. Practice looks like showing off, quieter.
    case 'poise':    return 'translateY(-3px)'
    // Scrubbing: the one that goes back and forth rather than up and down.
    case 'tidy':     return beat ? 'translateX(-2px)' : 'translateX(2px)'
  }
}

/**
 * WHAT A CAT THINKS ABOUT WHAT HAPPENED — Dwarf Fortress's thoughts panel.
 *
 * JP: "hey where are the cat's thoughts and discussions? like in dwarf fortress."
 *
 * The diary was already here and it is DF's MEMORY list: the events a cat still
 * holds. What was missing is the half DF is actually famous for — how the
 * creature FEELS about them. "He was pleased to have eaten a fine meal lately."
 *
 * ── DERIVED, NOT STORED ──────────────────────────────────────────────────────
 *
 * Nothing new is recorded. A memory already carries everything a thought needs:
 *
 *   kind    what happened
 *   delta   whether it went well — and it is NEGATIVE when a clumsy cat meant
 *           well and knocked the bowl over, which is the most Dwarf Fortress
 *           thing this simulation already does and had nowhere to say it
 *   a / b   whether this cat did it or had it done to them
 *
 * So a thought is a reading of a memory, and it cannot drift from what happened
 * because there is nothing else for it to be.
 *
 * ── THE WORDS ARE PLACEHOLDERS ───────────────────────────────────────────────
 *
 * Same rule as SAYS, DOING and reads(): the voice of this game is JP's, and none
 * of these should ship. {other} is the other cat's name. They are in
 * yard-prose.xlsx with the rest.
 */
export type Thought = { text: string; good: boolean }

type Lines = {
  /** This cat did it, and it went as intended. */
  did: string
  /** It was done TO this cat, and it went as intended. */
  got: string
  /** This cat did it and it went wrong — the clumsy flip. */
  botched?: string
  /** It was done to this cat and went wrong. */
  suffered?: string
}

const THOUGHT_LINES: Record<Memory['kind'], Lines> = {
  greet:    { did: 'said hello to {other}',            got: '{other} came over to say hello',
              botched: 'tried to say hello to {other} and got it wrong' },
  play:     { did: 'had a good run around with {other}', got: '{other} chased it about',
              botched: 'got too rough with {other}' },
  groom:    { did: 'cleaned {other} up',                 got: '{other} cleaned its ears',
              botched: 'meant to clean {other} up and made a mess of it' },
  showoff:  { did: 'showed {other} how it is done',      got: '{other} would not stop showing off',
              botched: 'tried to impress {other} and fell short' },
  share:    { did: 'let {other} eat first',              got: '{other} let it eat first',
              botched: 'went to share with {other} and knocked the bowl over' },
  snub:     { did: 'has no time for {other}',            got: '{other} walked straight past it' },
  squabble: { did: 'fell out with {other}',              got: 'fell out with {other}' },
  /*
   * NOBODY ELSE WAS THERE, so `did` and `got` are the same line and neither says
   * {other}. `thoughtOf` picks between them on whether this cat was `a`, and for a
   * chore it is always both — so whichever it picks is the truth.
   */
  wits:     { did: 'worked something out on its own',   got: 'worked something out on its own' },
  cook:     { did: 'has been getting good at cooking',  got: 'has been getting good at cooking' },
  poise:    { did: 'has been practising, quietly',      got: 'has been practising, quietly' },
  tidy:     { did: 'got the washing done',              got: 'got the washing done' },
}

/**
 * One thought, from one memory, from this cat's side.
 *
 * The SAME event reads differently to each of them, which is the point: being
 * groomed and doing the grooming are not the same day.
 */
/**
 * What a cat thinks about something it only WATCHED.
 *
 * PLACEHOLDER PROSE, JP's to replace. Two sides, because a witnessed memory has
 * two: the cat that looked up, and the cat it looked at.
 */
const SAW_LINES: Partial<Record<Memory['kind'], { did: string; got: string }>> = {
  squabble: { did: 'saw {other} fall out with somebody', got: '{other} watched it fall out' },
  groom:    { did: 'saw {other} cleaning somebody up',   got: '{other} watched it clean somebody up' },
  showoff:  { did: 'saw {other} showing off',            got: '{other} watched it show off' },
}

export function thoughtOf(m: Memory, self: string, otherName: string): Thought {
  const mine = m.a === self
  const wrong = m.delta < 0

  /*
   * A WATCHED MEMORY IS NOT A DEED THIS CAT TOOK PART IN, and reading it through
   * THOUGHT_LINES would say so: an onlooker's diary would claim it fell out with
   * a cat it never touched. Its own two lines, and its own idea of good — which
   * is the sign of what it SAW, already carried on the delta.
   */
  if (m.seen) {
    const w = SAW_LINES[m.kind]
    if (w) {
      return {
        text: (mine ? w.did : w.got).replace('{other}', otherName),
        good: m.delta > 0,
      }
    }
  }

  const l = THOUGHT_LINES[m.kind]

  const pick =
    mine && wrong  ? (l.botched ?? l.did)
    : mine         ? l.did
    : wrong        ? (l.suffered ?? l.got)
    :                l.got

  return {
    text: pick.replace('{other}', otherName),
    /*
     * GOOD IS THE DELTA, not the deed. A groom that went wrong is a bad memory
     * however kindly it was meant, and reading the kind instead would print a
     * warm line over a bond that just went down.
     */
    good: m.delta > 0,
  }
}

/**
 * THE MOOD GLYPH — one character over a cat, the way DF does it.
 *
 * JP: "dwarves usually act with, like, question marks, exclamation points, stuff
 * like that in terms of how they would see their animations."
 *
 * That is the thing DF gets for free that a portrait grid does not: you can read
 * a whole map at a glance without reading a word. Nine portraits all look equally
 * busy; nine portraits where two are hearts and one is a red cross do not.
 *
 * ── CP437, NOT EMOJI ─────────────────────────────────────────────────────────
 *
 * These are the characters DF's own tileset carries — ! ? ♥ ♪ ☼ — rather than
 * emoji. Three reasons, and the third is the one that decides it:
 *
 *   they are one colour, so the glyph can be tinted to carry the mood too
 *   they are drawn at any size without turning to mush over the art
 *   the perch already proved a newer emoji renders as an empty box here
 *
 * ── IDLE IS A QUESTION MARK ──────────────────────────────────────────────────
 *
 * A cat nobody remembers doing anything gets `?`. That is not filler: in a nine
 * cat yard the ones NOT joining in are the interesting ones, and before this they
 * looked exactly like everybody else.
 */
export type Mood = { glyph: string; colour: string }

export const MOOD: Record<Memory['kind'], Mood> = {
  greet:    { glyph: '!', colour: '#8ab4f8' },  // hello — social, blue
  play:     { glyph: '♪', colour: '#7ee787' },  // chasing about — green
  groom:    { glyph: '♥', colour: '#ff9ecd' },  // the warmest thing they do
  share:    { glyph: '♦', colour: '#c9a2ff' },  // giving something up
  showoff:  { glyph: '☼', colour: '#e0a72c' },  // DF's own sun. look at me
  snub:     { glyph: '·', colour: '#6a6a80' },  // barely anything, and grey
  squabble: { glyph: '✖', colour: '#ef4444' },  // the only red on the map
  /*
   * BUSY ON ITS OWN. All four share one glyph and one colour deliberately: the
   * map's job is to show at a glance who is WITH somebody and who is not, and
   * four more colours competing with the deeds would work against that. Which
   * chore it is belongs on the tile's label and in the log.
   *
   * `*` is DF's own mark for a worked thing, and the ink is the muted end of the
   * page rather than a signal colour.
   */
  wits:     { glyph: '*', colour: '#9aa88f' },
  cook:     { glyph: '*', colour: '#9aa88f' },
  poise:    { glyph: '*', colour: '#9aa88f' },
  tidy:     { glyph: '*', colour: '#9aa88f' },
}

/** Nothing anybody remembers. See above — this is a state worth showing. */
export const IDLE: Mood = { glyph: '?', colour: '#7a7a95' }

export const moodOf = (doing: Memory | null): Mood => (doing ? MOOD[doing.kind] : IDLE)

/**
 * WHO SAW IT — the third cat in a two-cat event.
 *
 * JP asked how the yard could tell stories the way a fortress does. A chronicle
 * gives it a past; this gives it SIDES.
 *
 * Every event in the yard has been strictly between two cats, so an opinion
 * could only ever be first-hand. In DF a dwarf who merely WATCHES something
 * forms a thought about it, and that is where a fortress's cliques and grudges
 * come from — nobody arranges them. A cat that stood next to a squabble and
 * thought less of the one who started it is the same machine.
 *
 * ── WHY THIS IS HERE AND NOT IN lib/yard.ts ──────────────────────────────────
 *
 * It needs to know who was standing WHERE, and that is worked out in this file.
 * Putting it in the simulation would make lib/yard.ts import the map that draws
 * it. `catchUp` takes it as a hook instead, so the dependency points one way.
 *
 * ── ONLY THE TWO THAT MOVE A BOND MOST, AND THAT IS MEASURED ─────────────────
 *
 * Nobody forms an opinion about a greeting, so this was first written as the
 * three LOUD deeds — squabble, groom and showing off. Measured over 120 hours of
 * a full yard that gave 94 witnessed memories against 227 in total: FORTY-ONE
 * PER CENT of everything the yard remembered was second-hand, and almost all of
 * it was showing off, which is both common and the least consequential of the
 * three.
 *
 * A yard where half of what anybody knows is hearsay is not a yard with sides in
 * it; it is a yard where nothing first-hand can be heard.
 *
 * So it is the two deeds that move a bond furthest — groom at +4 and squabble at
 * -4 — which is the same cut the log's own beat uses in components/Yard.tsx, and
 * for the same reason: if everything is worth remarking on, nothing is.
 *
 * ── ONE POINT, AND AT MOST TWO ONLOOKERS ─────────────────────────────────────
 *
 * A witnessed memory is worth 1 against a squabble's own 4. Watching should
 * colour a yard slowly; if it moved bonds as hard as taking part, a single row
 * in a crowd would swing the whole cast at once. Two onlookers per event caps
 * how fast the list can grow — memories fade, but a crowded tile could otherwise
 * add eight entries an hour.
 */
const WITNESSED: Memory['kind'][] = ['squabble', 'groom']
const ONLOOKERS = 2

export function witnesses(y: YardState, happened: Memory[]): Memory[] {
  const loud = happened.filter(m => WITNESSED.includes(m.kind))
  if (!loud.length) return []

  const where = new Map<string, Cell>()
  for (const p of layout(y)) if (p.what === 'cat') where.set(p.cat.uid, p.cell)

  const out: Memory[] = []

  for (const m of loud) {
    const at = where.get(m.a)
    const on = where.get(m.b)
    if (!at || !on) continue

    /*
     * NEXT TO EITHER OF THEM. A cat beside the one being snapped at saw it just
     * as well as one beside the cat doing the snapping.
     */
    const near = [...where.entries()]
      .filter(([uid]) => uid !== m.a && uid !== m.b)
      .filter(([, c]) =>
        (Math.abs(c.x - at.x) <= 1 && Math.abs(c.y - at.y) <= 1) ||
        (Math.abs(c.x - on.x) <= 1 && Math.abs(c.y - on.y) <= 1))
      /* Sorted by uid so the same crowd always yields the same two onlookers. */
      .sort((p, q) => (p[0] < q[0] ? -1 : 1))
      .slice(0, ONLOOKERS)

    for (const [uid] of near) {
      out.push({
        tick: m.tick,
        a: uid,
        b: m.a,
        kind: m.kind,
        /*
         * THE SIGN OF WHAT THEY SAW, not of the deed's name. A groom that went
         * wrong looked like a mess from the side too, and an onlooker who saw a
         * cat make a mess of something does not think better of it for meaning
         * well.
         */
        delta: m.delta >= 0 ? 1 : -1,
        seen: true,
      })
    }
  }

  return out
}
