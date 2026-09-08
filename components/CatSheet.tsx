'use client'

import { bond, diary, reads, temperOf, PROPS, type YardState } from '@/lib/yard'
import { inkFor } from '@/lib/catink'
import { describe } from '@/lib/describe'
import { lootOf, hold, itemByFile } from '@/lib/loot'
import { skillsOf, rank, rankReads, toNext, SKILLS } from '@/lib/skills'
import { useMemo, useState } from 'react'
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
  const about = describe(yard, cat, others)

  /*
   * WHAT IT HAS WON, AND WHAT IT IS CARRYING.
   *
   * `swaps` exists only to re-read after a change: the bag is in localStorage
   * and storage does not tell React it moved. Same shape the mood's answer uses.
   */
  const [swaps, setSwaps] = useState(0)
  const loot = useMemo(() => lootOf(cat.uid), [cat.uid, swaps])

  /*
   * AND WHAT IT HAS LEARNED. Keyed on the tick rather than on `swaps`, because
   * hours are banked by a VISIT — the yard moving forward is the only thing that
   * can change them, and nothing on this sheet ever does.
   *
   * Strongest first: the sheet should open on what this cat is known for.
   */
  const learned = useMemo(
    () =>
      PROPS
        .map(p => ({ prop: p, hours: skillsOf(cat.uid)[p] ?? 0 }))
        .map(x => ({ ...x, r: rank(x.hours), next: toNext(x.hours) }))
        /*
         * ON THE LADDER, not merely started. Filtering on hours instead listed a
         * cat's first hour as a row reading "untrained", which contradicts
         * itself — the row says it does this and the word says it does not.
         *
         * The first rung is two hours, so nothing is hidden for long: a couple of
         * days with the thing out and the row appears saying `dabbling`.
         */
        .filter(x => x.r > 0)
        .sort((a, b) => b.hours - a.hours),
    [cat.uid, yard.ticks],
  )
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
        THE DESCRIPTION, WHICH IS THE DWARF FORTRESS PAGE.

        JP: "dwarves have a description kind of way of looking at things… if I
        look into a cat's thoughts and likes I can go into that in depth."

        It sits ABOVE the meters on purpose. The bars are the same three numbers
        this paragraph is written from, so the prose is the answer and the bars
        are the working — and the working belongs under the answer. Read the
        first three lines and you know the cat; read the bars if you want to know
        by how much.

        NOTHING HERE IS INVENTED. See lib/describe.ts: the look is its own two
        traits, the nature is its Face's numbers banded, and the likes are
        counted out of the memories the yard still holds. A cat that stops
        playing stops being described as the one that likes the toy.
      */}
      <div style={s.about}>
        {about.looks && <p style={s.line}>{about.looks}</p>}
        {about.nature.map((l, i) => <p key={i} style={s.line}>{l}</p>)}
        {/*
          The likes are set apart because they are the only part that is EARNED.
          The look and the nature are true the moment a cat is minted; these are
          what it has done since.
        */}
        {about.likes.length > 0 && (
          <div style={s.likes}>
            {about.likes.map((l, i) => <p key={i} style={s.line}>{l}</p>)}
          </div>
        )}
      </div>

      {/*
        WHAT IT CARRIES — the bag, and the one thing out of it that is in use.

        JP: "give it like a item bag; but it can only hold one; think like badges
        in pokemon. a cats worth is by the loot they have."

        So the two are drawn together and mean different things. The BAG is the
        record — every item this cat has ever won, never spent, and the reason one
        cat is worth more than another. The HELD one is the only one doing
        anything: it opens a deed in the yard the way a piece of furniture does,
        which is why carrying is a decision and owning is not.

        HIGH ON THE SHEET, above the numbers, because it is identity rather than
        statistics. What a cat has won says more about it than how often it acts.

        Nothing is drawn at all until it has won something. An empty case with a
        heading over it announces a system rather than a cat.
      */}
      {loot.bag.length > 0 && (
        <>
          <div style={s.rule}>WHAT IT CARRIES</div>
          <div style={s.bag}>
            {loot.bag.map((file: string) => {
              const it = itemByFile(file)
              if (!it) return null
              const on = loot.holds === file
              return (
                <button
                  key={file}
                  /* Tapping the held one puts it away; tapping another swaps. */
                  onClick={() => { hold(cat.uid, on ? null : file); setSwaps(n => n + 1) }}
                  title={`${it.label} — ${on ? 'carrying' : 'tap to carry'}`}
                  aria-pressed={on}
                  style={{ ...s.slot, ...(on ? s.slotOn : null) }}
                >
                  <img src={`/yard/items/${file}.png`} alt="" style={s.slotArt} />
                </button>
              )
            })}
          </div>
          <p style={s.carrying}>
            {loot.holds
              ? `Carrying ${itemByFile(loot.holds)?.label ?? 'something'}.`
              : 'Carrying nothing.'}
          </p>
        </>
      )}

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

      {/*
        WHAT IT HAS LEARNED — and it sits directly under the meters on purpose.
        Those three numbers are what a cat IS from the moment it is minted; these
        are the only numbers on the sheet it has EARNED, and CLUMSY is the one
        they act on. A cat that has practised is steadier than its face says.

        JP: "a way to train, like, IVs… the yard itself to train their IVs as a
        cat can use, like, games to get a little bit smarter or go on a computer
        or do their laundry or cook."

        Nothing is drawn until it has put an hour in somewhere, for the same
        reason as the bag: four empty rows announce a system rather than a cat.

        See lib/skills.ts — including why this is a yard skill and not a stat.
      */}
      {learned.length > 0 && (
        <>
          <div style={s.rule}>WHAT IT HAS LEARNED</div>
          <div style={s.list}>
            {learned.map(({ prop, hours, r, next }) => (
              <div
                key={prop}
                style={s.feltRow}
                title={
                  `${hours} hour${hours === 1 ? '' : 's'} of ${SKILLS[prop].of}`
                  + (next === null ? ' — as good as it gets' : ` · ${next} more to the next`)
                }
              >
                <span style={{ color: '#3f6ea8' }}>{SKILLS[prop].name}</span>
                <span style={s.dots} />
                <span style={{ color: '#6b6b60' }}>{rankReads(r)}</span>
              </div>
            ))}
          </div>
        </>
      )}

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

  about: {
    margin: '2px 0 10px',
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  /*
   * 1.5 line height and no indent. This is a paragraph broken into sentences,
   * not a list — DF prints it as running text and the sentences are short enough
   * that bullets would add a mark per line for nothing.
   *
   * INK ON PAPER. The first version used #c9c9d8, which is this app's colour for
   * text on the DARK panels — on the sheet's cream it was a ghost. The sheet is
   * #f2eee3 and everything on it is dark; `doing` above is #3a3a30 and this
   * matches it, because it is the same weight of writing.
   */
  line: { margin: 0, fontSize: 13, lineHeight: 1.5, color: '#3a3a30' },
  likes: {
    marginTop: 7, paddingTop: 7,
    /* The same rule the sections use, for the same reason: it is a printed sheet. */
    borderTop: '1px solid rgba(0,0,0,0.10)',
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  /*
   * The case. It wraps, because a full bag is eighteen things and a row that
   * scrolls sideways on a phone hides most of a cat's worth behind a gesture.
   */
  bag: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  slot: {
    width: 34, height: 34, padding: 3,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.05)',
    border: '2px solid rgba(0,0,0,0.10)',
    borderRadius: 8, cursor: 'pointer',
  },
  /*
   * The carried one is ringed in the same gold "this one is yours" is drawn in
   * everywhere else. The full border, not just its colour — mixing the shorthand
   * with the longhand across a state change lets React drop one of them.
   */
  slotOn: {
    background: 'rgba(224,167,44,0.16)',
    border: '2px solid #a06a10',
  },
  slotArt: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },
  carrying: { fontSize: 12, color: '#3a3a30', margin: '7px 0 0', lineHeight: 1.5 },

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
