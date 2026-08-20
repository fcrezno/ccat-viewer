'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useConnect } from 'wagmi'
import sdk from '@farcaster/miniapp-sdk'
import { COLLECTIONS, getCollection, type Cat } from '@/lib/collection'
import type { FightResult, LogLine } from '@/lib/arena'
import { GameBar } from '@/components/GameBar'
import { useSound } from '@/lib/useSound'
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

function Fighter({ cat, hp, ghost, side, swinging, beat }: {
  cat: FightResult['you']; hp: number; ghost: number
  side: 'left' | 'right'; swinging: boolean; beat: number
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
            ? `cradle-lunge-${side}${alt} 0.35s linear, cradle-swing${alt} 0.35s ease-out`
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
      <GameBar hp={hp} ghost={ghost} max={cat.maxHp} side={side} />
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

export function Cradle() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()

  const [view, setView] = useState<'home' | 'fight' | 'ranks' | 'adopt'>('home')
  const [found, setFound] = useState<Cat[] | null>(null)
  const [finding, setFinding] = useState(false)
  const [cats, setCats] = useState<Cat[] | null>(null)
  const [friends, setFriends] = useState<Friend[]>([])
  const [picked, setPicked] = useState<Cat | null>(null)
  const [result, setResult] = useState<FightResult | null>(null)
  const [shown, setShown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [confirmRetire, setConfirmRetire] = useState(false)
  const [friendId, setFriendId] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [naming, setNaming] = useState(false)
  const [rowsShown, setRowsShown] = useState(0)
  const sound = useSound()
  const logRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    if (!result || shown >= result.log.length) return
    const t = setTimeout(() => setShown(n => n + 1), LINE_MS)
    return () => clearTimeout(t)
  }, [result, shown])

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

  // The bed belongs to the fight, so it stops when the fight is told. Computed
  // here rather than using `done`, which is declared further down.
  useEffect(() => {
    if (result && shown >= result.log.length) sound.stopMusic()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, result])

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

    const t = setTimeout(() => {
      sound.play(rowsShown === result.rows.length ? 'score' : 'perk')
      setRowsShown(n => n + 1)
    }, rowsShown === 0 ? 500 : 420)
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
    if (!done || !result || isDemo || !picked) return
    const key = `${picked.uid}:${result.seed}`
    if (counted.current === key) return
    counted.current = key
    noteFight(picked.uid, result.youWon)
    bump(n => n + 1)
  }, [done, result, isDemo, picked])

  async function startFight(payload: { uid?: string; demo?: boolean }) {
    sound.prime()
    sound.startMusic()
    setBusy(true); setError(null); setNote(null); setConfirmRetire(false)
    setResult(null); setShown(0); setRowsShown(0); setView('fight')
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
    } catch {
      setError('could not reach the arena')
    } finally {
      setBusy(false)
    }
  }

  /** Post the result as a cast. A boast goes in the open or not at all. */
  async function share() {
    if (!result) return
    const rec = picked && !isDemo ? recordFor(picked.uid) : null
    const line = result.youWon
      ? `${result.you.label} beat ${result.foe.label} in ${result.turf}.`
      : `${result.foe.label} put ${result.you.label} down in ${result.turf}.`
    const tail = rec && rec.wins + rec.losses > 0 ? ` Now ${recordLine(rec)}.` : ''

    try {
      await sdk.actions.composeCast({
        text: `${line}${tail}\n\nCat's Cradle — a preview of Clanker Cats.`,
        embeds: [`${APP_URL}/cradle`],
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
                      onClick={() => { setPicked(c); startFight({ uid: c.uid }) }}
                      disabled={busy}
                      style={s.card}
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
                PLAY WITH THE DEMO CAT
              </button>
              <p style={s.fine}>a real fight, with a cat that is not yours — no wallet needed</p>
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
        <section style={s.block}>
          <p style={s.label}>RANKINGS</p>
          {ranked.length === 0
            ? <p style={s.quiet}>no cats yet — connect a wallet or add a friend.</p>
            : ranked.map((r, i) => <RankRow key={r.uid} r={r} place={i + 1} />)}
          <p style={s.fine}>Records are kept on this device. The public version of a result is a cast.</p>
          <button style={s.ghost} onClick={() => setView('home')}>BACK</button>
        </section>
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
                    ? `cradle-shake${shown % 2 === 1 ? '-b' : ''} 0.3s ease-out`
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
                  />
                  <span style={s.vs}>VS</span>
                  <Fighter
                    cat={result.foe}
                    hp={at ? at.hpFoe : result.foe.maxHp}
                    ghost={prev ? prev.hpFoe : result.foe.maxHp}
                    side="right"
                    swinging={at?.actor === 'foe'}
                    beat={shown}
                  />
                </div>
                <p style={s.turf}>{result.turf}</p>
              </section>

              <div ref={logRef} style={s.log}>
                {result.log.slice(0, shown).map((l, i) => (
                  <div key={i} style={{
                    margin: '0 0 6px',
                    animation: l.kind === 'crit' ? 'cradle-crit 0.45s ease-out' : undefined,
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
                <section style={s.resultCard}>
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

              {done && (
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
                            style={{ ...s.ghost, marginTop: 0, borderColor: '#d1495b', color: '#d1495b' }}
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

  stage:  { background: '#12121c', border: '1px solid #21212f', borderRadius: 14, padding: '14px 16px' },
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
  link:    { color: '#a78bfa', fontSize: 14 },
  soundRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    justifyContent: 'flex-end', marginTop: -8,
  },
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
