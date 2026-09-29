'use client'

import { useEffect, useState } from 'react'
import { useAccount, useConnect, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { isAddress } from 'viem'
import sdk from '@farcaster/miniapp-sdk'
import { loadStats, saveStats, feed, pet, play, mood, moodEmoji, catLine, type Stats } from '@/lib/tamagotchi'
import { COLLECTION_ABI, COLLECTIONS, getCollection, type Cat } from '@/lib/collection'
import { APP_URL } from '@/lib/miniapp'
import { useWebConnectors } from '@/lib/useWebConnectors'
import { BitmapText } from '@/components/BitmapText'
import { FxButton } from '@/components/FxButton'
import { PageBackdrop } from '@/components/PageBackdrop'

/**
 * YOUR CATS — made over in the game's own look.
 *
 * JP, 2026-09-29: "give the cat view a makeover using what we use this from
 * before". Everything this page did, it still does — the grid, the detail with
 * traits and the season record, the TamoCatch panel, sending a cat — drawn the
 * way the rest of the site now is: the title screen's blurred zone behind the
 * page, the front page's column and panels, cats in the game's portrait mount
 * (a 2px paper ring round a 4px ink edge, cropped from the top), and every
 * button in the game's font with the wave and the light-up.
 *
 * FARCASTER KEPT APART ("seperate the farcaster stuff"): nothing here tells a
 * web visitor to open Warpcast. Inside a Farcaster client the frame connector
 * still connects on its own, and sharing a cat is still a cast; on the web it
 * goes to X, as a fight result does.
 */

const OPENSEA = 'https://opensea.io/collection/clanker-cats'
/** Robinhood cats to stand in when there is none of yours to show: every 17th. The plain art —
 *  the title screen's copies have the frame drawn in, and Portrait adds its own. */
const POOL = Array.from({ length: 64 }, (_, i) => 1 + i * 17)

/** Open a URL: the Farcaster SDK inside a client, a new tab on the web. */
async function openOut(url: string) {
  try { await sdk.actions.openUrl(url) } catch { window.open(url, '_blank', 'noopener') }
}

/** A cat in the game's mount. */
function Portrait({ src, pixel = true, size }: { src?: string; pixel?: boolean; size?: number | string }) {
  return (
    <div style={{ ...s.mount, width: size ?? '100%' }}>
      {src
        ? <img src={src} alt="" loading="lazy" style={{ ...s.mountArt, imageRendering: pixel ? 'pixelated' : 'auto' }} />
        : <div style={{ ...s.mountArt, display: 'grid', placeItems: 'center', fontSize: 28 }}>🐱</div>}
    </div>
  )
}

function CatCard({ cat, selected, onClick }: { cat: Cat; selected: boolean; onClick: () => void }) {
  const meta = cat.meta
  const col  = getCollection(cat.collection)
  // Only worth calling out which drop a cat is from once there's more than one.
  const showBadge = COLLECTIONS.length > 1 && cat.collection === 'v1'

  return (
    <button
      type="button"
      className="fx-host"
      onClick={onClick}
      style={{ ...s.card, ...(selected ? s.cardOn : null) }}
    >
      <Portrait src={meta?.image} pixel={col.pixelArt} />
      {showBadge && <div style={s.ogBadge}>OG</div>}
      <div style={s.cardLabel}>{meta?.name ?? `#${cat.id}`}</div>
    </button>
  )
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9a9ab5' }}>
        <span style={{ textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div style={{ background: '#1a1a2e', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

function TamagotchiPanel({ catId }: { catId: string }) {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => { setStats(loadStats(catId)) }, [catId])

  function act(fn: (s: Stats) => Stats) {
    setStats(prev => {
      const next = fn(prev!)
      saveStats(catId, next)
      return next
    })
  }

  if (!stats) return null
  const m = mood(stats)
  const emoji = moodEmoji(m)

  return (
    <section style={s.block}>
      <p style={s.label}>HOW IT IS</p>
      <div style={s.tamaMessage}>{emoji} &ldquo;{catLine(stats)}&rdquo;</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        <StatBar label="Hunger"    value={stats.hunger}    color="#f59e0b" />
        <StatBar label="Happiness" value={stats.happiness} color="#7c3aed" />
        <StatBar label="Energy"    value={stats.energy}    color="#10b981" />
      </div>
      <div style={s.tamaActions}>
        <FxButton style={s.tamaBtn} tone="gold"  onClick={() => act(feed)} label="FEED" />
        <FxButton style={s.tamaBtn} tone="light" onClick={() => act(pet)}  label="PET" />
        <FxButton style={s.tamaBtn} tone="green" onClick={() => act(play)} label="PLAY" />
      </div>
    </section>
  )
}

type Resolved = { username: string; address: string; pfp: string | null; verified: boolean }

function SendPanel({ cat, onClose }: { cat: Cat; onClose: () => void }) {
  const { address } = useAccount()
  const [to, setTo]         = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [resolved, setResolved]   = useState<Resolved | null>(null)
  const [looking, setLooking]     = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const { writeContract, data: txHash, isPending, isError, error } = useWriteContract()
  const { isSuccess, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash })

  const meta      = cat.meta
  const col       = getCollection(cat.collection)
  const isRawAddr = isAddress(to)
  // Anything that isn't an address is treated as a Farcaster handle.
  const asHandle  = !isRawAddr && /^@?[a-z0-9][a-z0-9._-]{0,32}$/i.test(to.trim())
  const target    = isRawAddr ? to : resolved?.address
  const valid     = Boolean(target && isAddress(target))

  // Resolve handles as they type, debounced.
  useEffect(() => {
    setResolved(null)
    setLookupError(null)
    if (!asHandle) return

    const handle = to.trim().replace(/^@/, '')
    let cancelled = false
    setLooking(true)

    const t = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/resolve?handle=${encodeURIComponent(handle)}`)
        const data = await res.json()
        if (cancelled) return
        if (res.ok) setResolved(data)
        else setLookupError(data?.error === 'not_found' ? `No Farcaster user @${handle}` : 'Lookup failed')
      } catch {
        if (!cancelled) setLookupError('Lookup failed')
      } finally {
        if (!cancelled) setLooking(false)
      }
    }, 450)

    return () => { cancelled = true; clearTimeout(t); setLooking(false) }
  }, [to, asHandle])

  function send() {
    if (!valid || !address || !target) return
    writeContract({
      address: col.address,
      abi: COLLECTION_ABI,
      functionName: 'safeTransferFrom',
      args: [address, target as `0x${string}`, BigInt(cat.id)],
    })
  }

  if (isSuccess) {
    return (
      <section style={s.block}>
        <div style={{ fontSize: 36, textAlign: 'center' as const }}>✅</div>
        <div style={{ fontSize: 16, textAlign: 'center' as const, margin: '6px 0' }}>{meta?.name ?? `Cat #${cat.id}`} sent!</div>
        <div style={{ fontSize: 12, color: '#9a9ab5', textAlign: 'center' as const, wordBreak: 'break-all' as const, marginBottom: 12 }}>To: {resolved ? '@' + resolved.username : target}</div>
        <FxButton style={s.primary} tone="light" onClick={onClose} label="DONE" />
      </section>
    )
  }

  return (
    <section style={s.block}>
      <p style={s.label}>SEND THIS CAT</p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <Portrait src={meta?.image} pixel={col.pixelArt} size={64} />
        <div>
          <div style={{ fontSize: 16 }}>{meta?.name ?? `Cat #${cat.id}`}</div>
          <div style={{ fontSize: 12, color: '#9a9ab5' }}>{col.label} · {col.chain.name}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11, color: '#9a9ab5', textTransform: 'uppercase' as const, letterSpacing: 2 }}>Send to</label>
        <input
          value={to}
          onChange={e => setTo(e.target.value)}
          placeholder="0x... or @username"
          style={s.input}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="none"
        />

        {looking && <div style={{ fontSize: 12, color: '#9a9ab5' }}>Looking up…</div>}

        {resolved && (
          <div style={s.resolvedRow}>
            {resolved.pfp && <img src={resolved.pfp} alt="" style={{ width: 22, height: 22, borderRadius: 11 }} />}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 13, color: '#e8e8f0' }}>@{resolved.username}</span>
              <span style={{ fontSize: 11, color: '#9a9ab5' }}>{resolved.address.slice(0, 6)}…{resolved.address.slice(-4)}</span>
            </div>
          </div>
        )}

        {/* Custody wallets are often inaccessible in practice — say so plainly. */}
        {resolved && !resolved.verified && (
          <div style={{ fontSize: 12, color: '#f2d857' }}>
            No verified wallet — this goes to their custody address.
          </div>
        )}

        {lookupError && <div style={{ fontSize: 12, color: '#ff8080' }}>{lookupError}</div>}
        {to.length > 0 && !asHandle && !isRawAddr && (
          <div style={{ fontSize: 12, color: '#ff8080' }}>Enter a 0x address or a Farcaster username</div>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        {!confirmed ? (
          <FxButton
            style={{ ...s.primary, opacity: valid ? 1 : 0.4 }}
            tone="light"
            disabled={!valid}
            onClick={() => setConfirmed(true)}
            label="REVIEW THE SEND"
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={s.warnBox}>
              <div style={{ color: '#ff8080', marginBottom: 4 }}>⚠️ This cannot be undone</div>
              Sending <span style={{ color: '#f0f0f5' }}>{meta?.name ?? `Cat #${cat.id}`}</span> to<br />
              {resolved && <span style={{ color: '#f0f0f5' }}>@{resolved.username}<br /></span>}
              {/* Always show the address being sent to, even for a handle — this
                  is the last screen before an irreversible transfer. */}
              <span style={{ fontSize: 11, color: '#9a9ab5', wordBreak: 'break-all' as const }}>{target}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <FxButton style={{ ...s.ghost, marginTop: 0, flex: 1 }} tone="grey" onClick={() => setConfirmed(false)} label="CANCEL" />
              <FxButton
                style={{ ...s.danger, flex: 2, opacity: isPending || isConfirming ? 0.6 : 1 }}
                tone="red"
                disabled={isPending || isConfirming}
                onClick={send}
                label={isPending ? 'Confirm in wallet…' : isConfirming ? 'Sending…' : 'CONFIRM SEND'}
              />
            </div>
            {isError && <div style={{ fontSize: 12, color: '#ff8080' }}>{error?.message?.slice(0, 80)}</div>}
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * THIS SEASON'S RECORD — how this cat has done against everybody else's.
 *
 * Rebuilt from Farcaster by /api/ticker, because there is no database in this
 * app. That has a consequence the number cannot hide, so it does not try to:
 * ONLY FIGHTS SOMEBODY CAST ARE COUNTED, which makes this a floor rather than a
 * total. The line underneath says so.
 *
 * A cat nobody has cast about shows a dash, not a zero — "0-0" claims it fought
 * and did not win, and it did not fight.
 */
function SeasonRecord({ uid }: { uid: string }) {
  const [rec, setRec] = useState<{
    wins: number; losses: number; season: number
    points: number
    /** Null when this cat has never banked anything — not the same as being last. */
    rank: number | null
    /** How many cats are on the board at all. */
    of: number
  } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    setRec(null); setFailed(false)

    fetch(`/api/ticker?uid=${encodeURIComponent(uid)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('ticker'))))
      .then(d => { if (live) setRec(d) })
      .catch(() => { if (live) setFailed(true) })

    return () => { live = false }
  }, [uid])

  const fought = !!rec && rec.wins + rec.losses > 0

  return (
    <section style={s.block}>
      <p style={s.label}>{rec ? `SEASON ${rec.season}` : 'SEASON'}</p>
      <div style={s.traits}>
        <div style={s.trait}>
          <div style={s.traitKey}>Beaten</div>
          <div style={s.traitVal}>{fought ? rec!.wins : '—'}</div>
        </div>
        <div style={s.trait}>
          <div style={s.traitKey}>Lost to</div>
          <div style={s.traitVal}>{fought ? rec!.losses : '—'}</div>
        </div>
        <div style={s.trait}>
          <div style={s.traitKey}>Points</div>
          <div style={s.traitVal}>{rec && rec.points > 0 ? rec.points : '—'}</div>
        </div>
        {/*
          WHERE IT STANDS. Only a champion banks points, so a rank means this cat
          took all five at least once. A cat with none is not "last" — it is not
          on the board, which is a different thing and is said differently below.
        */}
        <div style={s.trait}>
          <div style={s.traitKey}>Rank</div>
          <div style={s.traitVal}>
            {rec?.rank ? `${rec.rank} of ${rec.of}` : '—'}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#9a9ab5', marginTop: 10, lineHeight: 1.5 }}>
        {failed
          ? 'could not reach the season board just now'
          : !rec
            ? 'reading the season board…'
            : rec.rank
              ? `champion · ranked on points, counted from cast runs only`
              : fought
                ? 'take all five to bank points and get on the board'
                : 'no cast runs yet — cast one and it counts'}
      </div>
    </section>
  )
}

function CatDetail({ cat, inApp, onBack }: { cat: Cat; inApp: boolean; onBack: () => void }) {
  const [showSend, setShowSend] = useState(false)
  const meta = cat.meta
  const col  = getCollection(cat.collection)

  async function share() {
    const name = meta?.name ?? `Clanker Cat #${cat.id}`
    /*
     * INSIDE FARCASTER IT IS A CAST, as before: $CLKCAT renders as a token chip,
     * @crezno makes every share a mention, and /api/share draws the cat as the
     * embed. ON THE WEB IT GOES TO X (JP, 2026-09-29), with the same card: the
     * share page carries og:image, so X shows the cat too.
     */
    if (inApp) {
      const shareUrl = `${APP_URL}/api/share?id=${cat.id}&c=${cat.collection}`
      const text = encodeURIComponent(`my cat 🐱 ${name}\nby @crezno\n$CLKCAT`)
      return openOut(`https://warpcast.com/~/compose?text=${text}&embeds[]=${encodeURIComponent(shareUrl)}`)
    }
    const params = new URLSearchParams({
      text: `my cat ${name}\n\nClanker Cats #ClankerCats`,
      url: `https://clankercats.com/api/share?id=${cat.id}&c=${cat.collection}`,
    })
    return openOut(`https://x.com/intent/post?${params.toString()}`)
  }

  return (
    <div style={s.stack}>
      <FxButton style={s.back} tone="grey" onClick={onBack} label="← MY CATS" />

      <section style={{ ...s.block, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Portrait src={meta?.image} pixel={col.pixelArt} size="min(100%, 300px)" />
        <BitmapText text={meta?.name ?? `Clanker Cat #${cat.id}`} scale={2} color="#f0f0f5" className="fx-btn-text" />
        <div style={{ fontSize: 13, color: '#9a9ab5', textAlign: 'center' }}>{col.label} · token #{cat.id} on {col.chain.name}</div>
      </section>

      {meta?.attributes && meta.attributes.length > 0 && (
        <section style={s.block}>
          <p style={s.label}>TRAITS</p>
          <div style={s.traits}>
            {meta.attributes.map((a, i) => (
              <div key={i} style={s.trait}>
                <div style={s.traitKey}>{a.trait_type}</div>
                <div style={s.traitVal}>{a.value}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <SeasonRecord uid={cat.uid} />

      <TamagotchiPanel catId={cat.uid} />

      {showSend && <SendPanel cat={cat} onClose={() => setShowSend(false)} />}

      <section style={{ ...s.block, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <FxButton href={`/tama/${cat.id}?c=${cat.collection}`} style={s.gold} tone="gold" label="TAMOCATCH" />
        <FxButton style={s.primary} tone="light" onClick={share} label={inApp ? 'CAST THIS CAT' : 'SHARE ON X'} />
        <FxButton style={{ ...s.ghost, marginTop: 0 }} tone="soft" onClick={() => setShowSend(v => !v)} label={showSend ? 'CANCEL THE SEND' : 'SEND THIS CAT'} />
      </section>
    </div>
  )
}

function EmptyState({ art }: { art: string | null }) {
  return (
    <section style={{ ...s.block, ...s.center }}>
      {art && <Portrait src={art} size={140} />}
      <BitmapText text="NO CATS YET" scale={2} color="#f0f0f5" className="fx-btn-text" />
      {/*
        This page reads EVERY drop — /api/owned scans every collection — so say
        what is actually being checked, and say which wallet, because the usual
        reason for an empty page is a different account being connected rather
        than an empty one.
      */}
      <div style={s.emptySubtitle}>
        Nothing in this wallet, across any drop — the original 200, the 1111 on
        Base, or the Robinhood cats. If you hold some, check which account is
        connected.
      </div>
      <FxButton href="/mint/v3" style={s.primary} tone="light" label="CLAIM A ROBINHOOD CAT" />
      <div style={s.fine}>free for BUN holders · one per wallet</div>
      <FxButton style={{ ...s.ghost, marginTop: 4 }} tone="grey" onClick={() => openOut(OPENSEA)} label="VIEW ON OPENSEA" />
    </section>
  )
}

export default function Home() {
  const { address, isConnected } = useAccount()
  const { connect, connectors }  = useConnect()
  const webConnectors = useWebConnectors()
  const [ready, setReady]        = useState(false)
  const [inApp, setInApp]        = useState(false)
  const [selected, setSelected]  = useState<Cat | null>(null)
  const [cats, setCats]          = useState<Cat[]>([])
  const [loading, setLoading]    = useState(false)
  /* The stand-in cat: random, so after mount. */
  const [art, setArt]            = useState<string | null>(null)

  useEffect(() => {
    try { sdk.actions.ready() } catch {}
    setReady(true)
    sdk.isInMiniApp().then(setInApp).catch(() => setInApp(false))
    setArt(`/v3/images/${POOL[Math.floor(Math.random() * POOL.length)]}.png`)
    const fc = connectors.find(c => c.id === 'farcaster-frame')
    if (fc) connect({ connector: fc })
  }, [])

  // The collections aren't enumerable, so ownership is resolved server-side.
  useEffect(() => {
    if (!address) { setCats([]); return }
    let cancelled = false
    setLoading(true)
    fetch(`/api/owned?wallet=${address}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (!cancelled) setCats(Array.isArray(data) ? data : []) })
      .catch(() => { if (!cancelled) setCats([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [address])

  const count = cats.length

  if (!ready) return null

  return (
    <main style={s.page}>
      {/* The title screen's page: a zone, blurred and darkened. */}
      <PageBackdrop />

      <header style={s.header}>
        <div style={s.nav}>
          <FxButton href="/" style={s.navBtn} tone="grey" label="← THE GAME" />
          {address && <div style={s.addr}>{address.slice(0, 6)}…{address.slice(-4)}</div>}
          <FxButton href="/mint" style={s.navBtn} tone="light" label="MINT" />
        </div>
        <h1 style={s.title}>CLANKER CATS</h1>
        <p style={s.sub}>{count > 0 ? `your ${count} cat${count !== 1 ? 's' : ''}` : 'your cats'}</p>
      </header>

      {!isConnected ? (
        <section style={{ ...s.block, ...s.center }}>
          {art && <Portrait src={art} size={140} />}
          <div style={s.emptySubtitle}>Connect a wallet to see your cats.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            {webConnectors.map(c => (
              <FxButton key={c.id} style={s.ghostWide} tone="soft" onClick={() => connect({ connector: c })} label={c.name.toUpperCase()} />
            ))}
          </div>
        </section>
      ) : selected !== null ? (
        <CatDetail cat={selected} inApp={inApp} onBack={() => setSelected(null)} />
      ) : loading ? (
        <section style={{ ...s.block, ...s.center }}>
          <div style={s.emptySubtitle}>reading your wallet…</div>
        </section>
      ) : cats.length > 0 ? (
        <section style={s.block}>
          <p style={s.label}>{cats.length} CLANKER CAT{cats.length !== 1 ? 'S' : ''}</p>
          <div style={s.grid}>
            {cats.map(c => (
              <CatCard key={c.uid} cat={c} selected={selected === c} onClick={() => setSelected(c)} />
            ))}
          </div>
          <div style={s.fine}>Tap a cat to see it.</div>
          {/* The idle game's card is off for now (JP, 2026-09-29); /game still works by its URL. */}
        </section>
      ) : (
        <EmptyState art={art} />
      )}
    </main>
  )
}

/* The front page's values (components/Cradle.tsx), on the title screen's page. */
const s: Record<string, React.CSSProperties> = {
  page:      { minHeight: '100dvh', color: '#f0f0f5', padding: '22px 18px 40px', maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 },
  header:    { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  nav:       { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  navBtn:    { padding: '6px 12px', border: '1px solid #2c2c3c', borderRadius: 10, background: 'rgba(18,18,28,0.6)' },
  addr:      { fontSize: 12, color: '#9a9ab5', background: 'rgba(18,18,28,0.7)', padding: '5px 10px', borderRadius: 20 },
  title:     { fontSize: 30, letterSpacing: 1, margin: '6px 0 0', lineHeight: 1.1, textAlign: 'center' },
  sub:       { color: '#9a9ab5', fontSize: 14, margin: 0 },
  block:     { background: 'rgba(18,18,28,0.92)', border: '1px solid #21212f', borderRadius: 14, padding: 16 },
  center:    { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' },
  stack:     { display: 'flex', flexDirection: 'column', gap: 16 },
  label:     { fontSize: 11, letterSpacing: 2, color: '#9a9ab5', margin: '0 0 12px' },
  fine:      { color: '#9a9ab5', fontSize: 12, margin: '12px 0 0', textAlign: 'center' },
  grid:      { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 },
  card:      { position: 'relative', display: 'flex', flexDirection: 'column', gap: 6, padding: 6, background: '#0b0b13', border: '1px solid #21212f', borderRadius: 10, cursor: 'pointer', color: 'inherit', font: 'inherit', textAlign: 'center' },
  cardOn:    { border: '1px solid #8b5cf6' },
  cardLabel: { fontSize: 12, color: '#c4c4d8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  // The game's portrait mount: a 2px paper ring round a 4px ink edge, cropped from the top.
  mount:     { boxSizing: 'border-box', padding: 2, background: '#fdfdf8', flexShrink: 0, alignSelf: 'center' },
  mountArt:  { width: '100%', aspectRatio: '1', display: 'block', boxSizing: 'border-box', border: '4px solid #1a1a1a', objectFit: 'cover', objectPosition: 'top', background: '#e6e0d2' },
  ogBadge:   { position: 'absolute', top: 10, right: 10, padding: '2px 6px', borderRadius: 5, background: '#7c3aed', color: '#fff', fontSize: 10, letterSpacing: 1 },
  traits:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  trait:     { background: '#0b0b13', border: '1px solid #21212f', borderRadius: 8, padding: '8px 10px' },
  traitKey:  { fontSize: 11, color: '#9a9ab5', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 3 },
  traitVal:  { fontSize: 15, color: '#f0f0f5' },
  tamaMessage: { fontSize: 14, color: '#c4c4d8', fontStyle: 'italic', lineHeight: 1.5 },
  tamaActions: { display: 'flex', gap: 8, marginTop: 14 },
  tamaBtn:   { flex: 1, padding: '8px 0', background: '#171722', border: '1px solid #34344a', borderRadius: 10, cursor: 'pointer' },
  // The front page's button shapes; a glyph row is 24px, so padding is a little under theirs.
  primary:   { width: '100%', background: '#8b5cf6', border: 0, borderRadius: 10, padding: '11px 16px', cursor: 'pointer' },
  gold:      { width: '100%', background: 'transparent', border: '1px solid #7a5c18', borderRadius: 10, padding: '10px 16px', cursor: 'pointer' },
  ghost:     { width: '100%', background: 'transparent', border: '1px solid #2c2c3c', borderRadius: 10, padding: '9px 16px', cursor: 'pointer', marginTop: 10 },
  ghostWide: { width: '100%', background: '#171722', border: '1px solid #2c2c3c', borderRadius: 10, padding: '10px 16px', cursor: 'pointer' },
  danger:    { background: 'transparent', border: '1px solid #d1495b', borderRadius: 10, padding: '10px 16px', cursor: 'pointer' },
  back:      { alignSelf: 'flex-start', padding: '6px 12px', border: '1px solid #2c2c3c', borderRadius: 10, background: 'rgba(18,18,28,0.6)' },
  // `font` FIRST: the shorthand resets fontSize, the bug CatSheet's close button had.
  input:     { font: 'inherit', fontSize: 14, background: '#0b0b13', border: '1px solid #2c2c3c', borderRadius: 8, padding: '10px 12px', color: 'white', width: '100%', boxSizing: 'border-box' as const, outline: 'none' },
  resolvedRow: { display: 'flex', alignItems: 'center', gap: 8, background: '#0b0b13', border: '1px solid #2c2c3c', borderRadius: 8, padding: '7px 10px' },
  warnBox:   { fontSize: 13, color: '#c4c4d8', background: '#0b0b13', border: '1px solid #2c2c3c', borderRadius: 8, padding: '10px 12px' },
  emptySubtitle: { fontSize: 15, color: '#c4c4d8', lineHeight: 1.6, margin: 0 },
}
