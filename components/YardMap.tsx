'use client'

import { useMemo, useState } from 'react'
import { COLS, ROWS, DOING, layout, moodOf, type Placed } from '@/lib/yardmap'
import { bond, reads, temperOf, type PropKind, type YardState } from '@/lib/yard'

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

/*
 * OLD EMOJI ONLY, and that is a bug fix rather than taste. The perch was 🪵,
 * which is Emoji 13 (2020) and rendered as an empty box on this Windows build —
 * a piece of furniture the player cannot see is worse than a plainer one.
 *
 * All three below are Emoji 1.0 or close to it, so they are drawn everywhere.
 */
const PROP_GLYPH: Record<PropKind, { icon: string; label: string }> = {
  toy:   { icon: '🧶', label: 'a ball of yarn' },
  bowl:  { icon: '🥣', label: 'a food bowl' },
  perch: { icon: '🌳', label: 'a tree to sit in' },
}

/** What each one lets the cats DO. Placeholder wording, JP's to replace. */
const PROP_WHY: Record<PropKind, string> = {
  toy:   'to play with',
  bowl:  'to share',
  perch: 'to show off on',
}

/** DF grass, scattered deterministically so it does not crawl on re-render. */
function ground(x: number, y: number, seed: number): string {
  const h = Math.imul(x + 1, 0x9e3779b9) ^ Math.imul(y + 1, 0x85ebca6b) ^ seed
  const n = (h >>> 0) % 16
  return n < 2 ? '"' : n < 5 ? ',' : n < 6 ? '.' : ''
}

export function YardMap({
  yard, mine, onFurnish, picked, onPick,
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
  /** Toggles ONE prop. The store decides what is out there, which is what stops
   *  three quick taps from clobbering each other. */
  onFurnish?: (prop: PropKind) => void
}) {
  /* Uncontrolled on the front page, controlled on the yard's own. */
  const [ownPick, setOwnPick] = useState<string | null>(null)
  const sel_uid = picked !== undefined ? picked : ownPick
  const setPick = (u: string | null) => (onPick ? onPick(u) : setOwnPick(u))

  const placed = useMemo(() => layout(yard), [yard])

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
  const anchor = mine.find(u => u !== sel?.cat.uid) ?? null
  const b = sel && anchor ? bond(yard, sel.cat.uid, anchor) : null

  return (
    <div>
      <div style={s.grid}>
        {Array.from({ length: COLS * ROWS }, (_, i) => {
          const x = i % COLS, y = Math.floor(i / COLS)
          const here = byCell.get(i)

          if (here?.what === 'cat') {
            const isMine = mine.includes(here.cat.uid)
            const on = sel_uid === here.cat.uid
            const mood = moodOf(here.doing)
            return (
              <button
                key={i}
                onClick={() => setPick(on ? null : here.cat.uid)}
                title={here.cat.name}
                aria-label={`${here.cat.name}, ${here.doing ? DOING[here.doing.kind] : 'keeping to itself'}`}
                style={{
                  ...s.cell,
                  ...s.catCell,
                  // Your own cats are ringed. In a yard of strangers' cats the
                  // first question is always which ones are yours.
                  outline: on ? '2px solid #e0a72c' : isMine ? '2px solid #7c3aed' : 'none',
                  outlineOffset: -2,
                }}
              >
                {here.cat.art
                  ? <img src={here.cat.art} alt="" style={s.art} />
                  : <span style={s.fallback}>{here.cat.name.slice(0, 1).toUpperCase()}</span>}
                {/*
                  THE MOOD SITS ON THE CAT, not beside it. There is no spare cell
                  to put it in — the grid is 13 wide on a phone — and a glyph in
                  the corner is what DF does anyway.

                  aria-hidden because the button's own label already says what the
                  cat is doing in words; a screen reader announcing "exclamation
                  mark" after "saying hello" is the same fact twice.
                */}
                <span aria-hidden style={{ ...s.mood, color: mood.colour }}>{mood.glyph}</span>
              </button>
            )
          }

          if (here?.what === 'prop') {
            return (
              <div key={i} style={{ ...s.cell, ...s.propCell }} title={PROP_GLYPH[here.prop].label}>
                <span style={s.propIcon}>{PROP_GLYPH[here.prop].icon}</span>
              </div>
            )
          }

          return (
            <div key={i} style={s.cell} aria-hidden>
              <span style={s.grass}>{ground(x, y, yard.seed)}</span>
            </div>
          )
        })}
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
          {(Object.keys(PROP_GLYPH) as PropKind[]).map(p => {
            const out = yard.props.includes(p)
            return (
              <button
                key={p}
                onClick={() => onFurnish(p)}
                aria-pressed={out}
                style={{ ...s.shelfBtn, ...(out ? s.shelfOn : null) }}
              >
                <span style={{ fontSize: 13 }}>{PROP_GLYPH[p].icon}</span>
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
  grass:    { color: '#2f4020', fontSize: 10, lineHeight: 1, userSelect: 'none' },
  catCell:  { cursor: 'pointer', overflow: 'hidden', background: '#1a2013', position: 'relative' },
  art:      { width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'pixelated', display: 'block' },
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
  propCell: { background: '#1f2617' },
  propIcon: { fontSize: 13, lineHeight: 1, userSelect: 'none' },
  readout:  { marginTop: 8, fontSize: 12, minHeight: 18, lineHeight: 1.4 },
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
