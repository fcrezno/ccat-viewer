'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useConnect } from 'wagmi'
import sdk from '@farcaster/miniapp-sdk'
import { COLLECTIONS, getCollection, parseUid, type Cat } from '@/lib/collection'
import type { FightResult, LogLine } from '@/lib/arena'
import { strayName } from '@/lib/strayNames'
import { useSound } from '@/lib/useSound'
import { trackForRound } from '@/lib/music'
import { BitmapText } from '@/components/BitmapText'
import { FxLabel } from '@/components/FxButton'
import { FightStage, KIND_INK } from '@/components/FightStage'
import { MapDive, zoneOfTurf } from '@/components/MapDive'
import { LadderScreen } from '@/components/LadderScreen'
import type { Float } from '@/components/FloatWord'
import { MAX_ENERGY, restLeft, spendEnergy, stamina, type Stamina } from '@/lib/stamina'
import { useLoadingHold } from '@/lib/loading'
import { noteWin, noteLoss, type Beat } from '@/lib/streak'
import { NO_CHAIN } from '@/lib/appmode'
import { catsForWins } from '@/lib/season'
import {
  addFriend, friends as loadFriends, ladder, noteFight, ratio,
  recordFor, recordLine, removeFriend, setRetired, nameFor, setName, NAME_LIMIT,
  guestId,
  firstCat,
  winCat,
  perfectRuns,
  notePerfect,
  type Friend, type Ranked,
} from '@/lib/stable'

/**
 * THE CAT'S CRADLE — a preview of the main game.
 *
 * Hold a Clanker Cat and it fights here. The opponent is invented on the spot, so
 * there is an endless supply and nobody else's cat is ever on the losing end of a
 * public result. Anyone can watch a DEMO fight without a wallet, because
 * "connect a wallet first" is a bad answer to "what is this?".
 *
 * The fight is decided by the server in one go (app/api/fight/route.ts). This page
 * only REVEALS it, a line at a time, the way the game types its battle log out.
 *
 * THE LOG IS ON PAPER, in the game's own bitmap font. Everything else is dark;
 * the log is the one warm surface, and it is where the eye should go.
 */

const LINE_MS = 850
import { APP_URL } from '@/lib/miniapp'
import { V3_DEPLOYED, RUN_DOOR } from '@/lib/mintv3'
import { useWebConnectors } from '@/lib/useWebConnectors'

/*
 * THE COUNTDOWN'S BEATS, taken from the game rather than guessed at.
 *
 * sound.json states the timing outright, in the note on the `count` cue: "the
 * countdown is 2.6s split into four equal beats, so the numbers land at 0.00,
 * 0.65 and 1.30, and FIGHT! at 1.95". That is 650ms a beat, all four the same.
 *
 * This used to open on a 250ms "3" — shorter than the 450ms animation that draws
 * it, so the first number was cut off part-way through its own landing and the
 * whole intro read as a stumble.
 *
 * FIGHT! then holds for its own beat PLUS the game's 0.6s clear-arena pause
 * before the fight joins, which is the "1.25s of clip left to run in" the `go`
 * cue is written against.
 */
const BEAT_MS = 650
const GO_MS = BEAT_MS + 600
/** The countdown's outline and shadow: see the 3, 2, 1, FIGHT! below. */
const COUNT_INK = 'drop-shadow(3px 0 0 #1a1a1a) drop-shadow(-3px 0 0 #1a1a1a) drop-shadow(0 3px 0 #1a1a1a) drop-shadow(0 -3px 0 #1a1a1a) drop-shadow(4px 4px 0 #1a1a1a)'

/*
 * PLAYBACK SPEED, WHICH IS A PRIZE RATHER THAN A PREFERENCE.
 *
 * Everyone plays at x1. x2 and x4 are won by taking a season, so they are shown
 * to everybody — locked — because a reward nobody can see is not a reward.
 *
 * Every wait in the reveal is divided by the multiplier: the countdown, the log,
 * the lunges, and the health bar's drain. x4 is the same fight told four times as
 * fast, not a different fight.
 *
 * ── WHAT COUNTS AS A WINNER ──────────────────────────────────────────────────
 *
 * The season's own mechanism, not a new one. `scripts/champion.mjs` awards a cat
 * a `Title` trait — "Season 1 Champion" — by editing the metadata this app
 * serves, and the contract's baseURI points here, so a title costs no gas.
 *
 * So the multiplier is read off THE CAT, not the wallet. That is the right unit:
 * the title is earned by the cat that won, it travels with the cat if it is ever
 * sold, and a person who owns two cats gets the speed on the one that earned it.
 *
 * Nothing is applied yet — Season 1 is still running and no metadata carries a
 * Title — so this is x1 for everybody today. The moment `champion.mjs --apply`
 * runs for the winners, their buttons light up with no code change.
 */
const SPEEDS = [1, 2, 4] as const
const BASE_SPEED = 1
const TITLE_TRAIT = 'Title'

/** The title a cat has won, if any. The demo cat can never have one. */
function titleOf(cat: Cat | null): string | null {
  const t = cat?.meta?.attributes?.find(a => a.trait_type === TITLE_TRAIT)
  return t?.value?.trim() || null
}

/**
 * The multipliers this cat has earned. A title is a season win, and a season win
 * is worth x2 and x4.
 */
function unlockedSpeeds(cat: Cat | null): readonly number[] {
  return titleOf(cat) ? SPEEDS : [BASE_SPEED]
}

const PAPER = '#f2eee3'

/*
 * ONE WIDTH FOR EVERYTHING ON SCREEN DURING A FIGHT (JP, 2026-09-29: "too much
 * empty space; make it fit better", then the same for the results and the row
 * of controls). The battle screen is as wide as the window allows, never more
 * than 2x the game (960) and never taller than the window below the header;
 * the controls above it and the results under it take the same width, so the
 * three line up instead of the screen overhanging a narrow column.
 */
const WIDE = 'min(960px, calc(100vw - 32px), calc((100dvh - 160px) * 1.5))'

const INK = '#1a1a1a'

/**
 * YOUR FIGHTER, BESIDE THE MENU.
 *
 * JP, 2026-09-28: "i would like to have a portrait of your cat fighter next to
 * these options". His layout rule: the subject gets the room, and the controls
 * go left and compact. The name sits directly ABOVE the portrait, and the
 * portrait gets the mount every portrait in the game has: a 4px dark edge inside
 * a 2px paper ring. Cropped from the top, like the game's portraits, because
 * that is where a cat's face is.
 */
const NAME_EDGE = [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, 1], [1, -1], [-1, -1]]
  .map(([x, y]) => `drop-shadow(${x}px ${y}px 0 #000)`).join(' ')

function FighterPortrait({ name, src, pixel = true, children }: { name: string; src?: string; pixel?: boolean; children?: React.ReactNode }) {
  return (
    <div style={s.fighter}>
      {src
        ? <img src={src} alt={name} style={{ ...s.fighterPic, imageRendering: pixel ? 'pixelated' : 'auto' }} />
        : <div style={{ ...s.fighterPic, ...s.placeholder }}>🐱</div>}
      {/*
        THE NAME AS THE BATTLE SCREEN WRITES IT — JP, 2026-10-06: "the name is too
        small", "make it similar to the game". Under the portrait, in the game's
        font with its halo; then "make the outline for the inside black and the
        name white": white letters, black edge, at twice the font's size.
      */}
      <div style={{ ...s.fighterName, display: 'flex', justifyContent: 'center', marginTop: 8 }} aria-label={name}>
        {/* "bold the black ness of the name", then "reduce it a bit": a 2px black edge, 1px diagonals. */}
        <div style={{ filter: NAME_EDGE }}>
          <BitmapText text={name} scale={2} color="#ffffff" />
        </div>
      </div>
      {children}
    </div>
  )
}

/**
 * Confetti over the card.
 *
 * Seeded from the fight, so the same result throws the same pieces rather than a
 * new pattern on every re-render. Drawn LAST and above everything, which is the
 * renderer's own order: "the pieces pass in front of the portrait, so they have
 * to be in the same pass."
 */
function Confetti({ seed }: { seed: number }) {
  const pieces = useMemo(() => {
    let a = seed >>> 0
    const rnd = () => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const ink = ['#e0a33a', '#d1495b', '#5fc27e', '#8b5cf6', '#6b9bd1', '#ffd166']
    return Array.from({ length: 26 }, () => ({
      left: rnd() * 100,
      delay: rnd() * 1.6,
      dur: 1.6 + rnd() * 1.4,
      w: 4 + Math.floor(rnd() * 5),
      h: 6 + Math.floor(rnd() * 7),
      colour: ink[Math.floor(rnd() * ink.length)],
    }))
  }, [seed])

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', borderRadius: 14 }}>
      {pieces.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: 0,
            width: p.w,
            height: p.h,
            background: p.colour,
            animation: `cradle-fall ${p.dur}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

/**
 * WHERE THE RUN HAS GOT TO.
 *
 * Five slots, named up front, because the ladder is most of the tension: knowing
 * two more are still coming is what makes the choice between the pot and the bar
 * a real one. It says who they are and never how any of it goes.
 */
/**
 * THE RUN TRACKER, in Artifact's shape: the wins as connected pips, the losses
 * beside them, and how many perfect runs this device has behind it.
 *
 * It earns its place by making the PRIZE legible without a sentence. Three wins
 * is one cat and five is two, so those two pips are marked — a player can see
 * what the next round is worth while deciding whether to double or heal, which
 * is exactly when they need to know.
 *
 * The gauntlet ends on a single loss, so there is one loss slot rather than a
 * row of them. Drawn empty while the run lives, because an empty slot is the
 * threat.
 */
/**
 * THE WIN STREAK, SAID PLAINLY.
 *
 * Sits directly under the fight log and above every ending, so it is the first
 * thing read after a result and it is there whether the fight was a single one
 * or a round of a run. That placement IS the feature: the point of a streak is
 * to be seen before the player decides whether to stop.
 *
 * A LOSS THAT ENDED NOTHING SAYS NOTHING. Announcing "streak ended at 1" after a
 * first-round loss is noise, and worse, it makes losing feel accounted for. The
 * line only appears when there is something to lose.
 */
function StreakLine({ beat }: { beat: Beat }) {
  const won = beat.now > 0
  if (!won && beat.ended < 2) return null

  const text = won
    // "1 IN A ROW" is not English. The counter still has to start visibly, so
    // the first win is named rather than counted.
    ? (beat.now === 1 ? '1 WIN' : `${beat.now} IN A ROW`)
    : `STREAK ENDED AT ${beat.ended}`

  // A new best on the first win ever is trivially true and not worth a shout.
  const best = beat.record && beat.now >= 2

  return (
    <section className="win98" data-title="Clanker Cats" style={{ ...s.block, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <BitmapText text={text} scale={2} color={won ? '#5fc27e' : '#d1495b'} fx={best} />
      {best
        ? <BitmapText text="NEW BEST" scale={1} color="#e0a020" />
        : beat.best >= 2 && <p style={{ ...s.fine0, margin: 0 }}>best {beat.best}</p>}
    </section>
  )
}

function RunTrack({ run, perfect }: { run: RunView; perfect: number }) {
  const beaten = run.won ? run.roundNo : run.roundNo - 1

  /*
   * A WON BOX IS FILLED, NOT TICKED.
   *
   * The bitmap sheet is 96 glyphs from ASCII 32 — there is no check mark in it,
   * and borrowing one from the system font would put the only non-game letter
   * on the screen. A gold box with its number in dark ink reads as done just as
   * plainly, and it keeps the round number visible so the prize marks still mean
   * something.
   */
  return (
    <div style={s.track}>
      <div style={s.trackTop}>
        <BitmapText text="PERFECT RUNS" scale={1} color="#63637d" />
        <BitmapText text={String(perfect)} scale={1} color="#e0a72c" />
      </div>

      <div style={s.trackRow}>
        <div style={s.trackSide}>
          <BitmapText text="WINS" scale={1} color="#4a4a5e" />
          <div style={s.pips}>
            {Array.from({ length: run.foes.length }, (_, i) => {
              const n = i + 1
              const got = n <= beaten
              // 3 earns a cat and 5 earns two, so those two are ringed whether
              // or not they have been reached — the stake has to be visible
              // while the player is deciding to double or heal.
              const prize = n === 3 || n === run.foes.length
              return (
                <span key={n} style={s.pipWrap}>
                  {i > 0 && <span style={got ? { ...s.pipLink, ...s.pipLinkOn } : s.pipLink} />}
                  <span
                    style={got
                      ? { ...s.pip, ...s.pipOn, ...(prize ? s.pipPrize : null) }
                      : { ...s.pip, ...(prize ? s.pipPrizeOff : null) }}
                    title={prize ? (n === 3 ? '3 wins — one cat' : 'all five — two cats') : `win ${n}`}
                  >
                    <BitmapText
                      text={String(n)}
                      scale={2}
                      color={got ? '#0b0b13' : prize ? '#7a5c18' : '#4a4a5e'}
                    />
                  </span>
                </span>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}

function GauntletLadder({ run }: { run: RunView }) {
  // roundNo is the round just played. A won round is behind them; a lost one is
  // where they stopped.
  const beaten = run.won ? run.roundNo : run.roundNo - 1

  return (
    <div>
      <p style={s.label}>THE TOWER</p>
      <div style={s.tower}>
        {/*
          BOTTOM TO TOP. A tower is climbed, so round one is the floor and round
          five is the roof: the player starts at the bottom of the list and works
          upwards, and the cat still above them is the one they can see coming.
          Only the ORDER ON SCREEN is reversed — `i` stays the true round index,
          so the numbers still read 1 at the bottom through 5 at the top.
        */}
        {run.foes.map((f, i) => ({ f, i })).reverse().map(({ f, i }) => {
          const fell    = !run.won && i === run.roundNo - 1
          const done    = i < beaten
          // The one they are about to meet. Only while the run is still going.
          const next    = run.won && !run.champion && i === beaten
          const col     = getCollection(f.collection)

          return (
            <div
              key={f.uid}
              style={next ? { ...s.towerRow, ...s.towerNext } : s.towerRow}
            >
              <span style={s.towerNum}>{i + 1}</span>

              {f.art
                ? <img src={f.art} alt="" style={{
                    ...s.rankPic,
                    imageRendering: col.pixelArt ? 'pixelated' : 'auto',
                    // A cat already beaten steps back rather than disappearing:
                    // the tower should still read as five all the way through.
                    opacity: done || fell ? 0.4 : 1,
                  }} />
                : <div style={{ ...s.rankPic, display: 'grid', placeItems: 'center' }}>🐱</div>}

              <div style={{ flex: 1, minWidth: 0 }}>
                {/*
                  THE NAMES LOG WINS, when there is anything in it.

                  A holder's name for a cat lives in localStorage, so the SERVER
                  cannot know it and sends the number. Here in the page the log is
                  readable, so a cat the viewer has named shows that name —
                  usually their own cat, or a friend's they named after adopting.
                  Everything else stays the number, which is the honest answer.
                */}
                <div style={{
                  fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  color: fell ? '#d1495b' : done ? '#5a6b5f' : next ? '#ffd166' : '#f0f0f5',
                }}>
                  {nameFor(f.uid) ?? f.label}
                </div>
                {/*
                  THE UID, THEN WHOSE IT IS.

                  The owner is here because the whole point of the mode is that
                  these cats are somebody's. The uid is here because V1's
                  METADATA NAMES DO NOT MATCH ITS TOKEN IDS — token v1:195 is
                  called "Clanker Cats #100" — so the name above is not enough to
                  say which cat this was. The season record is kept by uid, so
                  without this a player cannot match a cat they beat to the cat
                  whose record went up.
                */}
                <div style={{ fontSize: 10, color: '#63637d' }}>
                  {f.uid}{f.owner ? ` · ${f.owner.slice(0, 6)}…${f.owner.slice(-4)}` : ''}
                </div>
              </div>

              <span style={{
                fontSize: 10, letterSpacing: 1,
                color: fell ? '#d1495b' : done ? '#5fc27e' : next ? '#ffd166' : '#4a4a5e',
              }}>
                {done ? 'BEATEN' : fell ? 'DOWN HERE' : next ? 'NEXT' : 'TO COME'}
              </span>
            </div>
          )
        })}
      </div>

      <p style={s.ladderLine}>
        {beaten} of {run.foes.length} beaten · pot {run.pot}
        {!run.recorded && ' · not recorded'}
      </p>
    </div>
  )
}

/**
 * AN OLD-WEB HIT COUNTER, in the game's own font.
 *
 * Asking /api/hits is what COUNTS the visit — the route calls hits.sh, which
 * keeps the number, because this app has no database. See the route for why it
 * is proxied rather than embedded as somebody else's badge.
 *
 * Drawn in the bitmap sheet with the digits boxed, the way these always looked.
 * It shows NOTHING at all until a number arrives: a counter that says 0 while it
 * loads reads as "nobody has been here", which is a lie about a page somebody is
 * currently looking at.
 */
function HitCounter() {
  const [count, setCount] = useState<number | null>(null)
  // In development React mounts effects twice, which would count the visit twice.
  const asked = useRef(false)

  useEffect(() => {
    if (asked.current) return
    asked.current = true

    let live = true
    fetch('/api/hits')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (live && typeof d?.count === 'number') setCount(d.count) })
      .catch(() => {})
    return () => { live = false }
  }, [])

  if (count === null) return null

  // Padded to six, as they were — the leading zeros are most of the charm.
  const digits = String(count).padStart(6, '0')

  /*
   * NO VISIBLE LABEL. It shares the top row with the speed and sound controls,
   * and on a 375px phone that row has barely sixty spare pixels — a "VISITORS"
   * caption would push the slider off the edge. Green digits sunk into a black
   * box already read as a counter, and the title and aria-label say it outright
   * for anyone hovering or listening.
   */
  return (
    <span
      style={s.hitsBox}
      title={`${count} visitors`}
      aria-label={`${count} visitors`}
    >
      <BitmapText text={digits} scale={1} color="#e0a72c" />
    </span>
  )
}

/** How many rows the board shows. Champions are rare, so this is generous. */
const BOARD_MAX = 20

/** One row of the season board. */
type BoardRow = {
  uid: string; rank: number
  wins: number; losses: number; points: number; runs: number
}

/**
 * THE SEASON BOARD — where every cat stands, the same for everybody.
 *
 * Rebuilt from casts by /api/ticker, because there is no database. Two things
 * follow from that and both are said on screen rather than hidden:
 *
 *   only runs somebody CAST are counted, so this is a floor
 *   only a CHAMPION banks points, because falling loses the pot
 *
 * So an empty board is the normal state on day one, and it says what to do about
 * it instead of showing nothing.
 */
function SeasonBoard({ mine }: { mine: Set<string> }) {
  const [rows, setRows] = useState<BoardRow[] | null>(null)
  const [season, setSeason] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  /** uid -> the cat's picture. Filled in after the board arrives. */
  const [faces, setFaces] = useState<Record<string, string>>({})

  useEffect(() => {
    let live = true
    fetch('/api/ticker')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('ticker'))))
      .then(d => { if (live) { setRows(d.board ?? []); setSeason(d.season ?? null) } })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [])

  /*
   * THE PICTURES COME SEPARATELY, on purpose.
   *
   * The board itself is a search across Farcaster and is slow enough already;
   * making it also fetch metadata for every cat would hold the whole thing back
   * for the sake of some thumbnails. So the ranking paints first and the faces
   * arrive after, the way shuffle() already loads cats.
   *
   * A face that never arrives leaves the placeholder. It is a picture.
   */
  useEffect(() => {
    if (!rows?.length) return
    let live = true

    Promise.all(rows.slice(0, BOARD_MAX).map(async r => {
      const { collection, id } = parseUid(r.uid)
      try {
        const res = await fetch(`/api/meta?id=${id}&c=${collection}`)
        if (!res.ok) return null
        const meta = await res.json()
        return [r.uid, meta?.image ?? ''] as const
      } catch { return null }
    })).then(pairs => {
      if (!live) return
      setFaces(Object.fromEntries(pairs.filter(Boolean) as (readonly [string, string])[]))
    })

    return () => { live = false }
  }, [rows])

  /** A cat's picture at any size, or the placeholder. */
  const Face = ({ uid, size }: { uid: string; size: number }) => {
    const src = faces[uid]
    const col = getCollection(parseUid(uid).collection)
    return src
      ? <img src={src} alt="" style={{
          width: size, height: size, borderRadius: size > 80 ? 14 : 8, display: 'block',
          objectFit: 'cover', flexShrink: 0,
          imageRendering: col.pixelArt ? 'pixelated' : 'auto',
        }} />
      : <div style={{
          width: size, height: size, borderRadius: size > 80 ? 14 : 8, flexShrink: 0,
          background: '#12121c', display: 'grid', placeItems: 'center',
          fontSize: Math.round(size * 0.45),
        }}>🐱</div>
  }

  const label = (uid: string) => nameFor(uid) ?? `#${parseUid(uid).id}`

  if (failed)
    return (
      <section className="win98" data-title="Clanker Cats" style={s.block}>
        <p style={s.label}>SEASON</p>
        <p style={s.quiet}>could not reach the season board just now.</p>
      </section>
    )

  if (!rows)
    return (
      <section className="win98" data-title="Clanker Cats" style={s.block}>
        <p style={s.label}>SEASON</p>
        <p style={s.quiet}>reading the season board…</p>
      </section>
    )

  if (rows.length === 0)
    return (
      <section className="win98" data-title="Clanker Cats" style={s.block}>
        <p style={s.label}>{season ? `SEASON ${season}` : 'SEASON'}</p>
        <p style={s.quiet}>nobody has taken all five yet.</p>
        <p style={s.fine}>Take the gauntlet, cast the run, and this is where it goes.</p>
      </section>
    )

  const [top, ...rest] = rows.slice(0, BOARD_MAX)
  // Second and third stand under the champion; everything after is a list.
  const podium = rest.slice(0, 2)
  const list   = rest.slice(2)

  return (
    <section className="win98" data-title="Clanker Cats" style={s.block}>
      <p style={s.label}>{season ? `SEASON ${season}` : 'SEASON'}</p>

      {/*
        THE CHAMPION GETS THE VICTORY TREATMENT — portrait up, confetti falling,
        the same Confetti that lands on a won fight. Taking all five is the rarest
        thing in the app (about one run in eleven) and the board should look like
        somebody won something rather than like a table with a first row.
      */}
      <div style={mine.has(top.uid) ? { ...s.champCard, ...s.champCardMine } : s.champCard}>
        <Confetti seed={top.points} />
        <div style={{ position: 'relative', display: 'grid', justifyItems: 'center', gap: 8 }}>
          <Face uid={top.uid} size={132} />
          <BitmapText text="CHAMPION" scale={2} color="#e0a72c" />
          <div style={{ fontSize: 15, color: mine.has(top.uid) ? '#ffd166' : '#f0f0f5' }}>
            {label(top.uid)}
          </div>
          <div style={{ fontSize: 22, color: '#e0a72c', fontVariantNumeric: 'tabular-nums' }}>
            {top.points}
          </div>
          <div style={{ fontSize: 10, color: '#63637d' }}>
            {top.uid} · {top.wins}W {top.losses}L{top.runs > 1 ? ` · ${top.runs} runs` : ''}
          </div>
        </div>
      </div>

      {/*
        Second and third, in the tower's own row so the top three read together.
        Wrapped in the tower's container because towerRow carries no margin of its
        own — the gauntlet spaces them with the parent's `gap`, and borrowing the
        row without the container would leave these two stuck to each other.
      */}
      <div style={{ ...s.tower, marginBottom: 6 }}>
      {podium.map(r => (
        <div key={r.uid} style={mine.has(r.uid) ? { ...s.towerRow, ...s.towerNext } : s.towerRow}>
          <span style={s.boardRank}>{r.rank}</span>
          <Face uid={r.uid} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: mine.has(r.uid) ? '#ffd166' : '#f0f0f5' }}>
              {label(r.uid)}
            </div>
            <div style={{ fontSize: 10, color: '#63637d' }}>
              {r.uid} · {r.wins}W {r.losses}L{r.runs > 1 ? ` · ${r.runs} runs` : ''}
            </div>
          </div>
          <span style={s.boardPts}>{r.points}</span>
        </div>
      ))}
      </div>

      {/* Fourth down: the plain row, with the cat's face on it. */}
      {list.map(r => (
        <div key={r.uid} style={mine.has(r.uid) ? { ...s.boardRow, ...s.boardRowMine } : s.boardRow}>
          <span style={s.boardRank}>{r.rank}</span>
          <Face uid={r.uid} size={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: mine.has(r.uid) ? '#ffd166' : '#f0f0f5' }}>
              {label(r.uid)}
            </div>
            <div style={{ fontSize: 10, color: '#63637d' }}>
              {r.uid} · {r.wins}W {r.losses}L{r.runs > 1 ? ` · ${r.runs} runs` : ''}
            </div>
          </div>
          <span style={s.boardPts}>{r.points}</span>
        </div>
      ))}

      <p style={s.fine}>
        Champions only — falling loses the pot. Counted from cast runs, so this is
        a floor.
      </p>
    </section>
  )
}

function RankRow({ r, place, onDrop }: { r: Ranked; place: number; onDrop?: () => void }) {
  const { pct } = ratio(r.record)
  return (
    <div style={s.rankRow}>
      {place > 0 && <span style={{ width: 20, color: '#63637d', fontSize: 12 }}>{place}</span>}
      {r.image
        ? <img src={r.image} alt="" style={s.rankPic} />
        : <div style={{ ...s.rankPic, display: 'grid', placeItems: 'center' }}>🐱</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          color: r.mine ? '#ffd166' : '#f0f0f5',
        }}>
          {r.name}{r.record.retired ? ' · retired' : ''}
        </div>
        <div style={{ fontSize: 10, color: '#7a7a95' }}>
          {recordLine(r.record)}{pct !== null ? ` · ${pct}%` : ''}
        </div>
      </div>
      {onDrop && <button onClick={onDrop} style={s.tiny} aria-label="remove friend">×</button>}
    </div>
  )
}

/**
 * WHAT EVERY CAST CARRIES.
 *
 * The same three things the viewer's own share uses, and for the reason written
 * there: "$CLKCAT renders as a token chip; @crezno makes every share a mention so
 * the drop collects into one thread instead of scattering."
 *
 * `#ClankerCats` is the new one and it is not decoration — /api/ticker FINDS the
 * casts by searching for it, and a cat's seasonal record is rebuilt from what
 * that search returns. Drop the hashtag and the records stop being countable.
 */
const SEASON_TAG = 'by @crezno\n$CLKCAT #ClankerCats'

/** One cat on the ladder, as the server describes it. */
type FoeRef = {
  uid: string
  collection: string
  id: string
  label: string
  owner: string
  art: string
}

/** What the page needs to know about a run in progress. */
type RunView = {
  /** False for a demo run — played in full, never banked. */
  recorded: boolean
  /** All five, named up front, so the player can see what is coming. */
  foes:     FoeRef[]
  /** The round just played, 1-based. */
  roundNo:  number
  won:      boolean
  pot:      number
  /** Null once the run is over, either way. */
  ticket:   string | null
  /** A fall that can still be bought back with a repost. */
  canContinue: boolean
  /** Spent already — the run now tops out at one cat. */
  continued:   boolean
  champion: boolean
  over:     boolean
}

export function Cradle() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const webConnectors = useWebConnectors()

  const [view, setView] = useState<'home' | 'fight' | 'ranks' | 'adopt'>('home')
  const [found, setFound] = useState<Cat[] | null>(null)
  const [finding, setFinding] = useState(false)
  const [cats, setCats] = useState<Cat[] | null>(null)
  const [friends, setFriends] = useState<Friend[]>([])
  const [picked, setPicked] = useState<Cat | null>(null)
  // The speeds the SELECTED cat has earned — a title travels with the cat.
  const unlocked = useMemo(() => unlockedSpeeds(picked), [picked])
  const [result, setResult] = useState<FightResult | null>(null)
  /*
   * THE GAUNTLET, LAYERED OVER THE ORDINARY FIGHT.
   *
   * A run is five fights, and each one is played back by exactly the machinery a
   * single fight already uses — `result`, `shown` and the countdown. This state
   * is only the things a RUN knows that one fight does not: who is still to come,
   * what the pot is at, and the ticket that carries the run back to the server.
   *
   * Null when no run is going, which is also how the ordinary fight's buttons
   * know to show themselves.
   */
  const [run, setRun] = useState<RunView | null>(null)
  const [choosing, setChoosing] = useState(false)
  /*
   * WHETHER THIS FIGHT COUNTS — the server's word, never worked out here.
   *
   * An exhibition is a real fight against a real cat and looks identical on
   * screen; the only thing keeping it out of the record is this. Defaults to
   * true so a response without the field behaves as fights always have.
   */
  const [recorded, setRecorded] = useState(true)

  /*
   * THE VIEWER'S FARCASTER ID, when there is one.
   *
   * Read from the mini app context rather than asked for: outside Farcaster it
   * is simply null and everything still plays. It is a HINT — it names who a won
   * run gets signed for, and the claim checks a Quick Auth token against that
   * name rather than believing this.
   */
  const [fcFid, setFcFid] = useState<number | null>(null)
  /** Perfect runs behind this device. Read on mount; bumped when one lands. */
  const [perfect, setPerfect] = useState(0)
  useEffect(() => { setPerfect(perfectRuns()) }, [])

  useEffect(() => {
    let live = true
    sdk.context
      .then(c => { if (live) setFcFid(c?.user?.fid ?? null) })
      .catch(() => {})
    return () => { live = false }
  }, [])
  /*
   * THE SIGNED LINE FOR A CAST, from the server, or null when this fight cannot
   * count towards a seasonal record — a demo cat, or a quick fight whose
   * opponent was invented and belongs to nobody.
   *
   * For a run it arrives ONLY on the last round, and covers all five, so sharing
   * mid-run is not a thing that can happen by accident.
   */
  const [tag, setTag] = useState<string | null>(null)
  const [shown, setShown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [confirmRetire, setConfirmRetire] = useState(false)
  const [friendId, setFriendId] = useState('')

  /*
   * GUEST PVP — YOUR CODE, AND THEIRS.
   *
   * A guest cat is rolled from its id alone, so six digits ARE the cat. Handing
   * somebody your number lets them rebuild your fighter exactly, which is how two
   * people with no wallets fight each other with nothing stored anywhere.
   *
   * It is an EXHIBITION and it does not count. That is not a shortcoming, it is
   * what makes it possible: a shared ranking would need somewhere to keep it, and
   * there is nowhere. The record starts when they adopt a cat.
   *
   * ?vs=428193 fills the box, so a sticker or a link can carry the whole
   * challenge and the other person only has to press FIGHT.
   */
  const [vsCode, setVsCode] = useState('')
  const [myCode, setMyCode] = useState(0)
  useEffect(() => {
    // Read on the client only: guestId touches localStorage, and the server has
    // no idea which guest this is, so rendering it during SSR would mismatch.
    setMyCode(guestId())
    const q = Number(new URLSearchParams(window.location.search).get('vs'))
    if (Number.isInteger(q) && q >= 100000 && q <= 999999) setVsCode(String(q))
  }, [])

  function fightCode() {
    const n = Number(vsCode)
    if (!Number.isInteger(n) || n < 100000 || n > 999999) {
      setError('a cat code is six digits'); return
    }
    if (n === myCode) { setError('that is your own cat'); return }
    setPicked(null)
    startFight({ demo: true, vs: n })
  }
  const [nameDraft, setNameDraft] = useState('')
  const [naming, setNaming] = useState(false)
  const [rowsShown, setRowsShown] = useState(0)
  const [count, setCount] = useState<number | null>(null)
  /*
   * THE MAP INTO BATTLE (components/MapDive). A fight's result arrives, the map
   * plays — alarm, dive, the place's name — and its end starts the countdown.
   * JP, 2026-10-05: "can we still add ... the map screen into battle?"
   */
  const [diving, setDiving] = useState(false)
  /*
   * THE LADDER AFTER A WON ROUND (components/LadderScreen): the gauntlet as a
   * tower, your cat climbing a rung. JP, 2026-10-05: "can we still add that
   * mortal kombat ladder thing after victory that we used to have?"
   */
  const [showLadder, setShowLadder] = useState(false)
  /*
   * The ladder has played and closed. The results card WAITS for it: it scrolls
   * the page down to itself, and it did that while the ladder was still playing
   * in the battle screen, so the climb happened half off the top of the page.
   */
  const [ladderDone, setLadderDone] = useState(false)
  const [speed, setSpeed] = useState(BASE_SPEED)
  const sound = useSound()
  const cardRef = useRef<HTMLElement>(null)
  const logRef = useRef<HTMLDivElement>(null)

  /*
   * A PHONE KEEPS THE OLD LOG. JP, 2026-09-29: "for mobile keep the old text
   * scroll down we had before; for the desktop web page keep it the same". At
   * phone width the battle screen shows its top only (FightStage `crop`) and the
   * fight is told on the scrolling paper under it; wider, the log stays in the
   * screen's own text box. After mount, because the server has no screen width.
   */
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const q = window.matchMedia('(max-width: 640px)')
    const on = () => setNarrow(q.matches)
    on()
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  const counted = useRef<string | null>(null)
  const [, bump] = useState(0)

  /*
   * CONNECTING, THE WAY THE REST OF THE APP DOES IT.
   *
   * Inside a Farcaster client the `farcaster-frame` connector connects on its own
   * with no prompt, so the wallet is simply there. Everywhere else it does
   * nothing at all — which is why the button used to be dead in a desktop
   * browser: it called `connectors[0]`, and that IS the frame connector.
   *
   * So: try the frame connector once on mount, and offer every OTHER connector as
   * a button for people who are not in a Farcaster client.
   */
  useEffect(() => {
    sdk.actions.ready().catch(() => {})
    const fc = connectors.find(c => c.id === 'farcaster-frame')
    if (fc) connect({ connector: fc })
    // Once, on mount — reconnecting on every render would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { setFriends(loadFriends()) }, [])

  useEffect(() => {
    if (!address) { setCats(null); return }
    let live = true
    fetch(`/api/owned?wallet=${address}`)
      .then(r => r.json())
      .then(d => { if (live) setCats(Array.isArray(d) ? d : []) })
      .catch(() => { if (live) setCats([]) })
    return () => { live = false }
  }, [address])

  /*
   * A SPEED CANNOT OUTLIVE THE CAT THAT EARNED IT.
   *
   * Pick a titled cat, take x4, then switch to a cat with no title: the button
   * would go back to locked while the fight kept running at four times speed.
   * Falling back to x1 keeps what is shown and what is played the same thing.
   */
  useEffect(() => {
    if (!unlocked.includes(speed)) setSpeed(BASE_SPEED)
  }, [unlocked, speed])

  /*
   * THE COUNTDOWN, then the fight.
   *
   * 3, 2, 1 and then FIGHT!, which is how the game opens a bout — sound.json even
   * names the beats: `count` is "the 3, 2 and 1", `go` is "FIGHT!, the fourth
   * beat of the countdown". Nothing of the log is told until it has run.
   */
  useEffect(() => {
    if (count === null) return
    const t = setTimeout(() => {
      if (count > 1) { sound.play('count'); setCount(count - 1) }
      else if (count === 1) { sound.play('go'); setCount(0) }
      else setCount(null)
    }, (count === 0 ? GO_MS : BEAT_MS) / speed)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, speed])

  useEffect(() => {
    // Nothing is told until the countdown has finished.
    if (count !== null || diving) return
    if (!result || shown >= result.log.length) return
    const t = setTimeout(() => setShown(n => n + 1), LINE_MS / speed)
    return () => clearTimeout(t)
  }, [result, shown, count, speed, diving])

  // The phone's paper log follows the newest line down (see `narrow`).
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [shown])


  /*
   * ONE CUE PER LINE, mapped the way the game maps them — LogLine.Kind IS the cue
   * vocabulary, and only `down` -> `ko` differs.
   *
   * A `move` line gets the hit sound only when the swing CONNECTED. If the next
   * line is a miss, a crit or a weak hit, that line carries its own sound and a
   * hit here would double it up.
   */
  useEffect(() => {
    if (!result || shown === 0) return
    const l = result.log[shown - 1]
    const next = result.log[shown]

    const carriesItsOwn = next
      && (next.kind === 'miss' || next.kind === 'crit' || next.kind === 'weak')

    /*
     * A CRIT OR WEAK HIT SOUNDS ON THE SWING, not on the line after it. The bars
     * now drop on the swing's own beat (see shownHp), so the crit's thump moved
     * with them — measured, it had been landing 0.89 s after its own damage.
     * The crit or weak line that follows then stays quiet instead of doubling it.
     */
    const prevLine = shown > 1 ? result.log[shown - 2] : null
    const afterSwing = prevLine?.kind === 'move'
    const cue =
      l.kind === 'ko' ? 'ko'
      : l.kind === 'crit' ? (afterSwing ? null : 'crit')
      : l.kind === 'weak' ? (afterSwing ? null : 'weak')
      : l.kind === 'miss' ? 'miss'
      : l.kind === 'perk' ? 'perk'
      : l.kind === 'win' ? 'score'
      : l.kind === 'move' ? (next?.kind === 'crit' ? 'crit' : next?.kind === 'weak' ? 'weak' : carriesItsOwn ? null : 'hit')
      : null

    if (cue) sound.play(cue)
    // `sound` is rebuilt each render; keying on the line is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, result])

  /*
   * The bed belongs to the fight, so it stops when the fight is told. Computed
   * here rather than using `done`, which is declared further down.
   *
   * A RUN IS ONE PIECE OF MUSIC, NOT FIVE. Stopping at the end of every round
   * left the rest of the gauntlet in silence: the choice screen does not restart
   * it, so once round one finished the music never came back. It now plays
   * across the whole run and stops when the run does.
   */
  useEffect(() => {
    if (!result || shown < result.log.length) return
    if (run && !run.over) return
    sound.stopMusic()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, result, run])

  /*
   * THE CARD, ONE ROW AT A TIME.
   *
   * Only once the log has finished — the score is the summing-up, and showing it
   * while the fight is still being told gives away the ending.
   *
   * Each row lands with the `perk` cue, which is the sound the game itself uses
   * for "home turf, and score rows landing". The final step is the TOTAL, and it
   * gets `score`.
   */
  useEffect(() => {
    if (!result) return
    const finished = shown >= result.log.length
    if (!finished) return
    if (rowsShown > result.rows.length) return
    // A won round: the ladder first, then the card.
    if (run?.won && !ladderDone) return

    /*
     * BRING THE CARD INTO VIEW BEFORE THE FIRST ROW LANDS.
     *
     * The log box is 320 tall and the card sits under it, so on a phone the whole
     * card was below the fold — the rows landed, the total popped and the confetti
     * fell where nobody could see any of it. An animation nobody watches is not an
     * animation.
     */
    if (rowsShown === 0) {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    const t = setTimeout(() => {
      sound.play(rowsShown === result.rows.length ? 'score' : 'perk')
      setRowsShown(n => n + 1)
    }, rowsShown === 0 ? 700 : 420)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, result, rowsShown, run, ladderDone])

  const done = !!result && shown >= result.log.length
  /** A fight is on screen, so the page takes the fight's width (see WIDE). */
  const wide = view === 'fight' && !!result

  // A won round's log has finished: the ladder comes up over the battle screen.
  useEffect(() => { if (done && run?.won) setShowLadder(true) }, [done, run])
  const at = result && shown > 0 ? result.log[shown - 1] : null
  const prev = result && shown > 1 ? result.log[shown - 2] : null
  /*
   * NO TOKEN BEHIND THIS CAT — a demo fight or a guest's run.
   *
   * It used to be `label === 'Demo Cat'`, which stopped being true the moment a
   * guest cat started carrying its own name. A RUN says outright whether it is
   * recorded, so that is read first; only a single fight falls back to the
   * label, because it has no run to ask.
   *
   * An exhibition is deliberately NOT caught here: it is a real cat on a real
   * fight, and only its RECORDING is skipped.
   */
  /*
   * WHO JUST TOOK THE BLOW.
   *
   * Read from the HEALTH SNAPSHOTS, not from the actor: a line names who swung,
   * and a swing that missed hurts nobody. A drop between the previous line and
   * this one IS the hit — the same test the results card uses to find its blows.
   */
  const struckSide: 'you' | 'foe' | null = (() => {
    /*
     * LOOK FORWARD, NOT BACK — and this is the whole bug.
     *
     * arena.ts records each line's health AT PUSH TIME: "both cats are mutated
     * as the fight runs, so this captures the moment rather than the outcome."
     * So the line that says "A used X!" still carries the health from BEFORE
     * that blow, and the drop only appears on the line AFTER it.
     *
     * Comparing the previous line to this one therefore animates the PREVIOUS
     * blow — which put the recoil on the cat that was busy lunging, and made a
     * hit look like a cat attacking itself.
     *
     * Comparing this line to the NEXT one lands the flinch on the same beat as
     * the swing that caused it.
     */
    const after = result && shown < result.log.length ? result.log[shown] : null
    if (!at || !after) return null
    if (after.hpYou < at.hpYou) return 'you'
    if (after.hpFoe < at.hpFoe) return 'foe'
    return null
  })()

  /*
   * THE BARS DROP ON THE BLOW, NOT A LINE LATER. JP, 2026-10-06: "sync the sound
   * effects better". The hit sound and the flinch fire on the swing's line, but
   * the bars read that line's health — from BEFORE the blow (see above) — so the
   * damage showed one line, ~0.85 s, after the thump that caused it. On a line
   * that strikes, the bars take the NEXT line's health, and their trail starts
   * from this one's: sound, flinch and drop land together.
   */
  const shownHp = struckSide && result && shown < result.log.length ? result.log[shown] : at
  const trailHp = shownHp !== at ? at : prev

  /*
   * THE LINE THAT FLOATS OFF A CAT (components/FloatWord). JP, 2026-10-06: "also
   * there used to be text on the cat if a attack critted or missed". As the
   * renderer: a crit or weak hit floats the crit line's own words over the cat
   * that was struck, on the swing's beat, with the drop and the sound; a miss
   * floats over the cat that SWUNG, on its own line.
   */
  const float: Float | null = (() => {
    if (!result || !at) return null
    const next = shown < result.log.length ? result.log[shown] : null
    const other = (a: 'you' | 'foe' | null) => (a === 'you' ? 'foe' : a === 'foe' ? 'you' : null)
    if (at.kind === 'move' && next && (next.kind === 'crit' || next.kind === 'weak')) {
      const side = struckSide ?? other(at.actor)
      return side ? { text: next.text, side, kind: next.kind, key: shown } : null
    }
    if (at.kind === 'miss') {
      const side = at.actor ?? prev?.actor ?? null
      return side ? { text: at.text, side, kind: 'miss', key: shown } : null
    }
    if ((at.kind === 'crit' || at.kind === 'weak') && prev?.kind !== 'move' && prev) {
      const side = at.hpYou < prev.hpYou ? 'you' : at.hpFoe < prev.hpFoe ? 'foe' : null
      return side ? { text: at.text, side, kind: at.kind, key: shown } : null
    }
    return null
  })()

  /** How hard it landed, in the renderer's three grades of IMPACT. */
  const hitKind: 'crit' | 'weak' | 'hit' =
    at?.kind === 'crit' ? 'crit' : at?.kind === 'weak' ? 'weak' : 'hit'

  const isDemo = run ? !run.recorded : result?.you.label === 'Demo Cat'

  /*
   * HOW A CAT IS NAMED ON SCREEN.
   *
   * A guest may call its cat whatever it likes, so the name alone no longer says
   * whether there is a token behind it. "(Guest)" is appended where the cat is
   * IDENTIFIED — the results card, the victor — and deliberately NOT in the
   * battle log, where a suffix on every line would be noise rather than
   * information.
   */
  const named = (label: string) => (isDemo ? `${label} (Guest)` : label)

  /*
   * WRITE THE RESULT ONCE, and only when the log has finished telling it.
   *
   * Counting the moment the server answers would bank a win before the player had
   * seen a single line. The ref guards the double-count a re-render would cause,
   * keyed on the fight's own seed so the next fight is counted again.
   */
  /*
   * THE WIN STREAK.
   *
   * A SEPARATE EFFECT FROM THE RECORD BELOW, and deliberately without its
   * guards. The record skips demo and exhibition fights because it is a claim
   * about a cat. A streak is a reason to press the button again, so it counts
   * every decided fight — a guest's, a coded fight against a friend, and each
   * round of a gauntlet.
   *
   * Guarded on the fight's own seed, the same way the record is, because a
   * re-render would otherwise count one fight twice. Every round of a run gets
   * its own seed from roundSeed(), so rounds are counted separately.
   */
  /*
   * THE YARD'S RESIDENTS: your cats, plus the cats of accounts you follow.
   *
   * The followed half comes from /api/yard, which needs a Farcaster identity —
   * so outside Farcaster the yard is just your own shelf, and below two cats it
   * says so rather than showing an empty pen.
   */
  /**
   * Rounds won in the run in progress. Both builds count them: the no-chain build
   * to hand out its prize, the web build only to know whether to OFFER the claim.
   * The claim itself is decided by the server off the signed tag, never off this.
   */
  const runWins = useRef(0)

  /*
   * WHERE A WON RUN GOES. Three wins earns a free V3 cat, and /mint/v3 already
   * takes the run as ?r=<tag> — but nothing sent anybody there, so a winner had
   * no way to claim. Hidden until the contract address is set, so this can ship
   * before the deploy and switches on with it.
   */
  const claimHref = !NO_CHAIN && V3_DEPLOYED && RUN_DOOR && run?.over && tag
    && catsForWins(runWins.current, run.continued) > 0
    ? `/mint/v3?r=${encodeURIComponent(tag)}`
    : null

  /*
   * THE YARD LIVES ON ITS OWN PAGE NOW (JP, 2026-09-29: "remove the yard and
   * just make it its own page"). Who lives in it is lib/useYardResidents.ts,
   * moved there from here. The one thing it did that this page still needs is
   * `firstCat()`: the cat a new player arrives with.
   */
  useEffect(() => { firstCat() }, [])

  /*
   * STAMINA (lib/stamina): the cat a run is on, and one energy for each lost
   * round — charged once the round has PLAYED, so nothing on the menu can give
   * the ending away while the fight is still being told.
   */
  const runCat = useRef<string | null>(null)
  // 0 until mounted: the server has no stamina to read, so the first paint shows none either.
  const [stTick, staminaTick] = useState(0)
  useEffect(() => {
    const on = () => staminaTick(n => n + 1)
    on()
    window.addEventListener('cradle-stamina', on)
    const t = setInterval(on, 30000)
    return () => { window.removeEventListener('cradle-stamina', on); clearInterval(t) }
  }, [])
  const staminaOf = (cat: string): Stamina | null => (stTick === 0 ? null : stamina(cat))
  const charged = useRef<string | null>(null)
  useEffect(() => {
    if (!done || !result || !run || run.won || !runCat.current) return
    const key = String(result.seed)
    if (charged.current === key) return
    charged.current = key
    spendEnergy(runCat.current)
  }, [done, result, run])

  const [beat, setBeat] = useState<Beat | null>(null)
  const streaked = useRef<string | null>(null)
  useEffect(() => {
    // A quick fight saves nothing, the streak included: only a run counts.
    if (!done || !result || !run) return
    const key = String(result.seed)
    if (streaked.current === key) return
    streaked.current = key
    setBeat(result.youWon ? noteWin() : noteLoss())
  }, [done, result, run])

  useEffect(() => {
    // `recorded` covers the exhibition and the demo run; isDemo covers the demo
    // fight, which predates the flag.
    if (!done || !result || isDemo || !picked || !recorded) return
    const key = `${picked.uid}:${result.seed}`
    if (counted.current === key) return
    counted.current = key
    noteFight(picked.uid, result.youWon)
    bump(n => n + 1)
  }, [done, result, isDemo, picked, recorded])

  async function startFight(payload: { uid?: string; demo?: boolean; exhibition?: boolean; vs?: number }) {
    sound.prime()
    sound.startMusic()
    setBusy(true); setError(null); setNote(null); setConfirmRetire(false)
    setResult(null); setShown(0); setRowsShown(0); setCount(null); setDiving(false); setShowLadder(false); setLadderDone(false); setView('fight')
    // A single fight is never part of a run, so anything left over goes.
    setRun(null); setRecorded(true); setTag(null)
    try {
      const res = await fetch('/api/fight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: address,
          ...payload,
          // The guest keeps ONE cat across every mode, not one per fight.
          guest: payload.demo ? guestId() : undefined,
          /*
           * The name the player gave THIS cat, holder or guest.
           *
           * The guest half was missing, so a guest who named their cat still saw
           * "Guest #428193" in a quick fight while the gauntlet used the name.
           * One cat means one name as well as one set of numbers.
           */
          name: payload.uid
            ? nameFor(payload.uid) ?? undefined
            : payload.demo
              ? nameFor(`guest:${guestId()}`) ?? undefined
              : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'that did not work'); return }
      setResult(data)
      /*
       * A QUICK FIGHT SAVES NOTHING. JP, 2026-10-06: "quick fights are stamina
       * less but save no data". It costs no energy (lib/stamina), so it cannot
       * be allowed to build a record either: the cat's wins and losses are the
       * gauntlet's now.
       */
      setRecorded(false)
      setTag(data.tag ?? null)
      // The fight opens on the map, then 3, 2, 1, FIGHT! — the log waits for both.
      setDiving(true)
    } catch {
      setError('could not reach the arena')
    } finally {
      setBusy(false)
    }
  }

  /**
   * ENTER THE GAUNTLET.
   *
   * Five cats that belong to real people. The server plays round one and hands
   * back a ticket; everything after that goes through `choose`.
   *
   * A demo runner is welcome and is told, on the way out, that the run was not
   * recorded — see the champion card. Deciding that here would be guessing, so
   * the server's `recorded` is what gets stored.
   */
  async function startGauntlet(demo: boolean) {
    // A tired cat sits it out (lib/stamina). Checked before anything starts.
    const cat = demo || !picked ? `guest:${guestId()}` : picked.uid
    const st = stamina(cat)
    if (st.resting && st.until) {
      setError(`your cat is resting — back in ${restLeft(st.until)}. Time in the yard cuts it, down to half.`)
      return
    }
    runCat.current = cat
    sound.prime()
    sound.startMusic(trackForRound(1))
    setBusy(true); setError(null); setNote(null); setConfirmRetire(false)
    setResult(null); setShown(0); setRowsShown(0); setCount(null); setDiving(false); setShowLadder(false); setLadderDone(false); setView('fight')
    setRun(null)

    try {
      const res = await fetch('/api/gauntlet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(demo || !picked
          ? {
              demo: true,
              /*
               * THE SAME CAT EVERY VISIT.
               *
               * Without this the server rolls a guest from the request's own
               * seed, so the cat a stranger just took four rounds deep stops
               * existing the moment the run ends — nothing to grow attached to,
               * and nothing a prize can be attached to either.
               */
              guest: guestId(),
              // Whatever they called it. Stored under the guest's own uid, so
              // it is the same name next visit.
              name: nameFor(`guest:${guestId()}`) ?? undefined,
              // Only inside Farcaster. It names who may claim a won run later,
              // and it is verified properly — against a signed token — at claim.
              fid: fcFid ?? undefined,
            }
          : {
              wallet: address,
              uid: picked.uid,
              name: nameFor(picked.uid) ?? undefined,
              fid: fcFid ?? undefined,
            }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'that did not work'); return }
      takeRound(data)
    } catch {
      setError('could not reach the arena')
    } finally {
      setBusy(false)
    }
  }

  /**
   * DOUBLE THE POT, OR HEAL, then fight the next cat.
   *
   * The choice is sent WITH the ticket rather than kept here, because the health
   * it decides belongs to the run and the run lives on the server's side of the
   * signature.
   */
  async function choose(choice: 'double' | 'heal' | 'continue') {
    if (!run?.ticket || choosing) return
    sound.prime()
    // Each cat on the tower gets its own bed. With one track in the list this
    // is the same track and nothing restarts; see lib/music.ts.
    sound.startMusic(trackForRound(run.roundNo + 1))
    setChoosing(true); setError(null)
    setResult(null); setShown(0); setRowsShown(0); setCount(null); setDiving(false); setShowLadder(false); setLadderDone(false)

    try {
      const res = await fetch('/api/gauntlet/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket: run.ticket, choice }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'that did not work'); return }
      takeRound(data)
    } catch {
      setError('could not reach the arena')
    } finally {
      setChoosing(false)
    }
  }

  /** Both endpoints answer the same shape, so both land here. */
  function takeRound(data: {
    recorded: boolean; foes: FoeRef[]; pot: number; ticket: string | null
    /** Only on the final round of a run, and null when it cannot count. */
    tag: string | null
    champion: boolean; over: boolean
    canContinue?: boolean; continued?: boolean
    round: { round: number; won: boolean; fight: FightResult }
  }) {
    setRecorded(data.recorded)
    setTag(data.tag ?? null)

    /*
     * THE RUN'S PAYOFF, IN THE BUILD THAT CANNOT MINT ONE.
     *
     * On the web a finished run hands over a signed tag and /api/v3-voucher turns
     * it into a mint. There is no voucher here, so the prize is the cat itself —
     * kept on the device, named, fought with, and admitted to the yard.
     *
     * COUNTED HERE BECAUSE THE SERVER IS NOT ASKED. `catsFor` needs a verified
     * tag; `catsForWins` is the same three lines off a plain count, extracted so
     * the two builds cannot disagree about what a run is worth. Nothing is at
     * stake in getting it locally: the prize is a row in localStorage, not a
     * token, so there is nobody to cheat but yourself.
     *
     * Round 1 is the only place the count resets. A CONTINUED run keeps climbing
     * — 6, 7, 8 — and must not start again, or continuing would be a way to farm
     * the three-win rule over and over inside one run.
     */
    if (data.round.round <= 1) runWins.current = 0
    if (data.round.won) runWins.current++

    if (NO_CHAIN) {
      if (data.over) {
        const won = catsForWins(runWins.current, !!data.continued)
        for (let i = 0; i < won; i++) winCat()
        if (won > 0) setNote(won === 1 ? 'A new cat joins your yard.' : `${won} new cats join your yard.`)
      }
    }
    setRun({
      recorded: data.recorded,
      foes:     data.foes,
      roundNo:  data.round.round,
      won:      data.round.won,
      pot:      data.pot,
      ticket:   data.ticket,
      canContinue: !!data.canContinue,
      continued:   !!data.continued,
      champion: data.champion,
      over:     data.over,
    })
    setResult(data.round.fight)
    // Every round opens on the map into its place, then 3, 2, 1, FIGHT!.
    setDiving(true)
  }

  /** Leave a run behind. Used by every way out of the fight view. */
  function clearRun() {
    setRun(null); setResult(null); setShown(0); setChoosing(false); setTag(null)
  }

  /**
   * Post the result as a cast. A boast goes in the open or not at all.
   *
   * ── THE CAST IS ALSO THE RECORD ──────────────────────────────────────────
   *
   * There is no database, so a cat's seasonal record is rebuilt by reading these
   * casts back — see lib/season.ts. Two things make that work, and neither is
   * allowed to spoil the sentence:
   *
   *   the HASHTAG makes the cast findable. A search cannot index a signature.
   *   the TAG rides in the LINK, not the words. It is 138 characters of base64
   *   and the cast already carries a link, so the reader never sees it.
   *
   * No tag means the fight cannot count — a demo cat, or a quick fight, whose
   * opponent was invented and belongs to nobody. The cast still goes out; it just
   * carries the plain link.
   */
  async function share() {
    if (!result) return
    const rec = picked && !isDemo ? recordFor(picked.uid) : null

    // A run gets its own sentence: "beat X in the caves" is true of one round and
    // says nothing about the four before it.
    const line = run
      ? run.champion
        ? `${result.you.label} took the whole tower. ${run.foes.length} cats, all of them somebody's.`
        : `${result.you.label} went ${run.roundNo - 1} deep in the tower before ${run.foes[run.roundNo - 1]?.label ?? 'the next cat'} stopped it.`
      : result.youWon
        ? `${result.you.label} beat ${result.foe.label} in ${result.turf}.`
        : `${result.foe.label} put ${result.you.label} down in ${result.turf}.`

    const tail = run
      ? run.pot > 0 ? ` Pot ${run.pot}.` : ''
      : rec && rec.wins + rec.losses > 0 ? ` Now ${recordLine(rec)}.` : ''

    /*
     * INSIDE FARCASTER IT IS STILL A CAST, because the season depends on it:
     * /api/ticker rebuilds the board by searching casts for #ClankerCats and the
     * signed ?r= link. Sent to X instead, a champion's run would never be counted.
     */
    if (fcFid !== null) {
      try {
        await sdk.actions.composeCast({
          text: `${line}${tail}\n\nClanker Cats. ${SEASON_TAG}`,
          embeds: [tag ? `${APP_URL}/cradle?r=${encodeURIComponent(tag)}` : `${APP_URL}/cradle`],
        })
      } catch {
        setError('could not open the composer')
      }
      return
    }

    /*
     * EVERYWHERE ELSE, X (JP, 2026-09-29: "we dont need to share on farcaster;
     * but maybe share on X?"). X's own post intent, with the brand domain rather
     * than the Vercel one. SEASON_TAG stays with Farcaster: its "@crezno" is the
     * Farcaster handle and $CLKCAT the Base token.
     */
    const url = 'https://x.com/intent/post?' + new URLSearchParams({
      text: `${line}${tail}\n\nClanker Cats #ClankerCats`,
      url: 'https://clankercats.com',
    }).toString()
    // Inside a Farcaster client a new window is not allowed; the SDK opens it instead.
    try { await sdk.actions.openUrl(url) } catch { window.open(url, '_blank', 'noopener') }
  }

  function retire() {
    if (!picked) return
    setRetired(picked.uid, true)
    setConfirmRetire(false)
    setNote(`${picked.meta?.name ?? picked.uid} has retired.`)
    bump(n => n + 1)
  }

  async function lookUpFriend() {
    const raw = friendId.trim()
    const m = raw.match(/^(?:(v1|v2|v3):)?(\d+)$/i)
    if (!m) { setError('give a token id, or v2:412'); return }
    const col = (m[1] ?? 'v2').toLowerCase()
    const id = m[2]
    setError(null)
    try {
      const res = await fetch(`/api/meta?id=${id}&c=${col}`)
      if (!res.ok) { setError('no cat with that id'); return }
      const meta = await res.json()
      setFriends(addFriend({
        uid: `${col}:${id}`,
        name: meta?.name ?? `#${id}`,
        image: meta?.image ?? '',
      }))
      setFriendId('')
      setNote(`${meta?.name ?? `#${id}`} adopted.`)
    } catch {
      setError('could not look that cat up')
    }
  }

  /*
   * ANYONE'S CAT CAN FIND ANYONE'S CAT.
   *
   * Neither contract is enumerable and there is no index, so discovery is done
   * the only way available: pick token ids at random across both drops and read
   * their metadata. 200 in V1 and 1111 in V2, ids running 1..supply.
   *
   * Weighted by supply so a shuffle reflects the collection rather than showing
   * V1 — the rarer, sold-out drop — half the time.
   *
   * Failures are DROPPED rather than shown as blanks. A public RPC or a metadata
   * host having a bad moment should thin the row, not fill it with dead cards.
   */
  async function shuffle() {
    setFinding(true); setError(null)
    const total = COLLECTIONS.reduce((n, c) => n + c.supply, 0)

    const wanted = 9
    const picks: { col: string; id: number }[] = []
    const seen = new Set<string>()
    let guard = 0
    while (picks.length < wanted && guard++ < 200) {
      let roll = Math.floor(Math.random() * total)
      const col = COLLECTIONS.find(c => (roll -= c.supply) < 0) ?? COLLECTIONS[0]
      const id = 1 + Math.floor(Math.random() * col.supply)
      const uid = `${col.key}:${id}`
      if (seen.has(uid)) continue
      seen.add(uid)
      picks.push({ col: col.key, id })
    }

    try {
      const cats = await Promise.all(picks.map(async p => {
        try {
          const res = await fetch(`/api/meta?id=${p.id}&c=${p.col}`)
          if (!res.ok) return null
          let meta = await res.json()
          /*
           * A ROBINHOOD CAT SHOWS ITS ART, not the reveal route's "?". JP,
           * 2026-10-06: "apply the robin hood cats not the mystery ones". The art
           * is public already (the title screen's reels are V3 cats).
           */
          if (p.col === 'v3') meta = { ...meta, image: `/v3/images/${p.id}.png` }
          return { collection: p.col, id: String(p.id), uid: `${p.col}:${p.id}`, meta } as Cat
        } catch { return null }
      }))
      setFound(cats.filter(Boolean) as Cat[])
    } catch {
      setError('could not reach the collection')
    } finally {
      setFinding(false)
    }
  }

  const ranked = useMemo(() => ladder([
    ...(cats ?? []).map(c => ({ uid: c.uid, name: c.meta?.name ?? `#${c.id}`, image: c.meta?.image ?? '', mine: true })),
    ...friends.map(f => ({ uid: f.uid, name: f.name, image: f.image, mine: false })),
  ]), [cats, friends])

  /*
   * IF YOU HOLD A CAT, YOU FIGHT WITH IT. THERE IS NO DEMO.
   *
   * The demo exists for people who do not own one yet, so that "what is this?"
   * has an answer without a wallet. Offering it to a holder alongside their own
   * cat is offering them a worse version of the thing they already have.
   */
  // The loading screen waits for a connected wallet's cats (lib/loading.ts).
  useLoadingHold(isConnected && cats === null)
  const holdsCat = isConnected && (cats?.length ?? 0) > 0

  const pickable = (cats ?? []).filter(c => !recordFor(c.uid).retired)
  const retiredCount = (cats ?? []).length - pickable.length

  /** YOUR CATS and MINT, as 98 buttons (globals.css .btn98); wideNav = in their own window after a fight. */
  const navFor = (wideNav: boolean) => (
    <>
          {/* The idle game (/game) is unlinked for now (JP, 2026-09-29: "remove the idle game tab for now"). */}
          <a href="/cats" className="btn98" style={{ ...s.navLink, ...(wideNav ? s.navLinkBig : null) }}><FxLabel text="YOUR CATS" tone="grey" /></a>
          {/*
            NO WAY TO BUY ANYTHING IN THE APP BUILD.
  
            App Review Guideline 3.1.1 forbids "buttons, external links, or other
            calls to action that direct customers to purchasing mechanisms other
            than in-app purchase" — and while that half now carves out the US
            storefront, a link to a mint is the single clearest thing a reviewer
            would find. It is also pointless here: cats are won, not bought.
  
            `NO_CHAIN` is inlined at build time, so this link is not merely hidden
            in the app binary. It is not in it.
          */}
          {!NO_CHAIN && <a href="/mint" className="btn98" style={{ ...s.navLink, ...(wideNav ? s.navLinkBig : null) }}><FxLabel text="MINT" tone="grey" /></a>}
      </>
  )
  const navLinks = navFor(false)
  const navLinksBig = navFor(true)

  return (
    <main style={s.page}>
      {/* The title screen's page (JP, 2026-09-29). A fight brings the zone it is in. */}
      <header style={s.header}>
        {/* The name of the game, and no "preview" — the same change as the link card. */}
        {/*
          On the light checker the white heading all but vanished, so it is the
          game's own title now: gold and waving, as the loading screen has it,
          with a 2px ink outline that holds on any colour the checker turns to.
        */}
        <h1 aria-label="CLANKER CATS" style={{ ...s.title, display: 'flex', justifyContent: 'center', filter: 'drop-shadow(2px 0 0 #1a1a1a) drop-shadow(-2px 0 0 #1a1a1a) drop-shadow(0 2px 0 #1a1a1a) drop-shadow(0 -2px 0 #1a1a1a)' }}>
          <BitmapText text="CLANKER CATS" scale={3} color="#b07a10" fx />
        </h1>
      </header>

      {/*
        Sound sits at the top and is always reachable. A game that starts making
        noise with no visible way to stop it gets closed, not muted — and both
        settings are remembered, so it does not come back loud next time.
      */}
      <div style={{ ...s.soundRow, ...(wide ? { width: WIDE, alignSelf: 'center' } : null) }}>
        {/*
          SPEED sits with the sound because both are settings about HOW the fight
          is delivered rather than what happens in it, and because this row is the
          one thing on screen during a bout — the speed can be changed while the
          log is still running, which is when a person actually wants it.
        */}
        <div style={s.speedGroup} role="group" aria-label="playback speed">
          {SPEEDS.map(v => {
            const locked = !unlocked.includes(v)
            return (
              <button
                key={v}
                /*
                  A locked speed is NOT `disabled`. A disabled button takes no tap,
                  so on a phone it would sit there greyed out with no way to learn
                  why — and a tooltip is no use without a mouse. It stays tappable
                  and says what it is instead.
                */
                onClick={() => {
                  if (locked) { setNote(`x${v} is won by taking a season.`); return }
                  setSpeed(v)
                }}
                style={{
                  ...s.soundBtn,
                  ...(locked ? s.speedLocked : null),
                  ...(speed === v ? s.speedOn : null),
                }}
                aria-pressed={speed === v}
                aria-disabled={locked}
                title={locked ? `x${v} — won by taking a season` : `play at x${v}`}
              >
                {locked ? '🔒' : ''}x{v}
              </button>
            )
          })}
        </div>

        {/*
          THE COUNTER SITS BETWEEN the speeds and the sound. Both groups already
          push to their own edge, so a second auto margin here lands it in the
          gap between them without any absolute positioning.
        */}
        <HitCounter />

        <button
          style={s.soundBtn}
          onClick={() => sound.setMuted(!sound.muted)}
          aria-label={sound.muted ? 'unmute' : 'mute'}
          title={sound.muted ? 'unmute' : 'mute'}
        >
          {sound.muted ? '🔇' : '🔊'}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={sound.volume}
          onChange={e => sound.setVolume(Number(e.target.value))}
          style={s.slider}
          aria-label="volume"
          disabled={sound.muted}
        />
      </div>

      {note && <p style={{ ...s.quiet, color: '#7ee081' }}>{note}</p>}
      {error && <p style={{ ...s.quiet, color: '#ff8080' }}>{error}</p>}

      {view === 'home' && (
        <>
          {isConnected && cats === null && <p style={s.quiet}>looking for your cats…</p>}

          {isConnected && pickable.length > 0 && (
            <section className="win98" data-title="Clanker Cats" style={s.block}>
              <p style={s.label}>SELECT YOUR CLANKER CAT!</p>
              <div style={s.grid}>
                {pickable.map(c => {
                  const col = getCollection(c.collection)
                  return (
                    <button
                      key={c.uid}
                      /*
                       * SELECTS, rather than starting a fight on the spot as it
                       * used to. There are three modes now, so the cat and the
                       * mode are two questions and the tap can only answer one.
                       */
                      onClick={() => setPicked(picked?.uid === c.uid ? null : c)}
                      disabled={busy}
                      style={picked?.uid === c.uid
                        ? { ...s.card, ...s.cardPicked }
                        : s.card}
                    >
                      {c.meta?.image
                        ? <img src={c.meta.image} alt="" style={{
                            width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block',
                            imageRendering: col.pixelArt ? 'pixelated' : 'auto',
                          }} />
                        : <div style={s.placeholder}>🐱</div>}
                      {/* The holder's own name wins over the collection's. */}
                      <div style={s.cardLabel}>{nameFor(c.uid) ?? c.meta?.name ?? `#${c.id}`}</div>
                      <div style={s.cardRec}>{recordLine(recordFor(c.uid))}</div>
                    </button>
                  )
                })}
              </div>
              {retiredCount > 0 && <p style={s.fine}>{retiredCount} retired — see the rankings</p>}

              {/*
                THE THREE MODES.

                Only once a cat is chosen: every one of them needs to know which
                cat is fighting, and three buttons that cannot be pressed yet are
                worse than three that are not there.
              */}
              {picked ? (
                <div style={{ ...s.modes, ...s.fighterRow }}>
                  <div style={s.fighterOpts}>
                    <button className="fx-host" style={s.primary} disabled={busy}
                      onClick={() => startFight({ uid: picked.uid })}>
                      <FxLabel text={"QUICK FIGHT"} tone='light' />
                    </button>
                    <p style={s.modeFine}>one fight · just for fun, nothing is saved</p>

                    <button className="fx-host" style={s.gauntlet} disabled={busy}
                      onClick={() => startGauntlet(false)}>
                      <FxLabel text={"GAUNTLET"} tone='gold' />
                    </button>
                    <p style={s.modeFine}>five cats people own · survive it to be champion</p>
                    <EnergyLine st={staminaOf(picked.uid)} />

                    {/* THE YARD AS AN OPTION (JP, 2026-09-28), beside the fights. */}
                    <a href="/yard" className="fx-host" style={s.yardBtn}><FxLabel text="THE YARD" tone="green" /></a>
                    <p style={s.modeFine}>your cats and the cats of people you follow</p>
                  </div>
                  <FighterPortrait
                    name={nameFor(picked.uid) ?? picked.meta?.name ?? `#${picked.id}`}
                    src={picked.meta?.image}
                    pixel={getCollection(picked.collection).pixelArt}
                  ><CatLinks /></FighterPortrait>
                </div>
              ) : (
                <p style={s.fine}>pick a cat to choose a mode</p>
              )}
            </section>
          )}

          {isConnected && cats?.length === 0 && (
            <section className="win98" data-title="Clanker Cats" style={s.block}>
              <p style={{ margin: '0 0 10px' }}>No Clanker Cat in this wallet.</p>
              <a href="https://opensea.io/collection/clanker-cats" style={s.link}>find one →</a>
            </section>
          )}

          {/* The demo is for people without a cat. A holder never sees it. */}
          {!holdsCat && (
            <section className="win98" data-title="Clanker Cats" style={s.block}>
              <p style={s.label}>{isConnected ? 'NO CAT YET' : 'HAVE A LOOK FIRST'}</p>
              {/*
                The guest's fighter is the cat its code rolls: the same picture and
                name the fight itself draws for it (see guestCat in /api/fight).
              */}
              <div style={s.fighterRow}>
                <div style={s.fighterOpts}>
                  <button className="fx-host" style={s.primary} onClick={() => { setPicked(null); startFight({ demo: true }) }} disabled={busy}>
                    <FxLabel text={"QUICK FIGHT"} tone='light' />
                  </button>
                  <p style={s.modeFine}>a real fight, with a cat that is not yours — no wallet needed</p>

                  {/*
                    THE DEMO GETS THE GAUNTLET TOO.

                    A demo that plays by different rules is not showing anybody the
                    game. Nothing a demo does is recorded either way, so the only
                    thing being withheld at the end is the title.
                  */}
                  <button className="fx-host" style={s.gauntlet} disabled={busy}
                    onClick={() => { setPicked(null); startGauntlet(true) }}>
                    <FxLabel text={"GAUNTLET"} tone='gold' />
                  </button>
                  <p style={s.modeFine}>five cats people own · a demo run is never recorded</p>
                  <EnergyLine st={staminaOf(`guest:${guestId()}`)} />

                  {/* THE YARD AS AN OPTION (JP, 2026-09-28). /yard shows the demo yard to a guest. */}
                  <a href="/yard" className="fx-host" style={s.yardBtn}><FxLabel text="THE YARD" tone="green" /></a>
                  <p style={s.modeFine}>the cats together, when nobody is fighting</p>
                </div>
                {myCode > 0 && (
                  <FighterPortrait
                    name={nameFor(`guest:${myCode}`) ?? strayName(myCode)}
                    src={`/api/cat-art?seed=${myCode}`}
                  ><CatLinks /></FighterPortrait>
                )}
              </div>

              {/*
                FIGHT A FRIEND — guest PVP, and the reason it needs no database.

                Two guests cannot share a ranking, because there is nowhere to keep
                one. They do not need to: an exhibition does not count, so they
                fight for the fight and the record starts when they adopt.
              */}
              <p style={{ ...s.label, marginTop: 8 }}>FIGHT A FRIEND</p>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {/*
                  THE CODE AS A PICTURE. Reading six digits aloud is the worst part
                  of doing this in person, and a sticker cannot be typed off a wall
                  at all — the QR is the same deep link the box already accepts.
                */}
                {myCode > 0 && (
                  <img
                    src={`/api/qr?vs=${myCode}`}
                    alt={`QR code for cat ${myCode}`}
                    width={84}
                    height={84}
                    style={{ borderRadius: 6, flexShrink: 0, background: '#fff' }}
                  />
                )}
                {/*
                  JP, 2026-10-06: "make this text a bit bigger", then "make it more
                  readable". The code on its own line in the game's font, gold, so
                  it is the thing you read off; what to do with it underneath, in
                  short plain lines rather than one long dim sentence.
                */}
                <div style={{ minWidth: 0 }}>
                  <p style={{ ...s.fine0, fontSize: 21, color: '#000080', marginBottom: 4 }}>Your cat&rsquo;s code</p>
                  <BitmapText text={myCode ? String(myCode) : '......'} scale={2} color="#b07a10" />
                  <p style={{ ...s.fine0, fontSize: 21, lineHeight: 1.45, color: '#1a1a1a', marginTop: 6 }}>
                    Give it to a friend, or let them scan the code. Then they can fight your cat.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input
                  value={vsCode}
                  onChange={e => setVsCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="their code, e.g. 428193"
                  inputMode="numeric"
                  style={s.input}
                />
                <button className="fx-host"
                  style={{ ...s.primary, width: 'auto', padding: '7px 14px' }}
                  onClick={fightCode}
                  disabled={busy}
                >
                  <FxLabel text={"FIGHT"} tone='light' />
                </button>
              </div>
              <p style={s.modeFine}>an exhibition &middot; nothing is recorded until you adopt a cat</p>
              {!isConnected && (
                <>
                  <p style={{ ...s.fine, marginTop: 14 }}>
                    Open in Farcaster to connect on its own, or pick a wallet:
                  </p>
                  {webConnectors
                    .map(c => (
                      <button className="fx-host" key={c.id} style={s.ghost} onClick={() => connect({ connector: c })}>
                        <FxLabel text={c.name.toUpperCase()} tone='grey' />
                      </button>
                    ))}
                </>
              )}
            </section>
          )}


          <section className="win98" data-title="Clanker Cats" style={s.block}>
            <p style={s.label}>FRIENDS</p>
            <p style={s.fine0}>Adopt a cat by its number, or shuffle through the collection.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input
                value={friendId}
                onChange={e => setFriendId(e.target.value)}
                placeholder="token id, e.g. 412 or v1:46"
                style={s.input}
              />
              <button className="fx-host" style={{ ...s.primary, width: 'auto', padding: '7px 14px' }} onClick={lookUpFriend}>
                <FxLabel text={"ADOPT"} tone='light' />
              </button>
            </div>
            {friends.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {friends.map(f => (
                  <RankRow
                    key={f.uid}
                    place={0}
                    r={{ uid: f.uid, name: f.name, image: f.image, mine: false, record: recordFor(f.uid) }}
                    onDrop={() => setFriends(removeFriend(f.uid))}
                  />
                ))}
              </div>
            )}
            <button className="fx-host"
              style={s.ghost}
              onClick={() => { setView('adopt'); if (!found) shuffle() }}
            >
              <FxLabel text={"ADOPT A CAT"} tone='grey' />
            </button>
            <button className="fx-host" style={s.ghost} onClick={() => setView('ranks')}><FxLabel text={"RANKINGS"} tone='grey' /></button>
          </section>
        </>
      )}

      {/* ── ADOPT ────────────────────────────────────────────────────────── */}
      {view === 'adopt' && (
        <section className="win98" data-title="Clanker Cats" style={s.block}>
          <p style={s.label}>ADOPT</p>
          <p style={s.fine0}>
            Any cat from any drop. Adopt one and it stands beside yours in the rankings.
          </p>

          {finding && <p style={s.quiet}>looking for a cat to adopt…</p>}

          {found && found.length > 0 && (
            <div style={{ ...s.grid, marginTop: 12 }}>
              {found.map(c => {
                const already = friends.some(f => f.uid === c.uid)
                return (
                  <div key={c.uid} style={s.cardWrap}>
                  <button
                    disabled={already}
                    onClick={() => {
                      setFriends(addFriend({
                        uid: c.uid,
                        name: c.meta?.name ?? `#${c.id}`,
                        image: c.meta?.image ?? '',
                      }))
                      setNote(`${c.meta?.name ?? `#${c.id}`} adopted.`)
                    }}
                    style={{ ...s.card, opacity: already ? 0.45 : 1 }}
                  >
                    {c.meta?.image
                      ? <img src={c.meta.image} alt="" style={{
                          width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block',
                          imageRendering: getCollection(c.collection).pixelArt ? 'pixelated' : 'auto',
                        }} />
                      : <div style={s.placeholder}>🐱</div>}
                    <div style={s.cardLabel}>{c.meta?.name ?? `#${c.id}`}</div>
                    <div style={s.cardRec}>{already ? 'adopted' : 'adopt'}</div>
                  </button>
                  {/* The token itself on OpenSea — JP, 2026-10-06: "a link to the Open Sea link for the nft". */}
                  <a href={tokenLink(c.collection, c.id).href} target="_blank" rel="noopener noreferrer" style={s.osLink}>{tokenLink(c.collection, c.id).label} ↗</a>
                  </div>
                )
              })}
            </div>
          )}

          {found && found.length === 0 && !finding && (
            <p style={s.quiet}>nothing came back — try again.</p>
          )}

          <button className="fx-host" style={s.primary} onClick={shuffle} disabled={finding}>
            <FxLabel text={"SHUFFLE"} tone='light' />
          </button>
          <button className="fx-host" style={s.ghost} onClick={() => setView('home')}><FxLabel text={"BACK"} tone='grey' /></button>
        </section>
      )}

      {view === 'ranks' && (
        <>
          {/*
            TWO BOARDS, and they are not the same thing.

            The GLOBAL one is the season: every cat that took all five, ranked on
            the pot it banked, rebuilt from casts. It is the same for everybody.

            The one below it is this device's own record of every fight it has
            watched. Keeping them apart matters — one is a public standing and the
            other is a private tally, and running them together would imply the
            local numbers were being compared against anybody else's.
          */}
          <SeasonBoard mine={new Set((cats ?? []).map(c => c.uid))} />

          <section className="win98" data-title="Clanker Cats" style={s.block}>
            <p style={s.label}>ON THIS DEVICE</p>
            {ranked.length === 0
              ? <p style={s.quiet}>no cats yet — connect a wallet or add a friend.</p>
              : ranked.map((r, i) => <RankRow key={r.uid} r={r} place={i + 1} />)}
            <p style={s.fine}>Records are kept on this device. The public version of a result is a cast.</p>
            <button className="fx-host" style={s.ghost} onClick={() => setView('home')}><FxLabel text={"BACK"} tone='grey' /></button>
          </section>
        </>
      )}

      {view === 'fight' && (
        <>
          {busy && <p style={s.quiet}>the cats are sizing each other up…</p>}

          {result && (
            <>
              {/*
                THE s&box BATTLE SCREEN (components/FightStage), which replaced two
                cards and a turf line. The whole screen shakes on a crit or a KO,
                as the game's does.
              */}
              {/*
                AS BIG AS THE WINDOW ALLOWS (JP, 2026-09-29: "too much empty space;
                make it fit better"). Inside the page's 520 column the screen was
                480 wide and sat at the top of an empty page. It breaks out of the
                column now: the full width less a margin, never more than 2x the
                game (960), and never taller than the window below the header.
                alignSelf centres it however far it overflows the column.

                AND IN THE MIDDLE UNTIL THE RESULTS ARRIVE. The auto margins share
                the free space with the footer's; once the results card is there,
                there is none left to share and the screen sits at the top again.
              */}
              <div style={{
                // A phone: edge to edge — the column plus the page's 18px padding either side.
                width: narrow ? 'calc(100% + 36px)' : WIDE,
                alignSelf: 'center',
                ...(done ? null : { marginTop: 'auto', marginBottom: 'auto' }),
                animation: at?.kind === 'crit' || at?.kind === 'ko'
                  ? `cradle-shake${shown % 2 === 1 ? '-b' : ''} ${0.3 / speed}s ease-out`
                  : undefined,
              }}>
                <FightStage
                  you={result.you}
                  foe={result.foe}
                  hp={[shownHp ? shownHp.hpYou : result.you.maxHp, shownHp ? shownHp.hpFoe : result.foe.maxHp]}
                  ghost={[trailHp ? trailHp.hpYou : result.you.maxHp, trailHp ? trailHp.hpFoe : result.foe.maxHp]}
                  turf={result.turf}
                  swinging={at?.actor === 'you' || at?.actor === 'foe' ? at.actor : null}
                  struck={struckSide ? { side: struckSide, kind: hitKind } : null}
                  beat={shown}
                  speed={speed}
                  lines={result.log.slice(0, shown)}
                  crop={narrow && !diving && !showLadder}
                  float={float}
                  catsIn={!diving}
                  catsFadeMs={(3 * BEAT_MS) / speed}
                >
                  {showLadder && run && (
                    <LadderScreen
                      foes={run.foes.map(f => ({
                        uid: f.uid,
                        name: nameFor(f.uid) ?? f.label,
                        art: f.art ?? '',
                        pixel: getCollection(f.collection).pixelArt,
                      }))}
                      beaten={run.roundNo}
                      you={{ name: result.you.label, art: result.you.art }}
                      champion={run.champion}
                      pot={run.pot}
                      onDone={() => { setShowLadder(false); setLadderDone(true) }}
                    />
                  )}
                  {diving && (
                    <MapDive
                      zone={zoneOfTurf(result.turf)}
                      cast={[result.you.art, result.foe.art]}
                      onDone={() => { setDiving(false); setCount(3) }}
                    />
                  )}
                  {/*
                  3, 2, 1, FIGHT! over the stage, in the game's font because
                  MyFont has no digits — a countdown is nothing but digits.
                  Keyed on the beat so each one replays the drop.
                */}
                {count !== null && (
                  <div style={s.countWrap}>
                    <div key={count} style={{ animation: `cradle-count ${0.45 / speed}s ease-out` }}>
                      {/*
                        "make the 3 2 1 fight text Shake": a tremble for the whole
                        beat, on its own layer so it never fights the drop's scale.
                        Stepped, so it jumps pixel to pixel like the game's shakes.
                      */}
                      {/*
                        "also make the 321 fight text look better; give it a out
                        line": a 3px ink outline round the glyphs' own shape (four
                        drop-shadows follow the mask), then a hard 4px ink shadow —
                        the ladder title's and the place card's look, at this size.
                      */}
                      <div style={{ animation: `cradle-shake ${0.16 / speed}s steps(5) infinite`, filter: COUNT_INK }}>
                        <BitmapText
                          text={count === 0 ? 'FIGHT!' : String(count)}
                          scale={count === 0 ? 4 : 6}
                          color={count === 0 ? '#ffd166' : '#f0f0f5'}
                        />
                      </div>
                    </div>
                  </div>
                )}
                </FightStage>
              </div>

              {/*
                THE OLD PAPER LOG, ON A PHONE ONLY. On a wider screen the log is in
                the battle screen's text box, as it is in the game.
              */}
              {narrow && (
                <div ref={logRef} style={s.log}>
                  {result.log.slice(0, shown).map((l, i) => (
                    <div key={i} style={{
                      margin: '0 0 6px',
                      animation: l.kind === 'crit' ? `cradle-crit ${0.45 / speed}s ease-out` : undefined,
                    }}>
                      <BitmapText
                        text={l.text}
                        scale={l.style === 'announce' ? 2 : 1}
                        color={KIND_INK[l.kind] ?? INK}
                      />
                    </div>
                  ))}
                  {!done && <span style={s.caret}>▌</span>}
                </div>
              )}

              {/*
                THE RESULTS CARD.

                On paper like the log, because it is the same surface in the game
                — and drawn in the game's BITMAP font, which matters for more than
                looks: MyFont has no digits at all, so every number in it would
                fall back to another face. The bitmap sheet carries the full set.
              */}
              {/*
                THE RESULTS, AT THE SCREEN'S WIDTH, IN TWO COLUMNS (JP: "make the
                results fit better as well"). They were a single file in the 520
                column under a 960 screen. Now the card is on one side and the
                streak and the buttons on the other; on a narrow screen the
                columns stack, which is what they did before.
              */}
              {done && (
              <div style={{ ...s.after, width: WIDE }}>
              {done && result.rows.length > 0 && (
                <section ref={cardRef} className="win98" data-title="Results" style={{ ...s.resultCard, animation: 'results-in 0.45s ease-out both' }}>
                  {/*
                    CONFETTI ONLY WHEN YOU WON — deliberate, and checked.

                    The card names and pictures whoever won either way, so it
                    would be consistent to throw confetti for their victory too.
                    It does not: the celebration is YOURS or it does not happen.
                    A loss gets the winner's portrait and the winner's score, and
                    no party.
                  */}
                  {result.youWon && <Confetti seed={result.seed} />}

                  {/*
                    NAME THE WINNER ON THE CARD.

                    The score belongs to whoever won, which is how the game's
                    results screen works — but on a loss that put someone else's
                    Victory and Clutch directly under "Your cat went down.", and
                    it read as though the points were yours. Saying whose they are
                    costs one line and removes the whole confusion.
                  */}
                  <div style={{ marginBottom: 4 }}>
                    <BitmapText text="RESULTS" scale={2} color="#a06a10" />
                  </div>
                  {/*
                    THE VICTOR, in the middle of the card.

                    The game's own results screen leads with the winner's portrait
                    and the word under it; this card was text all the way down and
                    never showed you the cat that won. It is the same construction:
                    picture, then VICTOR, then the score.

                    The frame is the paper's ink rather than the app's purple —
                    everything inside this card belongs to the game's palette, and
                    a violet ring on cream would be the only thing in here that
                    came from the website.
                  */}
                  {(() => {
                    const won = result.youWon ? result.you : result.foe
                    return (
                      <div style={s.victor}>
                        {won.art
                          ? <img src={won.art} alt="" style={s.victorPic} />
                          : <div style={{ ...s.victorPic, display: 'grid', placeItems: 'center', fontSize: 40 }}>🐱</div>}
                        <BitmapText text="VICTOR" scale={2} color="#b07a10" fx />
                      </div>
                    )
                  })()}

                  <div style={{ marginBottom: 12 }}>
                    <BitmapText
                      text={named(result.youWon ? result.you.label : result.foe.label) + ' TAKES IT'}
                      scale={1}
                      color="#6b6b60"
                    />
                  </div>

                  {result.rows.slice(0, rowsShown).map((row, i) => (
                    <div key={i} style={{ ...s.scoreRow, animation: 'cradle-row-in 0.32s ease-out' }}>
                      <BitmapText text={row.name} scale={1} color={row.colour} />
                      <BitmapText text={String(row.score)} scale={1} color={row.colour} />
                    </div>
                  ))}

                  {rowsShown > result.rows.length && (
                    <div style={{ ...s.totalRow, animation: 'cradle-total-in 0.4s ease-out' }}>
                      <BitmapText text="TOTAL" scale={2} color={INK} />
                      <BitmapText text={String(result.total)} scale={2} color="#a06a10" />
                    </div>
                  )}
                </section>
              )}

              <div style={{ ...s.afterSide, animation: 'results-in 0.45s ease-out 0.15s both' }}>
              {done && beat && <StreakLine beat={beat} />}

              {/*
                THE RUN'S OWN ENDING.

                Three states share this block and they are mutually exclusive:
                the run goes on and a choice is owed, the cat fell, or the cat
                went the distance.
              */}
              {done && run && (
                <section className="win98" data-title="Clanker Cats" style={s.block}>
                  <RunTrack run={run} perfect={perfect} />
                  <GauntletLadder run={run} />

                  {/* STILL GOING — the choice. */}
                  {run.won && !run.champion && run.ticket && (
                    <>
                      <p style={{ margin: '14px 0 2px', fontSize: 16, color: '#5fc27e' }}>
                        Round {run.roundNo} is yours.
                      </p>
                      <p style={s.fine0}>
                        {run.foes[run.roundNo]?.label ?? 'the next cat'} is next. Choose.
                      </p>

                      <button className="fx-host" style={{ ...s.gauntlet, marginTop: 14 }} disabled={choosing}
                        onClick={() => choose('double')}>
                        <FxLabel text={`DOUBLE THE POT → ${run.pot * 2}`} tone="gold" />
                      </button>
                      <p style={s.modeFine}>
                        keep the damage you are carrying
                      </p>

                      <button className="fx-host" style={s.primary} disabled={choosing}
                        onClick={() => choose('heal')}>
                        <FxLabel text={"HEAL TO FULL"} tone='light' />
                      </button>
                      <p style={s.modeFine}>the pot stays at {run.pot}</p>

                      {choosing && <p style={s.quiet}>the next cat is walking on…</p>}
                    </>
                  )}

                  {/*
                    GAME OVER — and while a continue is unspent, an offer rather
                    than an ending.

                    The price is a repost, which is self-limiting: a recast can
                    only be spent once on a cast, so the platform caps this at one
                    without any counting here. What it costs is the CEILING — a
                    continued run earns one cat however deep it goes, never two —
                    and that is said plainly on the button rather than discovered
                    at the claim.
                  */}
                  {!run.won && run.canContinue && (
                    <>
                      <div style={{ margin: '14px 0 6px', textAlign: 'center' }}>
                        <BitmapText text="GAME OVER" scale={2} color="#d1495b" />
                      </div>
                      <p style={s.fine0}>
                        {run.foes[run.roundNo - 1]?.label ?? 'that cat'} put you down on
                        round {run.roundNo}.
                      </p>

                      <button className="fx-host" style={{ ...s.gauntlet, marginTop: 14 }} disabled={choosing}
                        onClick={() => choose('continue')}>
                        <FxLabel text={"REPOST TO CONTINUE"} tone='gold' />
                      </button>
                      <p style={s.modeFine}>
                        back to full health, same cat, fresh fight · you can still
                        win one cat, but not two
                      </p>

                      <button className="fx-host" style={s.ghost} onClick={() => { clearRun(); setView('home') }}>
                        <FxLabel text={"GIVE UP"} tone='grey' />
                      </button>
                    </>
                  )}

                  {/* FELL for good. The pot goes with them — the other half of doubling. */}
                  {!run.won && !run.canContinue && (
                    <>
                      <div style={{ margin: '14px 0 6px', textAlign: 'center' }}>
                        <BitmapText text="GAME OVER" scale={2} color="#d1495b" />
                      </div>
                      <p style={s.fine0}>Down on round {run.roundNo}.</p>
                      <p style={s.fine0}>
                        {run.roundNo - 1} of {run.foes.length} beaten. The pot is gone.
                      </p>
                      {claimHref && (
                        <>
                          <a href={claimHref} className="fx-host" style={{ ...s.gauntlet, marginTop: 14, display: 'block', boxSizing: 'border-box', textAlign: 'center', textDecoration: 'none' }}>
                            <FxLabel text="CLAIM YOUR CAT" tone="gold" />
                          </a>
                          <p style={s.modeFine}>three wins earns one · free, on Robinhood Chain · one per wallet</p>
                        </>
                      )}
                      <button className="fx-host" style={claimHref ? s.ghost : { ...s.gauntlet, marginTop: 14 }} disabled={busy}
                        onClick={() => startGauntlet(!run.recorded)}>
                        <FxLabel text="RUN IT AGAIN" tone={claimHref ? 'grey' : 'gold'} />
                      </button>
                      <button className="fx-host" style={s.ghost} onClick={() => { clearRun(); setView('home') }}>
                        <FxLabel text={"BACK"} tone='grey' />
                      </button>
                    </>
                  )}

                  {/* CHAMPION. */}
                  {run.champion && (
                    <>
                      <div style={{ margin: '16px 0 6px' }}>
                        <BitmapText text="CHAMPION" scale={2} color="#e0a72c" />
                      </div>
                      <p style={s.fine0}>
                        {run.foes.length} cats, all of them somebody's. Pot {run.pot}.
                      </p>

                      {/*
                        TELL A DEMO CHAMPION THE TRUTH, right here on the card.
                        They earned the run; they did not earn the title, and
                        finding that out later would be worse than reading it now.
                      */}
                      {!run.recorded && (
                        <p style={{ ...s.fine, color: '#8a7a4a' }}>
                          A demo run is not recorded and earns no title. Get a cat
                          of your own and it counts.
                        </p>
                      )}

                      {claimHref && (
                        <>
                          <a href={claimHref} className="fx-host" style={{ ...s.gauntlet, marginTop: 14, display: 'block', boxSizing: 'border-box', textAlign: 'center', textDecoration: 'none' }}>
                            <FxLabel text="CLAIM YOUR CAT" tone="gold" />
                          </a>
                          <p style={s.modeFine}>free, on Robinhood Chain · one per wallet</p>
                        </>
                      )}
                      <button className="fx-host" style={{ ...s.primary, marginTop: 14 }} onClick={share}>
                        <FxLabel text={fcFid !== null ? 'CAST IT' : 'SHARE ON X'} tone='light' />
                      </button>
                      <button className="fx-host" style={s.ghost} disabled={busy}
                        onClick={() => startGauntlet(!run.recorded)}>
                        <FxLabel text={"RUN IT AGAIN"} tone='grey' />
                      </button>
                      <button className="fx-host" style={s.ghost} onClick={() => { clearRun(); setView('home') }}>
                        <FxLabel text={"BACK"} tone='grey' />
                      </button>
                    </>
                  )}
                </section>
              )}

              {/* A run has its own ending, and its own buttons, above. */}
              {done && !run && (
                <section className="win98" data-title="Clanker Cats" style={s.block}>
                  <p style={{ margin: '0 0 4px', fontSize: 16, color: result.youWon ? '#5fc27e' : '#d1495b' }}>
                    {result.youWon ? 'Your cat took it.' : 'Your cat went down.'}
                  </p>
                  {picked && !isDemo && (
                    <p style={s.fine0}>
                      {picked.meta?.name ?? picked.uid} · {recordLine(recordFor(picked.uid))}
                    </p>
                  )}

                  <button className="fx-host" style={{ ...s.primary, marginTop: 12 }} onClick={share}>
                    <FxLabel text={fcFid !== null ? 'CAST IT' : 'SHARE ON X'} tone='light' />
                  </button>

                  <button className="fx-host"
                    style={s.ghost}
                    onClick={() => (isDemo || !picked
                      ? startFight({ demo: true })
                      : startFight({ uid: picked.uid }))}
                  >
                    <FxLabel text={"FIGHT AGAIN"} tone='grey' />
                  </button>

                  {/*
                    NAMING IS FOR HOLDERS. A demo cat is nobody's, so there is
                    nothing to name — and the name is what makes the cat yours
                    rather than a token number, so it belongs to the person who
                    actually holds it.
                  */}
                  {picked && !isDemo && (
                    naming ? (
                      <div style={{ marginTop: 10 }}>
                        <p style={s.fine0}>What is this cat called?</p>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <input
                            value={nameDraft}
                            onChange={e => setNameDraft(e.target.value)}
                            maxLength={NAME_LIMIT}
                            placeholder={picked.meta?.name ?? `#${picked.id}`}
                            style={s.input}
                            autoFocus
                          />
                          <button className="fx-host"
                            style={{ ...s.primary, width: 'auto', padding: '7px 14px' }}
                            onClick={() => {
                              const saved = setName(picked.uid, nameDraft)
                              setNaming(false)
                              setNote(saved ? `Now called ${saved}.` : 'Name cleared.')
                              bump(n => n + 1)
                            }}
                          >
                            <FxLabel text={"SAVE"} tone='light' />
                          </button>
                        </div>
                        <p style={s.fine}>Leave it empty to go back to the collection name.</p>
                      </div>
                    ) : (
                      <button className="fx-host"
                        style={s.ghost}
                        onClick={() => {
                          setNameDraft(nameFor(picked.uid) ?? '')
                          setNaming(true)
                        }}
                      >
                        <FxLabel text={nameFor(picked.uid) ? 'RENAME THIS CAT' : 'NAME THIS CAT'} tone='grey' />
                      </button>
                    )
                  )}

                  {picked && !isDemo && !recordFor(picked.uid).retired && (
                    confirmRetire ? (
                      <div style={{ marginTop: 10 }}>
                        <p style={s.fine0}>Retiring keeps the record and stops the fighting. Sure?</p>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button className="fx-host"
                            // `border`, not `borderColor`: s.ghost sets the
                            // shorthand, so the longhand was being dropped and
                            // this destructive button kept the plain grey edge.
                            style={{ ...s.ghost, marginTop: 0, border: '1px solid #d1495b', color: '#d1495b' }}
                            onClick={retire}
                          >
                            <FxLabel text={"YES, RETIRE"} tone='red' />
                          </button>
                          <button className="fx-host" style={{ ...s.ghost, marginTop: 0 }} onClick={() => setConfirmRetire(false)}>
                            <FxLabel text={"KEEP FIGHTING"} tone='grey' />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button className="fx-host" style={s.ghost} onClick={() => setConfirmRetire(true)}><FxLabel text={"RETIRE THIS CAT"} tone='grey' /></button>
                    )
                  )}

                  <button className="fx-host" style={s.ghost} onClick={() => setView('ranks')}><FxLabel text={"RANKINGS"} tone='grey' /></button>
                  <button className="fx-host" style={s.ghost} onClick={() => { setResult(null); setShown(0); setView('home') }}>
                    <FxLabel text={"BACK"} tone='grey' />
                  </button>
                </section>
              )}
              {/* JP, 2026-10-06: YOUR CATS and MINT under the menu, in the space beside the results. */}
              {/* In a 98 window of their own, the two side by side and full size (JP, 2026-10-06). */}
              <section className="win98" data-title="Clanker Cats" style={s.block}>
                <nav style={s.navWin}>{navLinksBig}</nav>
              </section>
              </div>
              </div>
              )}
            </>
          )}

          {!result && !busy && <button className="fx-host" style={s.ghost} onClick={() => setView('home')}><FxLabel text={"BACK"} tone='grey' /></button>}
        </>
      )}

      {/*
        THE OLDER APPS.

        The Cradle took the front door — `/` used to redirect straight to the idle
        game — so the things that used to be there need a way back. On every view
        rather than behind a menu: this is a mini app on a phone, and a menu to
        reach three links is a menu too many.
      */}
      {/* After a fight the links sit in their own window beside the results instead (navLinksBig). */}
      {view !== 'home' && !(view === 'fight' && done) && <nav style={s.nav}>{navLinks}</nav>}

      <footer style={s.footer}>Clanker Cats — the full game is being built in s&amp;box</footer>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  /*
   * THE RUN TRACKER — Artifact's shape: pips for the wins, one slot for the
   * loss. Gold is the run's colour everywhere else here, so an earned pip is
   * gold and an empty one is the panel with a hairline.
   */
  track:       { border: '1px solid #21212f', borderRadius: 12, background: '#0b0b13', padding: '14px 12px 16px', marginBottom: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  trackTop:    { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  trackLabel:  { fontSize: 10, letterSpacing: 2, color: '#63637d' },
  trackCount:  { fontSize: 13, color: '#e0a72c', fontVariantNumeric: 'tabular-nums' },
  trackRow:    { display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 20 },
  trackSide:   { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  trackHead:   { fontSize: 9, letterSpacing: 2, color: '#4a4a5e' },
  pips:        { display: 'flex', alignItems: 'center' },
  pipWrap:     { display: 'flex', alignItems: 'center' },
  // The connector is lit only once the pip it leads INTO has been won.
  pipLink:     { width: 16, height: 3, background: '#21212f' },
  pipLinkOn:   { background: '#e0a72c', boxShadow: '0 0 6px rgba(224,167,44,0.5)' },
  // A CHECKBOX, not a bead: a win is a thing you tick off. Square, lightly
  // rounded, and it holds the round number until it is earned.
  pip:         { width: 44, height: 44, borderRadius: 8, border: '2px solid #2b2b3a', background: '#12121c', display: 'grid', placeItems: 'center', flexShrink: 0 },
  // The full `border` shorthand, not `borderColor`: pip sets the shorthand,
  // and React drops one to apply the other. 2px to match pip exactly.
  pipOn:       { border: '2px solid #e0a72c', background: '#e0a72c', boxShadow: '0 0 12px rgba(224,167,44,0.45)' },
  // 3 and 5 pay a cat, so they are ringed whether or not they are reached.
  pipPrize:    { boxShadow: '0 0 0 3px rgba(224,167,44,0.25), 0 0 12px rgba(224,167,44,0.5)' },
  pipPrizeOff: { border: '2px solid #7a5c18', color: '#7a5c18' },

  page: {
    // No background of its own: PageChecker (or a fight's zone) is behind it.
    minHeight: '100dvh', color: '#f0f0f5',
    // 760 on a desktop (it was 520, a phone's column). JP's friend, 2026-10-05: "why not use up that available width on desktop? The cats look awesome; they would look better if it were bigger" — JP: "make it bigger for desktop". A phone is narrower than any of these, so phones do not change.
    padding: '22px 18px 40px', maxWidth: 760, margin: '0 auto',
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  header: { textAlign: 'center', paddingBottom: 4 },
  title:  { fontSize: 30, letterSpacing: 1, margin: 0, lineHeight: 1.1 },
  sub:    { color: '#7a7a95', fontSize: 13, margin: '4px 0 0' },

  label:  { fontSize: 22, letterSpacing: 2, color: '#000080', margin: '0 0 12px' },
  quiet:  { color: '#1a1a1a', fontSize: 21, margin: 0, textAlign: 'center' },
  fine:   { color: '#1a1a1a', fontSize: 20, margin: '8px 0 0', textAlign: 'center' },
  fine0:  { color: '#1a1a1a', fontSize: 20, margin: 0 },

  // Windows 98, light (JP, 2026-10-06): the grey window body; the frame and title bar are .win98 in globals.css.
  block:  { background: '#c0c0c0', color: '#000000', border: '1px solid #c0c0c0', borderRadius: 0, padding: 16 },

  grid:   { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  // An adopt card in a 98 window: white, a grey hairline, dark text big enough to read (JP: "fix the text size").
  cardWrap: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  card:   { padding: 0, background: '#ffffff', border: '1px solid #808080', borderRadius: 0, overflow: 'hidden', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit', width: '100%' },
  cardLabel: { fontSize: 17, padding: '6px 6px 0', color: '#000000', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardRec: { fontSize: 16, padding: '2px 6px 6px', color: '#000080' },
  osLink: { fontSize: 16, color: '#000080', textAlign: 'center', textDecoration: 'underline' },
  placeholder: { width: '100%', aspectRatio: '1', display: 'grid', placeItems: 'center', fontSize: 22, background: '#0b0b13' },

  // The phone's scrolling log (see `narrow`), as it was before the battle screen.
  log: {
    background: PAPER, color: INK, borderRadius: 14, padding: '18px 18px 14px',
    height: 320, overflowY: 'auto',
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
  },
  caret: { color: '#8a8a7a', fontSize: 14 },

  // After a fight: the results card beside the streak and the buttons, at WIDE.
  after:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16, alignItems: 'start', alignSelf: 'center' },
  afterSide: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 },

  // The countdown, over the battle screen (components/FightStage) in its game pixels.
  countWrap: {
    position: 'absolute', inset: 0, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    background: 'rgba(11,11,19,0.72)', pointerEvents: 'none',
  },

  // The results card: the same paper as the log, because in the game it is.
  // NOT `card` — that name already belongs to the cat grid tile above.
  resultCard: {
    position: 'relative', overflow: 'hidden',
    // A light Windows 98 window like every panel (.win98): grey body, the frame and title bar from CSS.
    background: '#c0c0c0', color: INK, borderRadius: 0, padding: 16,
  },
  scoreRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, padding: '3px 0',
  },
  totalRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, marginTop: 12, paddingTop: 12, borderTop: '2px solid rgba(0,0,0,0.15)',
  },

  rankRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #1a1a26' },
  rankPic: { width: 34, height: 34, borderRadius: 6, objectFit: 'cover', imageRendering: 'pixelated', background: '#0b0b13', flexShrink: 0 },
  tiny: { background: 'transparent', border: 0, color: '#63637d', fontSize: 16, cursor: 'pointer', fontFamily: 'inherit' },

  input: { flex: 1, minWidth: 0, background: '#0b0b13', border: '1px solid #21212f', borderRadius: 10, color: '#f0f0f5', padding: '10px 12px', fontSize: 20, fontFamily: 'inherit' },

  // Hover fills from the Windows 98 palette (JP: "make the colors work better"): navy, maroon, green.
  primary: { width: '100%', background: '#000080', color: '#fff', border: 0, borderRadius: 10, padding: '11px 16px', fontSize: 14, letterSpacing: 1, cursor: 'pointer', fontFamily: 'inherit' },
  ghost:   { width: '100%', background: '#c0c0c0', color: '#000000', border: 0, borderRadius: 10, padding: '9px 16px', fontSize: 12, letterSpacing: 1, cursor: 'pointer', fontFamily: 'inherit', marginTop: 10 },

  /*
   * THE MODE LIST. Each button carries one line under it saying what the mode
   * costs and what it counts for, because the difference between the three is
   * entirely in what happens afterwards and none of it is visible in the name.
   */
  modes:    { marginTop: 16, borderTop: '1px solid #21212f', paddingTop: 16 },
  modeFine: { color: '#1a1a1a', fontSize: 20, margin: '6px 0 20px', textAlign: 'center', lineHeight: 1.3, textWrap: 'balance' },
  /* The gauntlet is the one with something at stake, so it is the one that is gold. */
  gauntlet: { width: '100%', background: '#800000', color: '#e0a72c', border: 0, borderRadius: 10, padding: '10px 16px', fontSize: 13, letterSpacing: 1, cursor: 'pointer', fontFamily: 'inherit', marginTop: 10 },
  // The yard's green, the colour this page already uses for good news. A link, drawn as a button.
  yardBtn:  { display: 'block', boxSizing: 'border-box', width: '100%', background: '#004d00', color: '#7ee081', border: 0, borderRadius: 10, padding: '10px 16px', fontSize: 13, letterSpacing: 1, textAlign: 'center', textDecoration: 'none', fontFamily: 'inherit', marginTop: 10 },

  /* The menu beside your fighter: options LEFT and compact, the cat gets the room. */
  // Centred, so the cat sits level with the middle option, GAUNTLET (JP, 2026-09-29).
  // Top-aligned: with the links under the portrait the right column is the taller one.
  fighterRow:  { display: 'flex', gap: 16, alignItems: 'flex-start' },
  fighterOpts: { flex: '1 1 0', minWidth: 0 },
  fighter:     { flex: '0 0 44%', maxWidth: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 0 },
  fighterName: { margin: 0, fontSize: 24, letterSpacing: 1, color: '#000000', textAlign: 'center', overflowWrap: 'anywhere' },
  // 4px dark edge inside a 2px paper ring — the ring is a shadow, so it needs the 2px margin to show.
  fighterPic:  { width: 'calc(100% - 4px)', margin: 2, aspectRatio: '1', objectFit: 'cover', objectPosition: 'top', display: 'block', boxSizing: 'border-box', border: '4px solid #1a1a1a', boxShadow: '0 0 0 2px #fdfdf8', background: '#e6e0d2' },
  /* A picked card keeps the same box so the grid does not move when you choose. */
  /* `border`, not `borderColor` — card sets the shorthand. 2px keeps the box. */
  cardPicked: { border: '2px solid #8b5cf6', boxShadow: '0 0 0 2px rgba(139,92,246,0.35)' },

  /*
   * THE TOWER — the five, drawn the way the rankings draw a cat.
   *
   * The same row as RankRow on purpose: a cat in this app looks like a picture,
   * a name and a line underneath, and the gauntlet should not invent a second
   * way of showing one. All five stay on screen the whole run, because knowing
   * how many are still above you is most of the tension.
   */
  tower:      { display: 'flex', flexDirection: 'column', gap: 6 },
  towerRow:   { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 10, border: '1px solid #21212f', background: '#0b0b13' },
  /* Only the next cat is lit. Everything else is context. */
  towerNext:  { border: '1px solid #7a5c18', background: 'rgba(224,167,44,0.08)' },
  towerNum:   { width: 14, textAlign: 'center', fontSize: 11, color: '#4a4a5e' },
  ladderLine: { color: '#63637d', fontSize: 11, margin: '10px 0 0', textAlign: 'center' },

  /*
   * THE VICTOR ON THE RESULTS CARD — portrait centred, the word beneath.
   *
   * Sized to sit inside the card without pushing the score off a phone: 128 is
   * about half the card's width and still leaves the five award rows and the
   * total on screen together, which is the whole point of the card.
   */
  victor:    { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, margin: '2px 0 12px' },
  victorPic: { width: 128, height: 128, borderRadius: 8, objectFit: 'cover', display: 'block', imageRendering: 'pixelated', border: '2px solid #1a1a1a', background: '#e6e0d2' },

  /*
   * THE CHAMPION'S CARD. `position: relative` and `overflow: hidden` are load
   * bearing — the confetti is absolutely positioned to its parent and would
   * otherwise fall down the whole page.
   */
  champCard: {
    position: 'relative', overflow: 'hidden',
    borderRadius: 14, border: '1px solid #7a5c18',
    background: 'linear-gradient(180deg, rgba(224,167,44,0.10), rgba(224,167,44,0.02))',
    padding: '18px 16px 16px', marginBottom: 10,
  },
  // `border`, not `borderColor`: champCard sets the shorthand.
  champCardMine: { border: '1px solid #e0a72c', boxShadow: '0 0 0 2px rgba(224,167,44,0.25)' },

  /*
   * THE HIT COUNTER. Black box, green digits, sunk border — the odometer look
   * these had, which is the whole reason to have one.
   */
  /*
   * THE HIT COUNTER. Black box, amber digits, sunk border — the odometer look
   * these had, in the same amber the gauntlet and the champion already use.
   */
  hitsBox: {
    display: 'inline-flex', alignItems: 'center',
    padding: '4px 7px', background: '#05050a', borderRadius: 4,
    border: '1px solid #3a2c10', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)',
    // The second auto margin: speedGroup pushes left, this splits what is left.
    marginRight: 'auto',
  },

  /* The season board. Your own cats are lit, so you can find yourself in it. */
  boardRow:     { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 10, border: '1px solid #21212f', background: '#0b0b13', marginBottom: 6 },
  // `border`, not `borderColor`: boardRow sets the shorthand.
  boardRowMine: { border: '1px solid #7a5c18', background: 'rgba(224,167,44,0.08)' },
  boardRank:    { width: 22, textAlign: 'center', fontSize: 12, color: '#63637d' },
  boardPts:     { fontSize: 13, color: '#e0a72c', fontVariantNumeric: 'tabular-nums' },
  link:    { color: '#000080', fontSize: 14 },
  soundRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    justifyContent: 'flex-end', marginTop: -8,
    // Wraps rather than pushing the slider off the edge of a narrow phone.
    flexWrap: 'wrap', rowGap: 8,
  },
  // Tight against each other so the three read as one control, not three buttons.
  speedGroup: { display: 'flex', gap: 4, marginRight: 'auto' },
  // The full `border` shorthand, not `borderColor`: soundBtn sets the shorthand,
  // and React warns that mixing the two on one element can style unpredictably.
  speedOn: { border: '1px solid #8b5cf6', color: '#8b5cf6' },
  // Dimmed, but still clearly a button — it has something to say when tapped.
  speedLocked: { opacity: 0.45, fontSize: 11, padding: '4px 7px' },
  soundBtn: {
    background: 'transparent', border: '1px solid #21212f', borderRadius: 999,
    padding: '4px 9px', fontSize: 13, cursor: 'pointer', lineHeight: 1,
    color: 'inherit', fontFamily: 'inherit',
  },
  slider: { width: 110, accentColor: '#8b5cf6', cursor: 'pointer' },

  nav: {
    marginTop: 'auto', display: 'flex', justifyContent: 'center', gap: 8,
    flexWrap: 'wrap', paddingTop: 8,
  },
  // A 98 button (globals.css .btn98): grey bevel at rest, navy on hover.
  navLink: { display: 'inline-flex', textDecoration: 'none', padding: '6px 14px' },
  // The links in their own window after a fight: two equal buttons, as tall as the menu's.
  navLinkBig: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: '14px 16px' },
  navWin:  { display: 'flex', gap: 10 },
  // Under the portrait (CatLinks): navy on hover, like QUICK FIGHT.
  catLink: { flex: 1, display: 'flex', justifyContent: 'center', whiteSpace: 'nowrap', textDecoration: 'none', background: '#000080', padding: '5px 8px' },
  footer:  { marginTop: 12, textAlign: 'center', color: '#3f3f55', fontSize: 10, letterSpacing: 1 },
}

/**
 * The cat's energy under the GAUNTLET button: three pips, or how long it rests.
 * Null on the server, where there is no stamina to read.
 */
function EnergyLine({ st }: { st: Stamina | null }) {
  if (!st) return null
  if (st.resting && st.until) {
    return (
      <p style={{ margin: '-14px 0 20px', fontSize: 20, color: '#000080', textAlign: 'center', textWrap: 'balance' }}>
        resting · back in {restLeft(st.until)} ·{' '}
        <a href="/yard" style={{ color: '#1e6b24' }}>time in the yard cuts it</a>
      </p>
    )
  }
  return (
    <p style={{ margin: '-14px 0 20px', fontSize: 20, color: '#1a1a1a', textAlign: 'center' }} aria-label={`energy ${st.energy} of ${MAX_ENERGY}`}>
      energy{' '}
      <span style={{ letterSpacing: 2, color: '#b07a10' }}>{'●'.repeat(st.energy)}</span>
      <span style={{ letterSpacing: 2, color: '#8a8a8a' }}>{'●'.repeat(MAX_ENERGY - st.energy)}</span>
      {' '}· a lost run costs one
    </p>
  )
}

/**
 * YOUR CATS and MINT under the portrait on the menu — JP, 2026-10-06: "add these
 * buttons underneath the cat pfp". 98 buttons like the rest of the window: grey
 * at rest, their colour on hover (.win98 .fx-host). MINT is left out of the app
 * build exactly as in the nav (NO_CHAIN): cats are won there, not bought.
 */
function CatLinks() {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12, width: '100%' }}>
      <a href="/cats" className="fx-host" style={s.catLink}><FxLabel text="YOUR CATS" tone="light" /></a>
      {!NO_CHAIN && <a href="/mint" className="fx-host" style={s.catLink}><FxLabel text="MINT" tone="light" /></a>}
    </div>
  )
}

/**
 * Where a token's own page is. OpenSea for V1 (Base) and V3 (Robinhood Chain).
 * NOT for V2: OpenSea has DELISTED that collection — JP, 2026-10-06, its notice:
 * "delisted from OpenSea for a suspected violation of our Terms of Service. It
 * will not be visible or accessible to anyone browsing the site." A link there
 * is a dead end, so a V2 token goes to its Basescan page, which always works.
 */
function tokenLink(collection: string | undefined, id: string): { href: string; label: string } {
  const col = getCollection(collection)
  if (col.key === 'v2') return { href: `https://basescan.org/nft/${col.address}/${id}`, label: 'Basescan' }
  const chain = col.key === 'v3' ? 'robinhood' : 'base'
  return { href: `https://opensea.io/assets/${chain}/${col.address}/${id}`, label: 'OpenSea' }
}
