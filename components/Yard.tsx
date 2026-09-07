'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bond, reads, temperOf, waiting, type Memory, type Resident } from '@/lib/yard'
import { visit, furnish, DEMO_KEY, MAX_TICKS, type Visit } from '@/lib/yardstore'
import { YardMap } from '@/components/YardMap'
import { CatSheet } from '@/components/CatSheet'

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
  /**
   * A cat in the DEMO yard: minted, owned by somebody real, but not reached
   * through anybody's follow graph. The address is known and the Farcaster
   * account behind it is not, so the copy must not claim one.
   */
  demo?: boolean
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
        /*
         * PAPER INKS. These were #ffd166 and #c4b5fd, which are for a dark
         * ground — on the log's paper they were very nearly invisible. The gold
         * is the same one the fight log prints a win in, so "this one is yours"
         * is the same colour in both places.
         */
        color: cat.mine ? '#a06a10' : '#5b3fa8',
        borderBottom: '1px dotted currentColor',
      }}
    >
      {cat.name}
    </button>
  )
}

/**
 * How many lines the log shows before it is opened.
 *
 * Three, because that is enough to see that something is HAPPENING without the
 * yard taking the whole screen it now sits at the top of. Two reads as a stub;
 * four starts pushing the rest of the page down again.
 */
const PREVIEW_LINES = 3

export function Yard({
  cats, busy, compact = false, full = false,
}: {
  cats: YardCat[]
  busy?: boolean
  /**
   * The front-door version: a short log that opens, and the pair list left for
   * the yard's own page.
   *
   * It is the SAME component rather than a second one. A separate preview would
   * be a second place to fix every bug found in the first — and the map, the
   * furniture and the simulation are identical either way. Only how much of the
   * log is shown differs.
   */
  compact?: boolean
  /**
   * The yard's own page. The whole log, the pair list, and a creature sheet for
   * whichever cat is selected.
   *
   * Still the same component. `full` and `compact` are two ends of one dial
   * rather than two implementations, so a fix to the simulation, the map or the
   * furniture lands in both without being copied.
   */
  full?: boolean
}) {
  const [state, setState] = useState<Visit | null>(null)
  const [peek, setPeek] = useState<YardCat | null>(null)
  const [grown, setGrown] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
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
    setState(visit(cats, cats.some(c => c.demo) ? DEMO_KEY : undefined))
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

  /* Newest first, so the three the preview shows are the three that just happened. */
  const shown = compact && !grown ? recent.slice(0, PREVIEW_LINES) : recent
  const more = recent.length - shown.length

  const pickedCat = picked ? byUid.get(picked) ?? null : null

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
          replay
          picked={full ? picked : undefined}
          onPick={full ? setPicked : undefined}
          onFurnish={prop => {
            const s = furnish(prop, cats.some(c => c.demo) ? DEMO_KEY : undefined)
            // Null only before a first visit has been saved, which cannot be
            // reached from here — the map is not rendered until one has.
            if (s) setState({ ...state, state: s })
          }}
        />
      </div>

      {/*
        THE SHEET SITS DIRECTLY UNDER THE MAP, where the tap happened. Putting it
        below the log would mean tapping a cat and watching the answer appear off
        the bottom of the screen.
      */}
      {full && pickedCat && (
        <div style={{ marginBottom: 14 }}>
          <CatSheet
            cat={pickedCat}
            yard={state.state}
            others={cats}
            onClose={() => setPicked(null)}
          />
        </div>
      )}

      {/*
        THE YARD'S LOG IS ON THE SAME PAPER AS THE BATTLE LOG.

        Cradle.tsx states the rule for the fight and it holds here for the same
        reason: "everything else is dark; the log is the one warm surface, and it
        is where the eye should go."

        It also does something the fight log does not have to: the map above is
        dark, so paper underneath separates the WORLD from the ACCOUNT of it
        without a heading or a rule between them. You look at the dark thing to
        see where everyone is and at the warm thing to read what they did.
      */}
      {/*
        ONLY IF THERE IS SOMETHING TO PUT ON IT.

        This asked whether the yard had any history AT ALL, which is not the same
        question as whether anything is about to be drawn. Look in twice within an
        hour and there are no new lines, the preview hides the pair list, and the
        grow control hides itself because there is nothing to grow — so an empty
        sheet of paper rendered under the map.
      */}
      {(shown.length > 0 || pairs.length > 0) && (
        <div style={paper}>
          {shown.map((m, i) => {
            const a = name(m.a), b = name(m.b)
            if (!a || !b) return null
            const [before, mid, after] = SAYS[m.kind]
            return (
              <p key={i} style={{ ...line, color: DEED_INK[m.kind] }}>
                {before}
                <CatName cat={a} on={() => show(a)} off={hide} />
                {mid}
                <CatName cat={b} on={() => show(b)} off={hide} />
                {after}
              </p>
            )
          })}

          {/*
            THE LOG GROWS, IT DOES NOT SCROLL.

            A short scrolling box would hide the same lines behind a gesture most
            people never make on a page they are already scrolling. Growing puts
            the whole day on the page and lets the reader put it back.

            The count is on the control, so it says how much there is rather than
            just that there is more.
          */}
          {/*
            `grown ||` is load-bearing. Once it is open `more` is zero, so a
            condition of `more > 0` alone took the control away at exactly the
            moment it was needed to put the log back — it opened and then could
            not be closed.
          */}
          {compact && (grown || more > 0) && (
            <button style={grow} onClick={() => setGrown(g => !g)}>
              {grown ? 'show less' : `${more} more`}
            </button>
          )}

          {/*
            The preview normally leaves the pair list for the yard's own page —
            EXCEPT when there are no new lines to show, because then it is the
            only thing there is. On a quiet day the standing state of the yard is
            more use than a blank sheet, and it is the more interesting half
            anyway: the log is what just happened, this is where they stand.
          */}
          {(!compact || grown || shown.length === 0) && pairs.length > 0 && (
            <>
              <p style={rule}>HOW THEY GET ON</p>
              {pairs.slice(0, 8).map(({ a, b, n }) => (
                <p key={a.uid + b.uid} style={line}>
                  <CatName cat={a} on={() => show(a)} off={hide} />
                  {' and '}
                  <CatName cat={b} on={() => show(b)} off={hide} />
                  {' — '}
                  {/*
                    KEYED ON THE WORD, not on the number. The thresholds were
                    written out here as `n >= 15` and `n <= -15` and were left
                    behind when reads() was recalibrated, so a pair reading
                    "friendly" was being painted grey. Reading the word means the
                    colour cannot disagree with it again.
                  */}
                  <span style={{ color: BOND_INK[reads(n)] ?? INK_FAINT }}>{reads(n)}</span>
                </p>
              ))}
            </>
          )}
        </div>
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

/*
 * THE SAME PAPER AND INK AS THE FIGHT, copied deliberately rather than imported.
 *
 * Cradle.tsx keeps them as module constants and does not export them, and there
 * is no shared theme file to put them in. Reaching into that file for two colours
 * would couple the yard to the fight screen's internals for no gain — but the
 * VALUES must match, because two nearly-identical papers side by side look like a
 * mistake where one paper looks like a decision.
 */
const PAPER = '#f2eee3'
const INK = '#1a1a1a'
const INK_FAINT = '#6b6b60'

/**
 * WHAT COLOUR EACH DEED IS PRINTED IN.
 *
 * Taken from the fight log's own KIND_INK rather than picked fresh: that palette
 * was already chosen to sit on this exact paper, and a second set of inks would
 * drift away from it. Warm deeds are green and gold, flashy is the crit orange,
 * a snub is the same grey as a miss, and a squabble is the KO red.
 *
 * The mood glyphs on the map are NOT these colours, and that is correct — those
 * sit on a dark tile over cat art, these sit on paper. Same meaning, different
 * ground.
 */
const DEED_INK: Record<Memory['kind'], string> = {
  greet:    '#3f6ea8',
  play:     '#2f7a44',
  share:    '#2f7a44',
  groom:    '#a06a10',
  showoff:  '#c2410c',
  snub:     INK_FAINT,
  squabble: '#a01b1b',
}

/** Keyed by what `reads()` says, so the two cannot disagree. */
const BOND_INK: Record<string, string> = {
  inseparable: '#a06a10',
  friendly:    '#2f7a44',
  wary:        INK_FAINT,
  cold:        '#c2410c',
  enemies:     '#a01b1b',
}

const fine: React.CSSProperties = { color: '#63637d', fontSize: 11, margin: 0, lineHeight: 1.6 }
const say: React.CSSProperties = { color: '#a9a9c0', fontSize: 13, margin: 0, lineHeight: 1.6 }
const label: React.CSSProperties = { fontSize: 10, letterSpacing: 2, color: '#7a7a95', margin: '4px 0 8px' }

/*
 * Not a fixed height, unlike the fight's log.
 *
 * That one is 320 tall because it fills a line at a time and the box must not
 * resize under the reader as it types. This one arrives complete, so a fixed
 * height would either crop the account of the day or leave a pale gap under a
 * quiet one. It grows to what happened.
 */
const paper: React.CSSProperties = {
  background: PAPER, color: INK, borderRadius: 14, padding: '16px 16px 14px',
  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
  marginBottom: 14,
  display: 'flex', flexDirection: 'column', gap: 6,
}

const line: React.CSSProperties = { color: INK, fontSize: 13, margin: 0, lineHeight: 1.55 }

/*
 * The grow control, printed rather than added.
 *
 * It lives INSIDE the paper and is drawn in the paper's own faint ink, so it
 * reads as part of the sheet — a note at the foot of the page — rather than as a
 * button laid on top of it. A purple pill here would be the only piece of app
 * chrome on the one warm surface in the game.
 */
const grow: React.CSSProperties = {
  alignSelf: 'flex-start', marginTop: 2,
  background: 'none', border: 0, padding: '2px 0',
  font: 'inherit', fontSize: 11, letterSpacing: 1,
  color: '#8a8a7a', cursor: 'pointer',
  borderBottom: '1px dotted currentColor',
}

/* The divider inside the paper. Ruled, the way a printed sheet would be. */
const rule: React.CSSProperties = {
  fontSize: 10, letterSpacing: 2, color: '#8a8a7a',
  margin: '8px 0 2px', paddingTop: 10,
  borderTop: '1px solid rgba(0,0,0,0.10)',
}
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
