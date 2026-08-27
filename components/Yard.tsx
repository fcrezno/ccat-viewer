'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bond, reads, temperOf, waiting, type Memory, type Resident } from '@/lib/yard'
import { visit, MAX_TICKS, type Visit } from '@/lib/yardstore'

/**
 * THE YARD — what your cats did with the cats of people you follow.
 *
 * JP: "for the yard we're still doing bromir text; but when interacting with cats
 * u can mouse over their name and see their pfp."
 *
 * ── IT IS TEXT, AND THAT IS THE DESIGN ───────────────────────────────────────
 *
 * No arena, no sprites walking about. The cats are 250x199 PORTRAITS, not
 * characters with walk cycles, so a garden of them milling around is not art this
 * game has — and faking it with sliding portraits would look worse than saying
 * what happened.
 *
 * Text also carries the thing that actually matters here, which is HISTORY. A
 * bond is the sum of what is still remembered, and a list of remembered events is
 * the most direct way to show that. The desktop build is where this becomes a
 * place you can walk around in.
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
  snub:     ['', ' walked past ', ' without looking.'],
  squabble: ['', ' and ', ' fell out over nothing.'],
}

export type YardCat = Resident & {
  art?: string
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
const card: React.CSSProperties = {
  position: 'sticky', bottom: 8, marginTop: 12, display: 'flex', gap: 10, alignItems: 'center',
  background: '#12121c', border: '1px solid #21212f', borderRadius: 10, padding: 8,
}
