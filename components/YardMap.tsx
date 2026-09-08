'use client'

import { useEffect, useMemo, useState } from 'react'
import { COLS, ROWS, DOING, layout, layoutAt, moodOf, poseOf, type Placed } from '@/lib/yardmap'
import { bond, reads, temperOf, type PropKind, type YardState } from '@/lib/yard'
import { ITEMS, skinOf } from '@/lib/items'
import { ASKS, ANSWER, MOOD_GLYPH, MOOD_INK, type Mood } from '@/lib/mood'

/**
 * THE YARD, DRAWN — a Dwarf Fortress overworld at cat scale.
 *
 * ── NOTHING MOVES, AND THAT IS THE POINT ─────────────────────────────────────
 *
 * DF's overworld is read, not watched. A creature is one tile that is simply
 * there. That is the whole reason this can exist: the cats are portraits with no
 * walk cycles, and a tile does not need one.
 *
 * So there is no animation loop here and no saved positions. `layout()` is a pure
 * function of the yard state, called on render. The map cannot fall out of step
 * with the simulation because it IS the simulation, arranged.
 *
 * ── THE GROUND IS DF's GROUND ────────────────────────────────────────────────
 *
 * Grass in DF is `"` and `,` scattered over dark green. Kept, because it is the
 * single thing that makes a grid read as a world rather than a spreadsheet, and
 * it costs one character per cell. Seeded per cell, so the ground does not crawl
 * between renders.
 *
 * ── TAP, NOT HOVER ───────────────────────────────────────────────────────────
 *
 * Same rule the text yard already follows: most traffic here is a phone, where
 * hover does not exist. Selection is a tap that also answers to a mouse and to
 * the keyboard, rather than a hover that most people would never trigger.
 */

/** What each one lets the cats DO. The picture says what it is; this says what it changes. */
const PROP_WHY: Record<PropKind, string> = {
  toy:   'to play with',
  bowl:  'to share',
  perch: 'to show off on',
  wash:  'to groom with',
}

/**
 * A GARDEN, NOT A DUNGEON FLOOR.
 *
 * JP: "we just need a nice little yard for our cats to play in… update the grass
 * so it doesn't look like poop green. I would be inspired by games like the Chao
 * Garden, combining that with the dwarf fortress aesthetic of looking into the
 * thoughts of our own cats."
 *
 * That is the split, and it is the right one. DF supplies the READING — a tile
 * map, a creature you can open up and find a history in. It does not have to
 * supply the LOOK, and it was: a dark olive field is what a fortress floor looks
 * like a mile underground, and this is a garden in daylight with pets in it.
 *
 * So the ground is grass now. Bright enough to read as somewhere pleasant, muted
 * enough that the hand-drawn cats stay the brightest thing on it — a neon field
 * would fight the art rather than hold it.
 *
 * ── DAY AND NIGHT ARE STILL HERE, BUT THEY STOPPED BEING A FEATURE ───────────
 *
 * JP: "day or night cycles don't really matter at this point in time."
 *
 * They were nearly invisible anyway — measured across a full cycle the field
 * only moved between 5% and 13% luminance, so both ends read as black and the
 * clock digits were the only thing telling you the hour.
 *
 * Not deleted, because the clock is free and it is one line either way. Night is
 * a soft evening now rather than an attempt at darkness: the same garden later
 * in the day, still legible, no longer pretending to be a mechanic.
 */
/*
 * `soil` is THREE shades picked per tile by `soilOf`; `grass` is TWO picked per
 * blade by `ground`. Both were single values and both read as flat — a field of
 * one colour is a table, and one ink for every mark is the same mistake again.
 */
/*
 * THE SHADES ARE CLOSE TOGETHER, AND THEY HAVE TO BE NOW.
 *
 * Three soil values a few points apart were invisible on the old dark field and
 * did a useful job there — they stopped it reading as one flat sheet. Repainted
 * as daylight grass the SAME spread became a quilt: every tile a different
 * green, the lattice between them dark, the whole thing a checkerboard.
 *
 * A lawn is not a patchwork. The variation is barely-there now — enough that the
 * field is not one solid fill, not enough to see a tile unless you look for it —
 * and the grid line sits just under the soil rather than under everything.
 */
const DAY = {
  grid: '#5a9a4e',
  /* A furnished tile is the same ground as the rest. Nothing repaints the field. */
  prop: '#61a054',
  /* Two greens for the tufts — one catching light, one in shade. */
  grass: ['#86d16f', '#4c8742'],
  soil: ['#61a054', '#64a457', '#5e9c51'],
}

const NIGHT = {
  grid: '#44724a',
  prop: '#4a7c4a',
  grass: ['#66a765', '#3a6c42'],
  soil: ['#4a7c4a', '#4d804d', '#477848'],
}

/**
 * HOW MUCH OF THE DAY IS REPLAYED, and how fast.
 *
 * JP: "a little bit more dwarf fortress… it shouldn't be interpolated. It should
 * be sprite work. It should just be instant."
 *
 * NOTHING TWEENS. A creature in DF is on one tile this frame and another the
 * next; there is no in-between, because there is no in-between to draw. Sliding a
 * portrait across the ground was the thing this file argued against in the first
 * place, and a tween is exactly that slide with easing on it.
 *
 * So the STEP is the animation, and each one lands as a hard cut. Faster reads as
 * flicker; slower and you are waiting between frames.
 *
 * TWENTY-FOUR TICKS because it now LOOPS rather than running once — a full day,
 * which is also exactly as much as a visit ever plays out. Ten made the repeat
 * obvious; a day at 550ms is thirteen seconds, which is long enough that it reads
 * as the yard getting on with itself rather than as a cycle.
 */
const REPLAY_TICKS = 24
const STEP_MS = 550

/** One tile's hash, salted so several questions about the same tile disagree. */
function at(x: number, y: number, seed: number, salt: number): number {
  let h = (Math.imul(x + 1, 0x9e3779b9) ^ Math.imul(y + 1, 0x85ebca6b) ^ seed ^ salt) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0
  return (h ^ (h >>> 15)) >>> 0
}

/** A blade of grass: which mark, and which of the two greens it is drawn in. */
type Blade = { ch: string; shade: 0 | 1 }

/**
 * The marks. Weighted by repetition rather than by a table of numbers — the
 * comma and the quote are what DF's grass mostly is, and the rest are seasoning.
 */
const MARKS = [',', ',', '"', '"', "'", '.', '`', "'"]

/**
 * WHAT IS GROWING ON THIS TILE, or nothing.
 *
 * ── IT CLUMPS NOW, AND THAT IS THE WHOLE POINT ───────────────────────────────
 *
 * The first version put a mark on ten tiles in sixteen, chosen per tile,
 * independently. Independent means EVEN — every part of the field got the same
 * ten in sixteen, so the ground read as uniform static rather than as ground.
 * Nothing in a yard is distributed that way.
 *
 * A second, COARSER hash over 2x2 blocks decides whether a patch is thick or
 * worn first, and the per-tile roll happens inside that. So the field grows in
 * clumps with bare earth between them, which is what makes it look like
 * somewhere rather than like noise.
 *
 * ── TWO GREENS ───────────────────────────────────────────────────────────────
 *
 * One ink for every mark is the other half of "even". A second shade costs a bit
 * of the same hash and gives the field depth — some blades nearer, some further.
 *
 * Still fully deterministic from the tile and the seed: two yards differ, one
 * yard never shimmers between renders.
 */
/**
 * PATCHES ARE 3x3 AND THE CONTRAST IS SHARP, and both numbers are measured.
 *
 * At 2x2 blocks and 13-vs-4 density the clumping was real but barely there: two
 * neighbouring tiles were both grass 25% of the time against 19% by chance. A
 * clump you have to measure to notice is not a clump.
 *
 * Two tiles is also simply too small to read as a patch on a 13-wide map — half
 * of every horizontal pair straddled a block boundary, so half the correlation
 * was thrown away before it reached the screen.
 */
function ground(x: number, y: number, seed: number): Blade | null {
  const thick = at(Math.floor(x / 3), Math.floor(y / 3), seed, 0x51ed29) % 20 < 11
  const h = at(x, y, seed, 0)
  if (h % 16 >= (thick ? 14 : 2)) return null
  return { ch: MARKS[(h >>> 8) % MARKS.length], shade: ((h >>> 16) & 1) as 0 | 1 }
}

/**
 * WHICH OF THREE SHADES THIS TILE'S SOIL IS.
 *
 * A field of one colour is a table, not a ground. Three shades a few points
 * apart break the flatness without becoming a pattern anybody can read — the
 * eye stops seeing a spreadsheet and starts seeing dirt.
 *
 * A DIFFERENT HASH FROM `ground`. Sharing one would tie the mark to the shade
 * and lay a visible grid over the whole map.
 */
function soilOf(x: number, y: number, seed: number): number {
  const h = Math.imul(x + 3, 0x27d4eb2d) ^ Math.imul(y + 7, 0x165667b1) ^ seed
  return (h >>> 0) % 3
}

export function YardMap({
  yard, mine, onFurnish, picked, onPick, replay = false, mood, onAnswer,
}: {
  yard: YardState
  mine: string[]
  /**
   * WHO IS SELECTED, owned by the caller.
   *
   * The map kept this itself, which was right while it was the only thing that
   * cared. The yard's own page shows a full sheet for the selected cat, so the
   * selection has to be visible above the map — and two copies of it would let
   * the ringed tile and the open sheet name different cats.
   */
  picked?: string | null
  onPick?: (uid: string | null) => void
  /** Walk the cats through the last few ticks on mount, rather than snapping to now. */
  replay?: boolean
  /** Toggles ONE prop. The store decides what is out there, which is what stops
   *  three quick taps from clobbering each other. */
  onFurnish?: (prop: PropKind) => void
  /**
   * THE CAT ASKING FOR SOMETHING TODAY, if there is one.
   *
   * Passed in rather than worked out here, because what can ANSWER a mood
   * depends on where the yard is mounted — the front page can start a fight and
   * the yard's own page cannot.
   */
  mood?: Mood | null
  /** Answers it. Absent wherever there is nothing to answer it with. */
  onAnswer?: (uid: string) => void
}) {
  /* Uncontrolled on the front page, controlled on the yard's own. */
  const [ownPick, setOwnPick] = useState<string | null>(null)
  const sel_uid = picked !== undefined ? picked : ownPick
  const setPick = (u: string | null) => (onPick ? onPick(u) : setOwnPick(u))

  /*
   * THE MAP MOVES BY WINDING THE CLOCK, not by animating anything itself.
   *
   * Positions are a pure function of the yard, so laying out an earlier tick
   * gives where everybody WAS, and stepping the tick forward walks them to where
   * they are now. The movement is a CSS transition between two truthful states —
   * there is no animation loop and nothing to fall out of step with the sim.
   *
   * Which also answers the objection this file was built around. Sliding a
   * portrait to a place it never was would be faking it; moving it to the tile
   * the simulation actually put it on is not.
   */
  const [at, setAt] = useState<number | null>(null)

  useEffect(() => {
    if (!replay || !yard.ticks) { setAt(null); return }

    // Only the recent stretch. Replaying a whole day is a minute of watching.
    const from = Math.max(0, yard.ticks - REPLAY_TICKS)
    if (from >= yard.ticks) { setAt(null); return }

    // Somebody who asked for less motion gets the end state and no journey.
    const still = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (still) { setAt(null); return }

    /*
     * IT KEEPS GOING AS LONG AS THE SCREEN IS UP.
     *
     * JP: "this should be going as long as the screen is up."
     *
     * It used to run the window once and stop, which left the yard frozen the
     * moment you had watched it — a dead map under a live page.
     *
     * IT LOOPS RATHER THAN TICKING FOR REAL, and that is on purpose. Advancing
     * the simulation while somebody watches would break the scale the whole thing
     * is tuned on: one tick is one HOUR, a memory lasts 24 of them, and a bond has
     * to be kept up daily. Leave the tab open for ten minutes at this pace and a
     * week of yard time would pass, memories would churn through their span, and
     * "come back tomorrow" would stop meaning anything.
     *
     * So the day plays and plays again. Nothing is invented — it is the hours
     * that actually happened, on repeat.
     */
    setAt(from)
    let t = from
    const id = setInterval(() => {
      t = t + 1 >= yard.ticks ? from : t + 1
      setAt(t)
    }, STEP_MS)
    return () => clearInterval(id)
  }, [replay, yard.ticks, yard.seed])

  const placed = useMemo(() => (at === null ? layout(yard) : layoutAt(yard, at)), [yard, at])

  /* The turn being shown, which is what every pose is keyed on. */
  const shownTick = at === null ? yard.ticks : at

  /*
   * WHAT TIME IT IS: THE PLAYER'S OWN CLOCK.
   *
   * JP: "the timing looks weird in terms of the day and night cycles. Just make
   * it, like, a regular twenty four hour clock."
   *
   * It used to be `yard.ticks % 24`, and that was the weirdness. `ticks` counts
   * from whenever this yard was first opened, so hour 0 was not midnight — it was
   * whatever moment the player happened to press the button, and every hour after
   * it was offset by that. Open the yard at nine in the morning and it could
   * honestly tell you it was 02:00 and draw a moon.
   *
   * AND THE REPLAY MADE IT STROBE, which is the part you actually see. The map
   * loops 24 ticks at 550ms, so the clock ran a whole day every THIRTEEN SECONDS
   * — measured on the page: 05:00 06:00 07:00 … 18:00 in eight seconds flat, sun
   * up and moon out and up again, over and over.
   *
   * THE REPLAY MOVES THE CATS. IT DOES NOT MOVE THE SUN. That is the fix and it
   * is the whole of it: where a cat is standing is a fact about a past hour, and
   * what time it is, is a fact about now. Tying the second to the first was the
   * mistake. The clock is the wall clock, it changes once an hour, the sun comes
   * up at 06:00 and goes down at 18:00.
   *
   * Null until mounted, on purpose. This is a client component and Next still
   * renders it on the server for the first HTML — reading the clock in a `useState`
   * initialiser would put the server's hour in that HTML and the browser's hour in
   * the first render, which is a hydration mismatch. Midday is the stand-in for
   * one frame.
   */
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const read = () => setNow(new Date().getHours())
    read()
    /* Once a minute is plenty to catch an hour turning over, and it is free. */
    const id = setInterval(read, 60_000)
    return () => clearInterval(id)
  }, [])

  const hour = now ?? 12
  const night = hour < 6 || hour >= 18
  const sky = night ? NIGHT : DAY

  const byCell = useMemo(() => {
    const m = new Map<number, Placed>()
    for (const p of placed) m.set(p.cell.y * COLS + p.cell.x, p)
    return m
  }, [placed])

  const sel = placed.find(p => p.what === 'cat' && p.cat.uid === sel_uid) as
    (Placed & { what: 'cat' }) | undefined

  /*
   * The bond shown is against YOUR cat, because that is the only one the reader
   * has a stake in. With several of your own in the yard, the first is used —
   * a row of five bonds on one tap would be a table, not an answer.
   */
  /*
   * THE CAT ASKING, resolved against what is actually on the map. A mood names a
   * uid; a cat can leave the yard between the mood being worked out and this
   * being drawn, and a strip about a cat that is not here would be a ghost.
   */
  const asker = mood
    ? (placed.find(q => q.what === 'cat' && q.cat.uid === mood.uid) as (Placed & { what: 'cat' }) | undefined)
    : undefined

  const anchor = mine.find(u => u !== sel?.cat.uid) ?? null
  const b = sel && anchor ? bond(yard, sel.cat.uid, anchor) : null

  return (
    <div>
      {/*
        THE GROUND AND THE FURNITURE ARE THE GRID. THE CATS ARE NOT.

        They used to be cells, which is why nothing could move: a cell is where it
        is. The cats are now laid over the grid and positioned by transform, so a
        change of tick is a transition rather than a re-parenting.

        The grid still draws the ground and the props, because those genuinely do
        not move — furniture keeps its cell for the life of the yard.
      */}
      {/*
        THE CLOCK IS ABOVE THE MAP, NOT ON IT.

        A badge in the corner would sit over a cell, and every cell in a 13-wide
        grid is somewhere a cat can stand. A roguelike puts its clock in the
        status line for the same reason.
      */}
      <div style={s.sky} aria-hidden>
        <img src={`/yard/items/${night ? 'moon' : 'sun'}.png`} alt="" style={s.skyArt} />
        <span>{String(hour).padStart(2, '0')}:00</span>
      </div>

      <div style={{ ...s.grid, background: sky.grid }}>
        {Array.from({ length: COLS * ROWS }, (_, i) => {
          const x = i % COLS, y = Math.floor(i / COLS)
          const here = byCell.get(i)

          if (here?.what === 'prop') {
            const item = skinOf(here.prop, yard.seed)
            return (
              <div key={i} style={{ ...s.cell, background: sky.prop }} title={item.label}>
                <img src={`/yard/items/${item.file}.png`} alt="" style={s.propArt} />
              </div>
            )
          }

          const blade = ground(x, y, yard.seed)
          return (
            <div
              key={i}
              style={{ ...s.cell, background: sky.soil[soilOf(x, y, yard.seed)] }}
              aria-hidden
            >
              {blade && (
                <span style={{ ...s.grass, color: sky.grass[blade.shade] }}>{blade.ch}</span>
              )}
            </div>
          )
        })}

        <div style={s.overlay}>
          {placed.filter(p => p.what === 'cat').map(p => {
            const here = p as Placed & { what: 'cat' }
            const isMine = mine.includes(here.cat.uid)
            const on = sel_uid === here.cat.uid
            /*
             * A CAT IN A MOOD OVERRIDES ITS OWN MOOD GLYPH.
             *
             * The glyph says what a cat is doing, and a cat that is ASKING for
             * something is not doing anything else — that is the whole point of
             * DF's mood. It takes the marker over.
             */
            const asking = mood?.uid === here.cat.uid
            const glyph = asking
              ? { glyph: MOOD_GLYPH, colour: MOOD_INK }
              : moodOf(here.doing)
            return (
              <button
                /*
                 * KEYED ON THE CAT, not on its cell. Keying by position would
                 * unmount and remount the element every time it moved, and a
                 * remounted element has no previous value to transition FROM —
                 * the same trap the health bar hit in Cradle.tsx.
                 */
                key={here.cat.uid}
                onClick={() => setPick(on ? null : here.cat.uid)}
                title={here.cat.name}
                aria-label={`${here.cat.name}, ${here.doing ? DOING[here.doing.kind] : 'keeping to itself'}`}
                style={{
                  ...s.catCell,
                  background: sky.soil[soilOf(here.cell.x, here.cell.y, yard.seed)],
                  transform: `translate(${here.cell.x * 100}%, ${here.cell.y * 100}%)`,
                  /*
                   * THE RING IS ON THE CAT NOW, not on the tile — see `art`.
                   * A tile-wide ring around an inset cat outlines the GROUND it
                   * is standing on, which is not the thing being pointed at.
                   */
                  zIndex: on ? 3 : 2,
                }}
              >
                {/*
                  THE ANIMATION IS ON THE PORTRAIT, never on the tile. The tile's
                  transform is its POSITION on the grid, and every one of these
                  animates transform too — put one on the tile and the cat snaps
                  to the top-left corner for as long as it plays.
                */}
                {/*
                  THE POSE IS ON THE PORTRAIT, never on the tile — the tile's
                  transform is its position, and a pose there would overwrite it.

                  No animation and no transition: it is a whole number of pixels
                  held until the tick changes, and cut to when it does.
                */}
                {here.cat.art
                  ? <img
                      src={here.cat.art}
                      alt=""
                      style={{
                        ...s.art,
                        transform: poseOf(here.doing, shownTick),
                        /*
                         * Your own cats are ringed. In a yard of strangers' cats
                         * the first question is always which ones are yours —
                         * and the ring travels with the pose, so a cat that
                         * shoves takes its outline with it.
                         */
                        outline: on ? '2px solid #e0a72c' : isMine ? '2px solid #7c3aed' : 'none',
                        outlineOffset: 1,
                      }}
                    />
                  : <span style={{ ...s.fallback, transform: poseOf(here.doing, shownTick) }}>{here.cat.name.slice(0, 1).toUpperCase()}</span>}
                {/*
                  THE MOOD SITS ON THE CAT, not beside it. There is no spare cell
                  to put it in — the grid is 13 wide on a phone — and a glyph in
                  the corner is what DF does anyway.

                  aria-hidden because the button's own label already says what the
                  cat is doing in words; a screen reader announcing "exclamation
                  mark" after "saying hello" is the same fact twice.
                */}
                {/*
                  IT BLINKS, AND THAT IS NOT A CONTRADICTION.

                  JP: "they should be blinking like dwarf fortress."

                  The POSE changes only on the turn, because a pose is world
                  state. A blink is not — it is the display asking to be looked
                  at, and in DF it runs on its own regardless of the game clock,
                  the way the cursor and a warning do.

                  `cradle-blink` is the app's own, at the timing render.mjs uses
                  for CAUTION!/PERIL!, and its stops are 0%/49.9% then 50%/100% —
                  a hard on and off with nothing to interpolate between.

                  ONLY WHEN SOMETHING IS HAPPENING. The idle "?" holds steady: a
                  blink is for attention, and every quiet cat flashing would be
                  noise rather than a signal.
                */}
                <span
                  aria-hidden
                  style={{
                    ...s.mood,
                    color: glyph.colour,
                    /*
                     * An asking cat ALWAYS blinks, even standing still. The idle
                     * "?" holds steady because a quiet cat is not a signal; a cat
                     * waiting on you is the most a signal ever gets in here.
                     */
                    animation: asking || here.doing
                      ? 'cradle-blink 0.74s steps(1, end) infinite'
                      : undefined,
                  }}
                >
                  {glyph.glyph}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/*
        ONE LINE UNDER THE MAP, not a panel beside it. The map is already the
        width of a phone; anything alongside it would push the grid narrower than
        the tiles need to stay legible.
      */}
      <div style={s.readout}>
        {sel ? (
          <>
            <b style={{ color: '#e6e6f0' }}>{sel.cat.name}</b>
            <span style={{ color: '#8a8aa0' }}>
              {/*
                WHOSE IT IS, which used to live in a hover card over the log. The
                log is drawn in the bitmap font now and cannot carry a handler per
                word, so the one fact that card had and this line did not has moved
                here — where a tap already brings up everything else about the cat.
              */}
              {' · '}{mine.includes(sel.cat.uid) ? 'yours'
                : sel.cat.owner ? '@' + sel.cat.owner.username
                : sel.cat.demo ? "somebody's"
                : 'somebody you follow'}
              {' · '}{temperOf(sel.cat.face).label}
              {sel.doing ? ' · ' + DOING[sel.doing.kind] : ' · keeping to itself'}
              {b !== null ? ` · ${reads(b)} with yours` : ''}
            </span>
          </>
        ) : (
          <span style={{ color: '#55556a' }}>
            {yard.props.length
              ? 'Tap a cat.'
              : 'Tap a cat. Nothing to play with out here yet.'}
          </span>
        )}
      </div>

      {/*
        THE ONE THING IN HERE THAT WANTS SOMETHING FROM YOU.

        JP: "in Dwarf Fortress there are strange moods, which dwarves need to do
        something before they do anything… some cats will seek to go outside, and
        this is how they go into their quick fights. You click on the cat and it
        says your cat wants to go outside, and then it'll have an option to go
        with the quick fight."

        ABOVE THE SHELF, NOT IN THE READOUT. The readout answers "what am I
        looking at" and changes every time you tap; this is the yard asking for
        something and it has to stay put until it is answered. It is also the
        only row in here that is ever about something OUTSIDE the yard.

        Shown whoever the cat belongs to — a strange mood is worth seeing in a
        stranger's yard too — but only answerable when there is something to
        answer it with, which is why onAnswer decides the button and not the copy.
      */}
      {mood && asker && (
        <div style={s.ask}>
          <button onClick={() => setPick(asker.cat.uid)} style={s.askWho}>
            <span style={{ color: MOOD_INK }}>{MOOD_GLYPH}</span>
            <span>{ASKS[mood.want].replace('{name}', asker.cat.name)}</span>
          </button>
          {onAnswer && mine.includes(asker.cat.uid) && (
            <button onClick={() => onAnswer(asker.cat.uid)} style={s.askGo}>
              {ANSWER[mood.want]}
            </button>
          )}
        </div>
      )}

      {/*
        PUTTING THINGS OUT.

        This is the only control on the yard, and it is deliberately the only one:
        you do not steer the cats, you decide what is available to them. An empty
        yard measured 84 squabbles over 200 ticks and no play at all; one toy took
        squabbles to 30. Furnishing IS the input.

        Worded as what it does, not as an inventory. "A toy" would read as a thing
        you own; "something to play with" says what changes.
      */}
      {onFurnish && (
        <div style={s.shelf}>
          {(Object.keys(ITEMS) as PropKind[]).map(p => {
            const out = yard.props.includes(p)
            const item = skinOf(p, yard.seed)
            return (
              <button
                key={p}
                onClick={() => onFurnish(p)}
                aria-pressed={out}
                style={{ ...s.shelfBtn, ...(out ? s.shelfOn : null) }}
              >
                <img src={`/yard/items/${item.file}.png`} alt="" style={s.shelfArt} />
                <span>{PROP_WHY[p]}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: `repeat(${COLS}, 1fr)`,
    gap: 1,
    // DF's ground is dark. The gap shows through as the grid line.
    background: '#14180f',
    border: '1px solid #23281a',
    borderRadius: 6,
    padding: 1,
    width: '100%',
    position: 'relative',
  },
  cell: {
    aspectRatio: '1',
    background: '#1a2013',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    border: 'none',
    minWidth: 0,
  },
  /* 11, not 10: at 26px tiles the marks were small enough to read as dust. */
  grass:    { fontSize: 11, lineHeight: 1, userSelect: 'none' },
  /*
   * THE OVERLAY sits exactly over the grid's cells. It is inset by the same 1px
   * padding the grid carries, so a cat at (0,0) lands on the first cell rather
   * than a pixel off it.
   *
   * pointerEvents none on the layer, auto on each cat: the gaps between cats must
   * not swallow a tap meant for the page.
   */
  overlay: {
    position: 'absolute', left: 1, top: 1, right: 1, bottom: 1,
    pointerEvents: 'none',
  },
  catCell: {
    position: 'absolute', left: 0, top: 0,
    width: `calc(100% / ${COLS})`, height: `calc(100% / ${ROWS})`,
    // The gap the grid draws between cells, so an overlaid cat matches a prop.
    padding: 0, border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', overflow: 'hidden', background: '#1a2013',
    pointerEvents: 'auto',
    /*
     * TRANSFORM, not left/top. A transform is composited rather than re-laying
     * the page out on every frame, and it is the property the browser will
     * animate cheaply with nine of these moving at once.
     */
    /*
     * NOTHING TRANSITIONS. Not the position, not the ring.
     *
     * The transform was already instant; the ring still eased its colour, which
     * is a small thing that was still the wrong thing. "NO INTERPOLATION" is a
     * rule about the whole surface, not just about walking.
     */
  },
  /*
   * 84%, NOT 100% — A CAT STANDS ON A TILE, IT IS NOT THE TILE.
   *
   * Full bleed made every cat a hard-edged saturated rectangle butted against
   * its neighbours, which is why the map read as a row of stickers on a dark
   * sheet rather than as creatures on ground. Two pixels of soil showing on each
   * side is the whole difference: the ground goes UNDER them, the grid line stays
   * visible between two cats standing together, and the eye reads a map.
   *
   * It also fixes the pose. A shove of a quarter-tile on a full-bleed portrait
   * clipped against the tile's overflow; there is somewhere to move to now.
   */
  art: {
    width: '84%', height: '84%',
    objectFit: 'cover', imageRendering: 'pixelated', display: 'block',
    borderRadius: 2,
  },
  fallback: { fontSize: 11, color: '#cfcfe0' },
  /*
   * SMALL, TOP RIGHT, AND OUTLINED. It sits on top of a full-colour portrait,
   * so a plain glyph would vanish over a pale cat and over a dark one both. The
   * shadow is a ring rather than a drop, which keeps it legible whatever is
   * underneath without reading as a second element.
   *
   * pointerEvents none so it never eats the tap meant for the cat.
   */
  mood: {
    // NOT a negative offset: the tile clips its overflow to keep the portrait
    // square, so -1 quietly shaved the top off every glyph.
    position: 'absolute', top: 0, right: 1,
    fontSize: 12, lineHeight: 1, fontWeight: 'bold',
    textShadow: '0 0 2px #000, 0 0 2px #000, 0 1px 2px #000',
    pointerEvents: 'none', userSelect: 'none',
  },
  /*
   * 82%, not 100%. The drawings are trimmed to their own ink, so filling the
   * cell would put a banana and a stick of gum at the same size and butt every
   * one of them against the grid line. Inset, they read as things standing ON
   * the ground rather than as tiles of it.
   */
  propArt:  { width: '82%', height: '82%', objectFit: 'contain', display: 'block', userSelect: 'none' },
  sky: {
    display: 'flex', alignItems: 'center', gap: 5,
    marginBottom: 6, fontSize: 11, color: '#55556a',
    letterSpacing: 0.5,
  },
  skyArt:   { width: 14, height: 14, objectFit: 'contain', display: 'block' },
  shelfArt: { width: 16, height: 16, objectFit: 'contain', display: 'block' },
  readout:  { marginTop: 8, fontSize: 12, minHeight: 18, lineHeight: 1.4 },
  /*
   * Gold, and the only gold thing under the map. It is the one row that is not a
   * report — everything else here says what happened, this asks.
   */
  ask: {
    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    marginTop: 8, padding: '7px 10px', borderRadius: 8,
    background: '#1c1a10', border: '1px solid #4a3d16',
  },
  askWho: {
    display: 'flex', alignItems: 'baseline', gap: 6,
    background: 'none', border: 0, padding: 0, cursor: 'pointer',
    font: 'inherit', fontSize: 12, color: '#e0c88a', textAlign: 'left',
  },
  askGo: {
    marginLeft: 'auto',
    padding: '5px 12px', borderRadius: 999,
    background: '#e0a72c', border: '1px solid #e0a72c', color: '#1a1a1a',
    font: 'inherit', fontSize: 12, cursor: 'pointer',
  },
  shelf:    { display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  shelfBtn: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '6px 10px', borderRadius: 999,
    background: '#12121c', border: '1px solid #23232e',
    color: '#6a6a80', fontSize: 11, cursor: 'pointer',
  },
  /*
   * THE WHOLE `border`, not just its colour. React warns outright when a
   * shorthand and its longhand are mixed on the same element across a state
   * change — it has to remove one to apply the other, and which wins depends on
   * order rather than on intent.
   */
  shelfOn:  { background: '#1c2416', border: '1px solid #3c5a28', color: '#a7c98a' },
}
