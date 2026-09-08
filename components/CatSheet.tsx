'use client'

import { bond, diary, reads, temperOf, type YardState } from '@/lib/yard'
import { inkFor } from '@/lib/catink'
import { DOING, moodOf, thoughtOf } from '@/lib/yardmap'
import type { YardCat } from '@/components/Yard'

/**
 * ONE CAT, IN FULL — the creature sheet.
 *
 * JP wanted the yard's own page to go "into more detail… so you can see more
 * detail about the cats and their stats and everything", Dwarf Fortress style.
 *
 * ── THE DIARY IS THE POINT ───────────────────────────────────────────────────
 *
 * `diary()` has existed in lib/yard.ts since the yard was written and NOTHING has
 * ever shown it. It is the same memory list the bond is summed from, read from
 * one cat's side — so what you read here is exactly what the cat is going on, and
 * when a line fades out of it the bond drops by that much. There is no second
 * store and no way for the two to disagree.
 *
 * That is the DF thing. Not a stat block: a creature with a history you can read.
 *
 * ── THE TEMPERAMENT NUMBERS ARE SHOWN ────────────────────────────────────────
 *
 * act, clumsy and bold are the three values that decide everything this cat does,
 * and they come from its FACE, which is public in the token's metadata. Showing
 * them is not a leak — a player can already infer them by watching. It is also
 * the answer to "why does mine never do anything", which is otherwise invisible.
 *
 * The combat numbers are NOT here. Those live in data/combat.json and that file
 * does not leave the repository; this is a public repo and the yard has never had
 * the type chart. See lib/yard.ts.
 */

const BAR = 46

function Meter({ label, value, of, hint }: { label: string; value: number; of: number; hint: string }) {
  const pct = Math.max(0, Math.min(1, value / of))
  return (
    <div style={s.meterRow} title={hint}>
      <span style={s.meterLabel}>{label}</span>
      <span style={s.meterTrack}>
        <span style={{ ...s.meterFill, width: `${pct * BAR}px` }} />
      </span>
      <span style={s.meterNum}>{value.toFixed(2)}</span>
    </div>
  )
}

export function CatSheet({
  cat, yard, others, onClose,
}: {
  cat: YardCat
  yard: YardState
  others: YardCat[]
  onClose: () => void
}) {
  const t = temperOf(cat.face)
  const mine = others.filter(o => o.mine).map(o => o.uid)

  /* The newest thing anybody remembers this cat doing. */
  const last = [...yard.kept].reverse().find(m => m.a === cat.uid || m.b === cat.uid) ?? null
  const mood = moodOf(last)

  const felt = others
    .filter(o => o.uid !== cat.uid)
    .map(o => ({ o, n: bond(yard, cat.uid, o.uid) }))
    .filter(x => x.n !== 0)
    .sort((a, b) => Math.abs(b.n) - Math.abs(a.n))

  const said = diary(yard, cat.uid, 12)
  const byUid = new Map(others.map(o => [o.uid, o]))

  return (
    <div style={s.sheet}>
      <div style={s.head}>
        {cat.art
          ? <img src={cat.art} alt="" style={s.art} />
          : <div style={{ ...s.art, background: '#0b0b13' }} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={s.name}>
            {cat.name}
            <span style={{ ...s.mood, color: mood.colour }}>{mood.glyph}</span>
          </div>
          <div style={s.owner}>
            {cat.mine ? 'yours' : cat.owner ? `@${cat.owner.username}` : cat.demo ? 'somebody owns this one' : 'somebody you follow'}
            {' · '}{t.label}
          </div>
          <div style={s.doing}>{last ? DOING[last.kind] : 'keeping to itself'}</div>
        </div>
        <button onClick={onClose} style={s.close} aria-label="close">×</button>
      </div>

      {/*
        THE THREE NUMBERS THAT DECIDE EVERYTHING IT DOES. Ranges are the ones in
        TEMPERS, so a full bar means "the most of this any face has" rather than
        an abstract hundred percent.
      */}
      <div style={s.meters}>
        <Meter label="ACTS"   value={t.act}    of={0.75} hint="how often it does anything at all" />
        <Meter label="BOLD"   value={t.bold}   of={0.70} hint="leans toward showing off and squabbling" />
        <Meter label="CLUMSY" value={t.clumsy} of={0.12} hint="how often a kind deed comes out wrong" />
      </div>

      <div style={s.rule}>HOW IT FEELS ABOUT THE OTHERS</div>
      {felt.length ? (
        <div style={s.list}>
          {/*
            THE STRONGEST FEW. The whole pair list is on the page already, under
            HOW THEY GET ON — repeating all of it per cat was most of the wall.
            What is worth saying here is who this one cares about MOST.
          */}
          {felt.slice(0, 4).map(({ o, n }) => (
            <div key={o.uid} style={s.feltRow}>
              {/* The same ink the log gives this cat, so a name means one cat everywhere. */}
              <span style={{ color: mine.includes(o.uid) ? '#a06a10' : inkFor(o.uid, o.bg) }}>{o.name}</span>
              <span style={s.dots} />
              <span style={{ color: INK_FOR[reads(n)] ?? '#6b6b60' }}>{reads(n)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p style={s.none}>Nothing has happened between it and anybody yet.</p>
      )}

      {/*
        ONE LIST, NOT TWO.

        JP: "this is a lot of info to have, can we make this more bite size?"

        There were two — WHAT IT THINKS and WHAT IT REMEMBERS — and they were the
        SAME EVENTS printed twice: a thought is a reading of a memory, so the
        second list said everything the first had just said with the deed name
        instead of the feeling. Seventeen rows to carry six facts.

        A thought already names the other cat. Adding the hour to it gives
        everything both lists had, in one, and strictly more than either: what
        happened, how the cat took it, and how close it is to being forgotten.
      */}
      <div style={s.rule}>ON ITS MIND</div>
      {said.length ? (
        <div style={s.list}>
          {said.slice(0, 7).map((m, i) => {
            const other = byUid.get(m.a === cat.uid ? m.b : m.a)
            const thought = thoughtOf(m, cat.uid, other?.name ?? 'somebody')
            const ago = yard.ticks - m.tick
            return (
              <div key={i} style={s.memRow}>
                <span>
                  {/*
                    The bullet carries the feeling, and it reads the DELTA rather
                    than the deed — a kindness that went wrong is marked bad
                    however kindly it was meant.
                  */}
                  <span style={{ color: thought.good ? '#2f7a44' : '#a01b1b' }}>
                    {thought.good ? '+' : '−'}
                  </span>
                  {' '}{thought.text}
                </span>
                <span style={s.dots} />
                {/*
                  A memory lasts SPAN ticks and one tick is an hour, so "22h" is a
                  line about to stop counting toward the bond.
                */}
                <span style={s.ago}>{ago <= 0 ? 'just now' : `${ago}h`}</span>
              </div>
            )
          })}
        </div>
      ) : (
        <p style={s.none}>Nothing on its mind yet.</p>
      )}
    </div>
  )
}

/* The same inks the yard's log prints in. See components/Yard.tsx. */
const INK_FOR: Record<string, string> = {
  inseparable: '#a06a10', friendly: '#2f7a44', wary: '#6b6b60',
  cold: '#c2410c', enemies: '#a01b1b',
}
const DEED_INK: Record<string, string> = {
  greet: '#3f6ea8', play: '#2f7a44', share: '#2f7a44', groom: '#a06a10',
  showoff: '#c2410c', snub: '#6b6b60', squabble: '#a01b1b',
}

const s: Record<string, React.CSSProperties> = {
  sheet: {
    background: '#f2eee3', color: '#1a1a1a', borderRadius: 14,
    padding: '14px 16px 16px', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  head:  { display: 'flex', gap: 12, alignItems: 'flex-start' },
  art:   {
    width: 72, height: 57, objectFit: 'cover', imageRendering: 'pixelated',
    borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', flexShrink: 0,
  },
  name:  { fontSize: 17, display: 'flex', alignItems: 'center', gap: 6 },
  mood:  { fontSize: 14, fontWeight: 'bold' },
  owner: { fontSize: 11, color: '#6b6b60', marginTop: 2 },
  doing: { fontSize: 12, color: '#3a3a30', marginTop: 3 },
  close: {
    background: 'none', border: 0, color: '#8a8a7a', fontSize: 20,
    lineHeight: 1, cursor: 'pointer', padding: '0 2px', font: 'inherit',
  },

  meters:     { display: 'flex', flexDirection: 'column', gap: 3, marginTop: 10 },
  meterRow:   { display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, letterSpacing: 1 },
  meterLabel: { color: '#8a8a7a', width: 52 },
  meterTrack: {
    display: 'inline-block', width: BAR, height: 6, borderRadius: 3,
    background: 'rgba(0,0,0,0.10)', position: 'relative', overflow: 'hidden',
  },
  meterFill:  { position: 'absolute', left: 0, top: 0, bottom: 0, background: '#7a6a3a', borderRadius: 3 },
  meterNum:   { color: '#6b6b60', fontSize: 10 },

  rule: {
    fontSize: 10, letterSpacing: 2, color: '#8a8a7a',
    marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.10)',
  },
  list:    { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 },
  /* A hanging indent, so a thought that wraps lines up under itself. */
  thought: { display: 'flex', gap: 7, fontSize: 13, lineHeight: 1.45, alignItems: 'baseline' },
  feltRow: { display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 13 },
  memRow:  { display: 'flex', alignItems: 'baseline', gap: 0, fontSize: 13 },
  /* A leader of dots, the way a printed index runs a name out to its number. */
  dots:    { flex: 1, borderBottom: '1px dotted rgba(0,0,0,0.22)', margin: '0 6px', minWidth: 12 },
  ago:     { color: '#8a8a7a', fontSize: 11, whiteSpace: 'nowrap' },
  none:    { fontSize: 12, color: '#6b6b60', margin: '6px 0 0' },
}
