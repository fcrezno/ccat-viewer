import { NEEDS, type Memory, type PropKind, type Resident, type YardState } from './yard'

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

/**
 * A tile this cat can actually reach this turn: the one it wants, else any free
 * neighbour, else where it already is. Never further than one step.
 *
 * The neighbours are tried in a fixed order so a blocked cat resolves the same
 * way every time — the walk has to be deterministic or the map would shuffle on
 * every render.
 */
function nearby(from: Cell, want: Cell, taken: Set<number>): Cell {
  const inside = (c: Cell) => c.x >= 0 && c.x < COLS && c.y >= 0 && c.y < ROWS
  if (inside(want) && !taken.has(key(want))) return want

  for (const [dx, dy] of [
    [0, -1], [1, 0], [0, 1], [-1, 0],
    [1, -1], [1, 1], [-1, 1], [-1, -1],
  ]) {
    const c = { x: from.x + dx, y: from.y + dy }
    if (inside(c) && !taken.has(key(c))) return c
  }
  return from
}

/** One step, eight-directional. A creature moves ONE tile a turn, as in DF. */
function step(from: Cell, to: Cell): Cell {
  return {
    x: from.x + Math.sign(to.x - from.x),
    y: from.y + Math.sign(to.y - from.y),
  }
}

/**
 * WHERE EACH CAT WANTS TO BE at a given tick — not where it is.
 *
 * A cat that just played is heading for the toy; one that greeted somebody is
 * heading for them; one nobody remembers is drifting around its own patch.
 */
function targets(y: YardState, tick: number, props: Map<PropKind, Cell>, at: Map<string, Cell>) {
  const last = new Map<string, Memory>()
  for (const m of y.kept) if (m.tick <= tick) { last.set(m.a, m); last.set(m.b, m) }

  const want = new Map<string, Cell>()
  for (const cat of y.cats) {
    const doing = last.get(cat.uid) ?? null
    const r = rng((y.seed ^ hash(cat.uid) ^ Math.imul(tick + 1, 0x85ebca6b)) | 0)

    /* Nothing to do: its own patch, which only drifts a tile at a time anyway. */
    let goal: Cell = { x: Math.floor(r() * COLS), y: Math.floor(r() * ROWS) }

    if (doing) {
      const wants = NEEDS[doing.kind]
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
    const taken = new Set<number>(propKeys)

    for (const cat of y.cats) {
      const here = at.get(cat.uid)!
      const goal = want.get(cat.uid)!
      const next = (here.x === goal.x && here.y === goal.y) ? here : step(here, goal)
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
      const cell = nearby(here, next, taken)
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

  const last = new Map<string, Memory>()
  for (const m of y.kept) if (m.tick <= tick) { last.set(m.a, m); last.set(m.b, m) }

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
}

/**
 * WHAT THE CAT ITSELF DOES — using the animations this app already has.
 *
 * JP: "the effects and animations that were previously on, that you didn't add."
 *
 * globals.css already carries a full set and the yard was using NONE of them.
 * The tama-* ones are literally cat moods — bounce, shake, pulse, sway, float —
 * written for the tamagotchi screen, and cradle-shake is the jolt the fight uses
 * on a hit. Reusing them means the yard moves the way the rest of the game
 * already moves, and there is one place to change how a cat behaves rather than
 * two sets that drift.
 *
 * ── IT GOES ON THE PORTRAIT, NOT THE TILE ────────────────────────────────────
 *
 * The tile carries `transform: translate()` for its position on the grid. Every
 * one of these animations also animates `transform`, so putting them on the tile
 * would overwrite the position and pile every cat into the top-left corner. The
 * portrait inside is free to move.
 */
export const ACTS: Record<Memory['kind'], string> = {
  greet:    'tama-bounce 0.7s ease-in-out infinite',
  play:     'tama-bounce 0.45s ease-in-out infinite',
  groom:    'tama-sway 2.5s ease-in-out infinite',
  showoff:  'tama-float 1.6s ease-in-out infinite',
  share:    'tama-float 3s ease-in-out infinite',
  snub:     'tama-pulse 2s ease-in-out infinite',
  squabble: 'tama-shake 0.5s ease-in-out infinite',
}

/** Doing nothing is still doing something: it breathes. */
export const RESTING = 'tama-pulse 3.4s ease-in-out infinite'

export const actOf = (doing: Memory | null) => (doing ? ACTS[doing.kind] : RESTING)

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
}

/** Nothing anybody remembers. See above — this is a state worth showing. */
export const IDLE: Mood = { glyph: '?', colour: '#7a7a95' }

export const moodOf = (doing: Memory | null): Mood => (doing ? MOOD[doing.kind] : IDLE)
