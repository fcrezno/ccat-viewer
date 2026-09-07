'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bond, reads, temperOf, waiting, type Memory, type Resident } from '@/lib/yard'
import { visit, furnish, MAX_TICKS, type Visit } from '@/lib/yardstore'
import { YardMap } from '@/components/YardMap'

/**
 * THE YARD — what your cats did with the cats of people you follow.
 *
 * JP: "for the yard we're still doing bromir text; but when interacting with cats
 * u can mouse over their name and see their pfp."
 *
 * ── A MAP AND A LOG, WHICH IS DWARF FORTRESS's ARRANGEMENT ───────────────────
 *
 * JP, 2026-09-07: "for the yard i would like it to be similar to the look of
 * dwarf fortress; but a very petit version… these cats arent mineing or anything;
 * so i would just like to focus on the social aspects."
 *
 * This file used to argue that a map was impossible, and the argument was sound
 * as far as it went: the cats are 250x199 PORTRAITS with no walk cycles, so a
 * garden of them milling about is not art this game has, and sliding portraits
 * around would look worse than saying what happened.
 *
 * A DF OVERWORLD NEEDS NO WALK CYCLE. Nothing animates — a creature is one tile
 * that is simply there, and the map is read rather than watched. That is exactly
 * what a portrait can do, so the objection was to ANIMATION, not to a map.
 *
 * The text stayed, because it carries the thing that actually matters, which is
 * HISTORY: a bond is the sum of what is still remembered. So the map says who is
 * stood with whom right now, and the lines below say how it got that way. See
 * components/YardMap.tsx.
 *
 * ── THE NAME IS THE PORTRAIT ─────────────────────────────────────────────────
 *
 * Every cat named in the text is hoverable, and hovering shows its face and whose
 * it is. That is what stops a wall of sentences being abstract: the cat that just
 * snubbed yours has an owner you follow, and it is one movement away.
 *
 * HOVER IS NOT ENOUGH ON ITS OWN. This is a mini app and most of its traffic is a
 * phone, where hover does not exist — so the same handler runs on tap and on
 * keyboard focus. A feature that only works with a mouse would be missing for
 * most people who see it.
 */

/*
 * WHAT EACH DEED READS AS.
 *
 * PLACEHOLDER PROSE, exactly like `reads()` in lib/yard.ts, and for the same
 * reason: this is JP's game and its voice is his. These say what happened
 * plainly so the mechanism can be judged, and nothing here should ship as the
 * final wording.
 */
/*
 * Written as the three pieces AROUND the two names, rather than as a sentence
 * with the names substituted back out of it.
 *
 * The first version built a sentence and split it apart on a regex to find where
 * the names went. It worked, and it would have broken the first time anybody
 * wrote a line whose wording did not fit the pattern — which is guaranteed, since
 * rewriting these is the entire point of them being placeholders.
 */
const SAYS: Record<Memory['kind'], [string, string, string]> = {
  greet:    ['', ' went over to say hello to ', '.'],
  play:     ['', ' and ', ' chased each other around.'],
  groom:    ['', ' cleaned ', "'s ears."],
  showoff:  ['', ' showed off in front of ', '.'],
  share:    ['', ' let ', ' eat first.'],
  snub:     ['', ' walked past ', ' without looking.'],
  squabble: ['', ' and ', ' fell out over nothing.'],
}

/* `art` now lives on Resident itself, because the map draws every cat. */
export type YardCat = Resident & {
  owner?: { fid: number; username: string; pfp: string | null } | null
  mine?: boolean
}

/** A cat's name in a sentence: hover, tap or focus to see whose it is. */
function CatName({ cat, on, off }: { cat: YardCat; on: () => void; off: () => void }) {
  return (
    <button
      type="button"
      onMouseEnter={on}
      onMouseLeave={off}
      onFocus={on}
      onBlur={off}
      // Tap is the phone's hover, and this is mostly a phone.
      onClick={e => { e.preventDefault(); on() }}
      style={{
        background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer',
        color: cat.mine ? '#ffd166' : '#c4b5fd',
        borderBottom: '1px dotted currentColor',
      }}
    >
      {cat.name}
    </button>
  )
}

export function Yard({ cats, busy }: { cats: YardCat[]; busy?: boolean }) {
  const [state, setState] = useState<Visit | null>(null)
  const [peek, setPeek] = useState<YardCat | null>(null)
  const clear = useRef<ReturnType<typeof setTimeout> | null>(null)

  const byUid = useMemo(() => new Map(cats.map(c => [c.uid, c])), [cats])

  /*
   * ONE VISIT PER LIST, GUARDED BY A REF — not just by the dependency array.
   *
   * `visit()` WRITES: it plays out the absence and stamps the clock. React invokes
   * effects TWICE in development, so the first call ran the nine hours and saved,
   * and the second read the fresh stamp back, found nothing elapsed, and rendered
   * THAT — the history happened and the account of it was thrown away.
   *
   * A dependency array cannot prevent this, because both invocations have the
   * same dependencies. The ref can, and it costs nothing in production where the
   * double invoke does not happen.
   */
  const key = cats.map(c => c.uid).sort().join(',')
  const visited = useRef<string | null>(null)
  useEffect(() => {
    if (!cats.length) { setState(null); visited.current = null; return }
    if (visited.current === key) return
    visited.current = key
    setState(visit(cats))
  }, [key])

  const show = useCallback((c: YardCat) => {
    if (clear.current) clearTimeout(clear.current)
    setPeek(c)
  }, [])
  const hide = useCallback(() => {
    // A short delay so moving between two names does not flicker the card away.
    if (clear.current) clearTimeout(clear.current)
    clear.current = setTimeout(() => setPeek(null), 120)
  }, [])

  if (busy) return <p style={fine}>reading the yard…</p>
  if (!cats.length) return null

  if (state && waiting(state.state)) {
    return (
      <p style={fine}>
        Only one cat here. Follow somebody who owns one and they will turn up.
      </p>
    )
  }
  if (!state) return <p style={fine}>reading the yard…</p>

  const name = (uid: string) => byUid.get(uid)
  const recent = state.happened.slice(-14).reverse()

  /* Every pair that has any history, strongest feeling first. */
  const pairs: { a: YardCat; b: YardCat; n: number }[] = []
  for (let i = 0; i < cats.length; i++) {
    for (let j = i + 1; j < cats.length; j++) {
      const n = bond(state.state, cats[i].uid, cats[j].uid)
      if (n !== 0) pairs.push({ a: cats[i], b: cats[j], n })
    }
  }
  pairs.sort((x, y) => Math.abs(y.n) - Math.abs(x.n))

  return (
    <div style={{ position: 'relative' }}>
      <p style={{ ...fine, marginBottom: 10 }}>
        {state.fresh
          ? `${cats.length} cats in the yard. Come back later and they will have got on with it.`
          : state.hours === 0
            ? 'Nothing new since you last looked in.'
            : `While you were away — ${state.hours} hour${state.hours === 1 ? '' : 's'}${
                state.hours >= MAX_TICKS ? ' (as much as the yard plays out)' : ''}.`}
      </p>

      {/*
        THE MAP SITS ABOVE THE LOG, which is DF's own arrangement: the world
        first, then the announcements about it. The map tells you the SHAPE of
        things — who is stood together, who is off on their own, what there is to
        do out there — and the lines below say what actually happened.
      */}
      <div style={{ marginBottom: 14 }}>
        <YardMap
          yard={state.state}
          mine={cats.filter(c => c.mine).map(c => c.uid)}
          onFurnish={prop => {
            const s = furnish(prop)
            // Null only before a first visit has been saved, which cannot be
            // reached from here — the map is not rendered until one has.
            if (s) setState({ ...state, state: s })
          }}
        />
      </div>

      {recent.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {recent.map((m, i) => {
            const a = name(m.a), b = name(m.b)
            if (!a || !b) return null
            const [before, mid, after] = SAYS[m.kind]
            return (
              <p key={i} style={say}>
                {before}
                <CatName cat={a} on={() => show(a)} off={hide} />
                {mid}
                <CatName cat={b} on={() => show(b)} off={hide} />
                {after}
              </p>
            )
          })}
        </div>
      )}

      {pairs.length > 0 && (
        <>
          <p style={label}>HOW THEY GET ON</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {pairs.slice(0, 8).map(({ a, b, n }) => (
              <p key={a.uid + b.uid} style={say}>
                <CatName cat={a} on={() => show(a)} off={hide} />
                {' and '}
                <CatName cat={b} on={() => show(b)} off={hide} />
                {' — '}
                <span style={{ color: n >= 15 ? '#5fc27e' : n <= -15 ? '#d1495b' : '#7a7a95' }}>
                  {reads(n)}
                </span>
              </p>
            ))}
          </div>
        </>
      )}

      {/*
        THE PEEK CARD. Pinned rather than following the cursor: a card that chases
        the pointer cannot exist on a phone, where the same interaction is a tap.
      */}
      {peek && (
        <div style={card} onMouseEnter={() => show(peek)} onMouseLeave={hide}>
          {peek.art
            ? <img src={peek.art} alt="" style={{ width: 64, height: 51, objectFit: 'cover',
                imageRendering: 'pixelated', borderRadius: 6, border: '1px solid #21212f' }} />
            : <div style={{ width: 64, height: 51, background: '#0b0b13', borderRadius: 6 }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: peek.mine ? '#ffd166' : '#f0f0f5' }}>{peek.name}</div>
            <div style={{ ...fine, margin: 0 }}>
              {peek.mine ? 'yours' : peek.owner ? `@${peek.owner.username}` : 'somebody you follow'}
              {' · '}{temperOf(peek.face).label}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const fine: React.CSSProperties = { color: '#63637d', fontSize: 11, margin: 0, lineHeight: 1.6 }
const say: React.CSSProperties = { color: '#a9a9c0', fontSize: 13, margin: 0, lineHeight: 1.6 }
const label: React.CSSProperties = { fontSize: 10, letterSpacing: 2, color: '#7a7a95', margin: '4px 0 8px' }
/*
 * THE CARD IS AS WIDE AS WHAT IS IN IT.
 *
 * It was full width, and it holds a 64px portrait and two short lines — a name
 * and an owner. Stretched across the column that left most of the box empty and
 * it read as a bar rather than a card, which is what made it look wrong sitting
 * under the map.
 *
 * `fit-content` shrink-wraps it. `maxWidth: 100%` keeps a long username from
 * pushing it past the column, and `minWidth: 0` on the text block inside lets the
 * name ellipsize rather than force the card wider.
 *
 * The bottom margin is not decoration either: sticky pins it 8px off the bottom
 * of the viewport, and without clearance it lands flush against the section's own
 * border and reads as cut off.
 */
const card: React.CSSProperties = {
  position: 'sticky', bottom: 8,
  marginTop: 12, marginBottom: 4,
  width: 'fit-content', maxWidth: '100%',
  display: 'flex', gap: 10, alignItems: 'center',
  background: '#12121c', border: '1px solid #21212f', borderRadius: 10, padding: 8,
  // It floats over the log when pinned, so it needs its own ground and a lift.
  boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
}
