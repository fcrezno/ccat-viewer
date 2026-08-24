'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useConnect } from 'wagmi'
import sdk from '@farcaster/miniapp-sdk'
import { COLLECTIONS, getCollection, parseUid, type Cat } from '@/lib/collection'
import type { FightResult, LogLine } from '@/lib/arena'
import { GameBar } from '@/components/GameBar'
import { useSound } from '@/lib/useSound'
import { trackForRound } from '@/lib/music'
import { BitmapText } from '@/components/BitmapText'
import {
  addFriend, friends as loadFriends, ladder, noteFight, ratio,
  recordFor, recordLine, removeFriend, setRetired, nameFor, setName, NAME_LIMIT,
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
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ccat-viewer.vercel.app'

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

/*
 * LOW HEALTH, the way render.mjs does it. Below a fifth a cat gets a blinking
 * CAUTION!, and on its last point that becomes PERIL!. The BAR does not pulse —
 * a pulsing fill fought with the damage trail for the same pixels, so the game
 * states the case in a word instead.
 */
const LOW = 0.2
const PERIL = 1
const CAUTION_INK = '#e02020'
const warnFor = (hp: number, max: number) =>
  hp <= 0 ? null : hp === PERIL ? 'PERIL!' : hp / max <= LOW ? 'CAUTION!' : null

const PAPER = '#f2eee3'
const INK = '#1a1a1a'

const KIND_INK: Record<LogLine['kind'], string> = {
  info: '#6b6b60', move: INK, miss: '#6b6b60', crit: '#c2410c',
  weak: '#3f6ea8', perk: '#2f7a44', ko: '#a01b1b', win: '#a06a10',
}

function Fighter({ cat, hp, ghost, side, swinging, beat, speed }: {
  cat: FightResult['you']; hp: number; ghost: number
  side: 'left' | 'right'; swinging: boolean; beat: number; speed: number
}) {
  // Alternate the animation NAME to replay it. Remounting would restart the
  // element and kill the health bar's clip-path transition with it.
  const alt = beat % 2 === 1 ? '-b' : ''
  const warn = warnFor(hp, cat.maxHp)
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: side === 'right' ? 'right' : 'left' }}>
      <img
        src={cat.art}
        alt=""
        style={{
          width: '100%', aspectRatio: '250 / 199', objectFit: 'cover',
          display: 'block', marginBottom: 8, borderRadius: 8,
          imageRendering: 'pixelated',
          border: cat.mine ? '2px solid #ffd166' : '2px solid #21212f',
          background: '#0b0b13',
          opacity: hp > 0 ? 1 : 0.35,
          filter: hp > 0 ? 'none' : 'grayscale(1)',
          transition: 'opacity 0.3s ease',
          animation: swinging && hp > 0
            // LINEAR: Beat.Lunge is already baked into the keyframe stops, so an
            // easing function here would ease an eased curve.
            // Scaled with the reveal: a 0.35s lunge inside a 212ms line at x4
            // would be cut off part-way, which is what made the old countdown
            // stumble.
            ? `cradle-lunge-${side}${alt} ${0.35 / speed}s linear, cradle-swing${alt} ${0.35 / speed}s ease-out`
            : undefined,
        }}
      />
      <div style={{
        fontSize: 13, marginBottom: 3, whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis',
        color: cat.mine ? '#ffd166' : '#f0f0f5',
      }}>{cat.label}</div>
      <div style={{
        fontSize: 9, letterSpacing: 1.5, marginBottom: 6,
        display: 'flex', gap: 6, justifyContent: side === 'right' ? 'flex-end' : 'flex-start',
      }}>
        <span style={{ color: '#7a7a95' }}>{cat.type}</span>
        {warn && (
          <span style={{ color: CAUTION_INK, animation: 'cradle-blink 0.37s steps(1, end) infinite' }}>
            {warn}
          </span>
        )}
      </div>
      <GameBar hp={hp} ghost={ghost} max={cat.maxHp} side={side} speed={speed} />
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

  useEffect(() => {
    let live = true
    fetch('/api/ticker')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('ticker'))))
      .then(d => { if (live) { setRows(d.board ?? []); setSeason(d.season ?? null) } })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [])

  return (
    <section style={s.block}>
      <p style={s.label}>{season ? `SEASON ${season}` : 'SEASON'}</p>

      {failed
        ? <p style={s.quiet}>could not reach the season board just now.</p>
        : !rows
          ? <p style={s.quiet}>reading the season board…</p>
          : rows.length === 0
            ? (
              <>
                <p style={s.quiet}>nobody has taken all five yet.</p>
                <p style={s.fine}>
                  Take the gauntlet, cast the run, and this is where it goes.
                </p>
              </>
            )
            : rows.slice(0, 20).map(r => (
              <div
                key={r.uid}
                style={mine.has(r.uid) ? { ...s.boardRow, ...s.boardRowMine } : s.boardRow}
              >
                <span style={s.boardRank}>{r.rank}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* The names log wins here too, when this device has one. */}
                  <div style={{ fontSize: 12, color: mine.has(r.uid) ? '#ffd166' : '#f0f0f5' }}>
                    {nameFor(r.uid) ?? `#${parseUid(r.uid).id}`}
                  </div>
                  <div style={{ fontSize: 10, color: '#63637d' }}>
                    {r.uid} · {r.wins}W {r.losses}L
                    {r.runs > 1 ? ` · ${r.runs} runs` : ''}
                  </div>
                </div>
                <span style={s.boardPts}>{r.points}</span>
              </div>
            ))}

      {rows && rows.length > 0 && (
        <p style={s.fine}>
          Champions only — falling loses the pot. Counted from cast runs, so this
          is a floor.
        </p>
      )}
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
  champion: boolean
  over:     boolean
}

export function Cradle() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()

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
  const [nameDraft, setNameDraft] = useState('')
  const [naming, setNaming] = useState(false)
  const [rowsShown, setRowsShown] = useState(0)
  const [count, setCount] = useState<number | null>(null)
  const [speed, setSpeed] = useState(BASE_SPEED)
  const sound = useSound()
  const logRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLElement>(null)
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
    if (count !== null) return
    if (!result || shown >= result.log.length) return
    const t = setTimeout(() => setShown(n => n + 1), LINE_MS / speed)
    return () => clearTimeout(t)
  }, [result, shown, count, speed])

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

    const cue =
      l.kind === 'ko' ? 'ko'
      : l.kind === 'crit' ? 'crit'
      : l.kind === 'weak' ? 'weak'
      : l.kind === 'miss' ? 'miss'
      : l.kind === 'perk' ? 'perk'
      : l.kind === 'win' ? 'score'
      : l.kind === 'move' ? (carriesItsOwn ? null : 'hit')
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
  }, [shown, result, rowsShown])

  const done = !!result && shown >= result.log.length
  const at = result && shown > 0 ? result.log[shown - 1] : null
  const prev = result && shown > 1 ? result.log[shown - 2] : null
  const isDemo = result?.you.label === 'Demo Cat'

  /*
   * WRITE THE RESULT ONCE, and only when the log has finished telling it.
   *
   * Counting the moment the server answers would bank a win before the player had
   * seen a single line. The ref guards the double-count a re-render would cause,
   * keyed on the fight's own seed so the next fight is counted again.
   */
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

  async function startFight(payload: { uid?: string; demo?: boolean; exhibition?: boolean }) {
    sound.prime()
    sound.startMusic()
    setBusy(true); setError(null); setNote(null); setConfirmRetire(false)
    setResult(null); setShown(0); setRowsShown(0); setCount(null); setView('fight')
    // A single fight is never part of a run, so anything left over goes.
    setRun(null); setRecorded(true); setTag(null)
    try {
      const res = await fetch('/api/fight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: address,
          ...payload,
          // Whatever the holder called this cat, so the log uses their name.
          name: payload.uid ? nameFor(payload.uid) ?? undefined : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'that did not work'); return }
      setResult(data)
      setRecorded(data.recorded !== false)
      setTag(data.tag ?? null)
      // The fight opens on 3, 2, 1, FIGHT! — the log waits for it.
      setCount(3)
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
    sound.prime()
    sound.startMusic(trackForRound(1))
    setBusy(true); setError(null); setNote(null); setConfirmRetire(false)
    setResult(null); setShown(0); setRowsShown(0); setCount(null); setView('fight')
    setRun(null)

    try {
      const res = await fetch('/api/gauntlet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(demo || !picked
          ? { demo: true }
          : { wallet: address, uid: picked.uid, name: nameFor(picked.uid) ?? undefined }),
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
  async function choose(choice: 'double' | 'heal') {
    if (!run?.ticket || choosing) return
    sound.prime()
    // Each cat on the tower gets its own bed. With one track in the list this
    // is the same track and nothing restarts; see lib/music.ts.
    sound.startMusic(trackForRound(run.roundNo + 1))
    setChoosing(true); setError(null)
    setResult(null); setShown(0); setRowsShown(0); setCount(null)

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
    round: { round: number; won: boolean; fight: FightResult }
  }) {
    setRecorded(data.recorded)
    setTag(data.tag ?? null)
    setRun({
      recorded: data.recorded,
      foes:     data.foes,
      roundNo:  data.round.round,
      won:      data.round.won,
      pot:      data.pot,
      ticket:   data.ticket,
      champion: data.champion,
      over:     data.over,
    })
    setResult(data.round.fight)
    // Every round opens on 3, 2, 1, FIGHT! — the log waits for it.
    setCount(3)
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

    try {
      await sdk.actions.composeCast({
        text: `${line}${tail}\n\nCat's Cradle — a preview of Clanker Cats. ${SEASON_TAG}`,
        embeds: [tag ? `${APP_URL}/cradle?r=${encodeURIComponent(tag)}` : `${APP_URL}/cradle`],
      })
    } catch {
      setError('could not open the composer — are you in a Farcaster client?')
    }
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
    const m = raw.match(/^(?:(v1|v2):)?(\d+)$/i)
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
          const meta = await res.json()
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
  const holdsCat = isConnected && (cats?.length ?? 0) > 0

  const pickable = (cats ?? []).filter(c => !recordFor(c.uid).retired)
  const retiredCount = (cats ?? []).length - pickable.length

  return (
    <main style={s.page}>
      <header style={s.header}>
        <h1 style={s.title}>CAT&apos;S CRADLE</h1>
        <p style={s.sub}>a preview of Clanker Cats</p>
      </header>

      {/*
        Sound sits at the top and is always reachable. A game that starts making
        noise with no visible way to stop it gets closed, not muted — and both
        settings are remembered, so it does not come back loud next time.
      */}
      <div style={s.soundRow}>
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
            <section style={s.block}>
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
                <div style={s.modes}>
                  <button style={s.primary} disabled={busy}
                    onClick={() => startFight({ uid: picked.uid })}>
                    QUICK FIGHT
                  </button>
                  <p style={s.modeFine}>one fight · goes on your record</p>

                  <button style={s.gauntlet} disabled={busy}
                    onClick={() => startGauntlet(false)}>
                    GAUNTLET
                  </button>
                  <p style={s.modeFine}>five cats people own · survive it to be champion</p>
                </div>
              ) : (
                <p style={s.fine}>pick a cat to choose a mode</p>
              )}
            </section>
          )}

          {isConnected && cats?.length === 0 && (
            <section style={s.block}>
              <p style={{ margin: '0 0 10px' }}>No Clanker Cat in this wallet.</p>
              <a href="https://opensea.io/collection/clanker-cats" style={s.link}>find one →</a>
            </section>
          )}

          {/* The demo is for people without a cat. A holder never sees it. */}
          {!holdsCat && (
            <section style={s.block}>
              <p style={s.label}>{isConnected ? 'NO CAT YET' : 'HAVE A LOOK FIRST'}</p>
              <button style={s.primary} onClick={() => { setPicked(null); startFight({ demo: true }) }} disabled={busy}>
                QUICK FIGHT
              </button>
              <p style={s.modeFine}>a real fight, with a cat that is not yours — no wallet needed</p>

              {/*
                THE DEMO GETS THE GAUNTLET TOO.

                A demo that plays by different rules is not showing anybody the
                game. Nothing a demo does is recorded either way, so the only
                thing being withheld at the end is the title.
              */}
              <button style={s.gauntlet} disabled={busy}
                onClick={() => { setPicked(null); startGauntlet(true) }}>
                GAUNTLET
              </button>
              <p style={s.modeFine}>five cats people own · a demo run is never recorded</p>
              {!isConnected && (
                <>
                  <p style={{ ...s.fine, marginTop: 14 }}>
                    Open in Farcaster to connect on its own, or pick a wallet:
                  </p>
                  {connectors
                    .filter(c => c.id !== 'farcaster-frame')
                    .map(c => (
                      <button key={c.id} style={s.ghost} onClick={() => connect({ connector: c })}>
                        {c.name.toUpperCase()}
                      </button>
                    ))}
                </>
              )}
            </section>
          )}

          <section style={s.block}>
            <p style={s.label}>FRIENDS</p>
            <p style={s.fine0}>Adopt a cat by its number, or shuffle through the collection.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input
                value={friendId}
                onChange={e => setFriendId(e.target.value)}
                placeholder="token id, e.g. 412 or v1:46"
                style={s.input}
              />
              <button style={{ ...s.primary, width: 'auto', padding: '10px 14px' }} onClick={lookUpFriend}>
                ADOPT
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
            <button
              style={s.ghost}
              onClick={() => { setView('adopt'); if (!found) shuffle() }}
            >
              ADOPT A CAT
            </button>
            <button style={s.ghost} onClick={() => setView('ranks')}>RANKINGS</button>
          </section>
        </>
      )}

      {/* ── ADOPT ────────────────────────────────────────────────────────── */}
      {view === 'adopt' && (
        <section style={s.block}>
          <p style={s.label}>ADOPT</p>
          <p style={s.fine0}>
            Any cat from either drop. Adopt one and it stands beside yours in the rankings.
          </p>

          {finding && <p style={s.quiet}>looking for a cat to adopt…</p>}

          {found && found.length > 0 && (
            <div style={{ ...s.grid, marginTop: 12 }}>
              {found.map(c => {
                const already = friends.some(f => f.uid === c.uid)
                return (
                  <button
                    key={c.uid}
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
                )
              })}
            </div>
          )}

          {found && found.length === 0 && !finding && (
            <p style={s.quiet}>nothing came back — try again.</p>
          )}

          <button style={s.primary} onClick={shuffle} disabled={finding}>
            SHUFFLE
          </button>
          <button style={s.ghost} onClick={() => setView('home')}>BACK</button>
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

          <section style={s.block}>
            <p style={s.label}>ON THIS DEVICE</p>
            {ranked.length === 0
              ? <p style={s.quiet}>no cats yet — connect a wallet or add a friend.</p>
              : ranked.map((r, i) => <RankRow key={r.uid} r={r} place={i + 1} />)}
            <p style={s.fine}>Records are kept on this device. The public version of a result is a cast.</p>
            <button style={s.ghost} onClick={() => setView('home')}>BACK</button>
          </section>
        </>
      )}

      {view === 'fight' && (
        <>
          {busy && <p style={s.quiet}>the cats are sizing each other up…</p>}

          {result && (
            <>
              <section
                style={{
                  ...s.stage,
                  animation: at?.kind === 'crit' || at?.kind === 'ko'
                    ? `cradle-shake${shown % 2 === 1 ? '-b' : ''} ${0.3 / speed}s ease-out`
                    : undefined,
                }}
              >
                <div style={s.versus}>
                  <Fighter
                    cat={result.you}
                    hp={at ? at.hpYou : result.you.maxHp}
                    ghost={prev ? prev.hpYou : result.you.maxHp}
                    side="left"
                    swinging={at?.actor === 'you'}
                    beat={shown}
                    speed={speed}
                  />
                  <span style={s.vs}>VS</span>
                  <Fighter
                    cat={result.foe}
                    hp={at ? at.hpFoe : result.foe.maxHp}
                    ghost={prev ? prev.hpFoe : result.foe.maxHp}
                    side="right"
                    swinging={at?.actor === 'foe'}
                    beat={shown}
                    speed={speed}
                  />
                </div>
                <p style={s.turf}>{result.turf}</p>

                {/*
                  3, 2, 1, FIGHT! over the stage, in the game's font because
                  MyFont has no digits — a countdown is nothing but digits.
                  Keyed on the beat so each one replays the drop.
                */}
                {count !== null && (
                  <div style={s.countWrap}>
                    <div key={count} style={{ animation: `cradle-count ${0.45 / speed}s ease-out` }}>
                      <BitmapText
                        text={count === 0 ? 'FIGHT!' : String(count)}
                        scale={count === 0 ? 4 : 6}
                        color={count === 0 ? '#ffd166' : '#f0f0f5'}
                      />
                    </div>
                  </div>
                )}
              </section>

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

              {/*
                THE RESULTS CARD.

                On paper like the log, because it is the same surface in the game
                — and drawn in the game's BITMAP font, which matters for more than
                looks: MyFont has no digits at all, so every number in it would
                fall back to another face. The bitmap sheet carries the full set.
              */}
              {done && result.rows.length > 0 && (
                <section ref={cardRef} style={s.resultCard}>
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
                  <div style={{ marginBottom: 12 }}>
                    <BitmapText
                      text={(result.youWon ? result.you.label : result.foe.label) + ' TAKES IT'}
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

              {/*
                THE RUN'S OWN ENDING.

                Three states share this block and they are mutually exclusive:
                the run goes on and a choice is owed, the cat fell, or the cat
                went the distance.
              */}
              {done && run && (
                <section style={s.block}>
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

                      <button style={{ ...s.gauntlet, marginTop: 14 }} disabled={choosing}
                        onClick={() => choose('double')}>
                        DOUBLE THE POT → {run.pot * 2}
                      </button>
                      <p style={s.modeFine}>
                        keep the damage you are carrying
                      </p>

                      <button style={s.primary} disabled={choosing}
                        onClick={() => choose('heal')}>
                        HEAL TO FULL
                      </button>
                      <p style={s.modeFine}>the pot stays at {run.pot}</p>

                      {choosing && <p style={s.quiet}>the next cat is walking on…</p>}
                    </>
                  )}

                  {/* FELL. The pot goes with them — that is the other half of doubling. */}
                  {!run.won && (
                    <>
                      <p style={{ margin: '14px 0 2px', fontSize: 16, color: '#d1495b' }}>
                        Down on round {run.roundNo}.
                      </p>
                      <p style={s.fine0}>
                        {run.roundNo - 1} of {run.foes.length} beaten. The pot is gone.
                      </p>
                      <button style={{ ...s.gauntlet, marginTop: 14 }} disabled={busy}
                        onClick={() => startGauntlet(!run.recorded)}>
                        RUN IT AGAIN
                      </button>
                      <button style={s.ghost} onClick={() => { clearRun(); setView('home') }}>
                        BACK
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

                      <button style={{ ...s.primary, marginTop: 14 }} onClick={share}>
                        SHARE ON FARCASTER
                      </button>
                      <button style={s.ghost} disabled={busy}
                        onClick={() => startGauntlet(!run.recorded)}>
                        RUN IT AGAIN
                      </button>
                      <button style={s.ghost} onClick={() => { clearRun(); setView('home') }}>
                        BACK
                      </button>
                    </>
                  )}
                </section>
              )}

              {/* A run has its own ending, and its own buttons, above. */}
              {done && !run && (
                <section style={s.block}>
                  <p style={{ margin: '0 0 4px', fontSize: 16, color: result.youWon ? '#5fc27e' : '#d1495b' }}>
                    {result.youWon ? 'Your cat took it.' : 'Your cat went down.'}
                  </p>
                  {picked && !isDemo && (
                    <p style={s.fine0}>
                      {picked.meta?.name ?? picked.uid} · {recordLine(recordFor(picked.uid))}
                    </p>
                  )}

                  <button style={{ ...s.primary, marginTop: 12 }} onClick={share}>
                    SHARE ON FARCASTER
                  </button>

                  <button
                    style={s.ghost}
                    onClick={() => (isDemo || !picked
                      ? startFight({ demo: true })
                      : startFight({ uid: picked.uid }))}
                  >
                    FIGHT AGAIN
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
                          <button
                            style={{ ...s.primary, width: 'auto', padding: '10px 14px' }}
                            onClick={() => {
                              const saved = setName(picked.uid, nameDraft)
                              setNaming(false)
                              setNote(saved ? `Now called ${saved}.` : 'Name cleared.')
                              bump(n => n + 1)
                            }}
                          >
                            SAVE
                          </button>
                        </div>
                        <p style={s.fine}>Leave it empty to go back to the collection name.</p>
                      </div>
                    ) : (
                      <button
                        style={s.ghost}
                        onClick={() => {
                          setNameDraft(nameFor(picked.uid) ?? '')
                          setNaming(true)
                        }}
                      >
                        {nameFor(picked.uid) ? 'RENAME THIS CAT' : 'NAME THIS CAT'}
                      </button>
                    )
                  )}

                  {picked && !isDemo && !recordFor(picked.uid).retired && (
                    confirmRetire ? (
                      <div style={{ marginTop: 10 }}>
                        <p style={s.fine0}>Retiring keeps the record and stops the fighting. Sure?</p>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button
                            // `border`, not `borderColor`: s.ghost sets the
                            // shorthand, so the longhand was being dropped and
                            // this destructive button kept the plain grey edge.
                            style={{ ...s.ghost, marginTop: 0, border: '1px solid #d1495b', color: '#d1495b' }}
                            onClick={retire}
                          >
                            YES, RETIRE
                          </button>
                          <button style={{ ...s.ghost, marginTop: 0 }} onClick={() => setConfirmRetire(false)}>
                            KEEP FIGHTING
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button style={s.ghost} onClick={() => setConfirmRetire(true)}>RETIRE THIS CAT</button>
                    )
                  )}

                  <button style={s.ghost} onClick={() => setView('ranks')}>RANKINGS</button>
                  <button style={s.ghost} onClick={() => { setResult(null); setShown(0); setView('home') }}>
                    BACK
                  </button>
                </section>
              )}
            </>
          )}

          {!result && !busy && <button style={s.ghost} onClick={() => setView('home')}>BACK</button>}
        </>
      )}

      {/*
        THE OLDER APPS.

        The Cradle took the front door — `/` used to redirect straight to the idle
        game — so the things that used to be there need a way back. On every view
        rather than behind a menu: this is a mini app on a phone, and a menu to
        reach three links is a menu too many.
      */}
      <nav style={s.nav}>
        <a href="/game" style={s.navLink}>IDLE GAME</a>
        <a href="/cats" style={s.navLink}>YOUR CATS</a>
        <a href="/mint" style={s.navLink}>MINT</a>
      </nav>

      <footer style={s.footer}>Clanker Cats — the full game is being built in s&amp;box</footer>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh', background: '#0b0b13', color: '#f0f0f5',
    padding: '22px 18px 40px', maxWidth: 520, margin: '0 auto',
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  header: { textAlign: 'center', paddingBottom: 4 },
  title:  { fontSize: 30, letterSpacing: 1, margin: 0, lineHeight: 1.1 },
  sub:    { color: '#7a7a95', fontSize: 13, margin: '4px 0 0' },

  label:  { fontSize: 10, letterSpacing: 2, color: '#7a7a95', margin: '0 0 10px' },
  quiet:  { color: '#7a7a95', fontSize: 13, margin: 0, textAlign: 'center' },
  fine:   { color: '#63637d', fontSize: 11, margin: '8px 0 0', textAlign: 'center' },
  fine0:  { color: '#63637d', fontSize: 11, margin: 0 },

  block:  { background: '#12121c', border: '1px solid #21212f', borderRadius: 14, padding: 16 },

  grid:   { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  card:   { padding: 0, background: '#0b0b13', border: '2px solid #21212f', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' },
  cardLabel: { fontSize: 9, padding: '5px 4px 0', color: '#f0f0f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardRec: { fontSize: 9, padding: '0 4px 5px', color: '#7a7a95' },
  placeholder: { width: '100%', aspectRatio: '1', display: 'grid', placeItems: 'center', fontSize: 22, background: '#0b0b13' },

  // `position: relative` so the countdown can sit over it.
  stage:  { position: 'relative', background: '#12121c', border: '1px solid #21212f', borderRadius: 14, padding: '14px 16px' },
  countWrap: {
    position: 'absolute', inset: 0, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    background: 'rgba(11,11,19,0.72)', borderRadius: 14, pointerEvents: 'none',
  },
  versus: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  vs:     { color: '#4a4a63', fontSize: 11, letterSpacing: 1, paddingTop: 16 },
  turf:   { textAlign: 'center', color: '#63637d', fontSize: 11, margin: '12px 0 0' },

  log: {
    background: PAPER, color: INK, borderRadius: 14, padding: '18px 18px 14px',
    height: 320, overflowY: 'auto',
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
  },
  caret: { color: '#8a8a7a', fontSize: 14 },

  // The results card: the same paper as the log, because in the game it is.
  // NOT `card` — that name already belongs to the cat grid tile above.
  resultCard: {
    position: 'relative', overflow: 'hidden',
    background: PAPER, color: INK, borderRadius: 14, padding: '18px 18px 16px',
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
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

  input: { flex: 1, minWidth: 0, background: '#0b0b13', border: '1px solid #21212f', borderRadius: 10, color: '#f0f0f5', padding: '10px 12px', fontSize: 13, fontFamily: 'inherit' },

  primary: { width: '100%', background: '#8b5cf6', color: '#fff', border: 0, borderRadius: 10, padding: '14px 16px', fontSize: 14, letterSpacing: 1, cursor: 'pointer', fontFamily: 'inherit' },
  ghost:   { width: '100%', background: 'transparent', color: '#7a7a95', border: '1px solid #21212f', borderRadius: 10, padding: '12px 16px', fontSize: 12, letterSpacing: 1, cursor: 'pointer', fontFamily: 'inherit', marginTop: 10 },

  /*
   * THE MODE LIST. Each button carries one line under it saying what the mode
   * costs and what it counts for, because the difference between the three is
   * entirely in what happens afterwards and none of it is visible in the name.
   */
  modes:    { marginTop: 16, borderTop: '1px solid #21212f', paddingTop: 16 },
  modeFine: { color: '#63637d', fontSize: 11, margin: '6px 0 14px', textAlign: 'center', lineHeight: 1.5 },
  /* The gauntlet is the one with something at stake, so it is the one that is gold. */
  gauntlet: { width: '100%', background: 'transparent', color: '#e0a72c', border: '1px solid #7a5c18', borderRadius: 10, padding: '13px 16px', fontSize: 13, letterSpacing: 1, cursor: 'pointer', fontFamily: 'inherit', marginTop: 10 },
  /* A picked card keeps the same box so the grid does not move when you choose. */
  cardPicked: { borderColor: '#8b5cf6', boxShadow: '0 0 0 2px rgba(139,92,246,0.35)' },

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
  towerNext:  { borderColor: '#7a5c18', background: 'rgba(224,167,44,0.08)' },
  towerNum:   { width: 14, textAlign: 'center', fontSize: 11, color: '#4a4a5e' },
  ladderLine: { color: '#63637d', fontSize: 11, margin: '10px 0 0', textAlign: 'center' },

  /* The season board. Your own cats are lit, so you can find yourself in it. */
  boardRow:     { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 10, border: '1px solid #21212f', background: '#0b0b13', marginBottom: 6 },
  boardRowMine: { borderColor: '#7a5c18', background: 'rgba(224,167,44,0.08)' },
  boardRank:    { width: 22, textAlign: 'center', fontSize: 12, color: '#63637d' },
  boardPts:     { fontSize: 13, color: '#e0a72c', fontVariantNumeric: 'tabular-nums' },
  link:    { color: '#a78bfa', fontSize: 14 },
  soundRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    justifyContent: 'flex-end', marginTop: -8,
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
  navLink: {
    color: '#7a7a95', fontSize: 11, letterSpacing: 1, textDecoration: 'none',
    border: '1px solid #21212f', borderRadius: 999, padding: '7px 14px',
  },
  footer:  { marginTop: 12, textAlign: 'center', color: '#3f3f55', fontSize: 10, letterSpacing: 1 },
}
