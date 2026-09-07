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
 * The whole yard, placed.
 *
 * Furniture goes down first and keeps its cell, because a cat standing near the
 * toy is the thing being shown; a toy shoved aside by a cat would break it.
 */
export function layout(y: YardState): Placed[] {
  const props = propCells(y)
  const taken = new Set<number>()
  const out: Placed[] = []

  for (const [prop, cell] of props) {
    taken.add(key(cell))
    out.push({ what: 'prop', cell, prop })
  }

  /* The newest memory each cat appears in — what it is currently doing. */
  const last = new Map<string, Memory>()
  for (const m of y.kept) { last.set(m.a, m); last.set(m.b, m) }

  const placed = new Map<string, Cell>()

  for (const cat of y.cats) {
    const doing = last.get(cat.uid) ?? null
    const r = rng((y.seed ^ hash(cat.uid) ^ Math.imul(y.ticks + 1, 0x85ebca6b)) | 0)

    /* Its own spot, when it has done nothing anybody remembers. */
    let want: Cell = {
      x: Math.floor(r() * COLS),
      y: Math.floor(r() * ROWS),
    }

    if (doing) {
      const wants = NEEDS[doing.kind]
      const propCell = wants ? props.get(wants) : undefined
      if (propCell) {
        // It used furniture, so it is at the furniture.
        want = beside(propCell, r)
      } else {
        /*
         * It was with another cat. Stand by them — and if they have not been
         * placed yet, take a spot and let THEM come to US, which is the same
         * arrangement either way round.
         */
        const otherUid = doing.a === cat.uid ? doing.b : doing.a
        const there = placed.get(otherUid)
        if (there) want = beside(there, r)
      }
    }

    const cell = free(want, taken)
    taken.add(key(cell))
    placed.set(cat.uid, cell)
    out.push({ what: 'cat', cell, cat, doing })
  }

  return out
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
