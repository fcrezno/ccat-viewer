'use client'

import { useEffect, useState } from 'react'
import { useAccount, useConnect, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { isAddress } from 'viem'
import sdk from '@farcaster/miniapp-sdk'
import { loadStats, saveStats, feed, pet, play, mood, moodEmoji, catLine, type Stats } from '@/lib/tamagotchi'
import { COLLECTION_ABI, COLLECTIONS, getCollection, type Cat } from '@/lib/collection'

const OPENSEA = 'https://opensea.io/collection/clanker-cats'

function CatCard({ cat, selected, onClick }: { cat: Cat; selected: boolean; onClick: () => void }) {
  const meta = cat.meta
  const col  = getCollection(cat.collection)
  // Only worth calling out which drop a cat is from once there's more than one.
  const showBadge = COLLECTIONS.length > 1 && cat.collection === 'v1'

  return (
    <div onClick={onClick} style={{ ...s.card, position: 'relative', borderColor: selected ? '#7c3aed' : '#1e1e2e', transform: selected ? 'scale(0.97)' : 'scale(1)', transition: 'all 0.15s ease' }}>
      {meta?.image
        ? <img src={meta.image} loading="lazy" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block', imageRendering: col.pixelArt ? 'pixelated' : 'auto' }} />
        : <div style={s.placeholder}><span style={{ fontSize: 24 }}>🐱</span></div>
      }
      {showBadge && <div style={s.ogBadge}>OG</div>}
      <div style={s.cardLabel}>{meta?.name ?? `#${cat.id}`}</div>
    </div>
  )
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#555' }}>
        <span style={{ textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div style={{ background: '#1a1a2e', borderRadius: 4, height: 6, overflow: 'hidden' }}>
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
    <div style={s.tamaPanel}>
      <div style={s.tamaMessage}>{emoji} &ldquo;{catLine(stats)}&rdquo;</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <StatBar label="Hunger"    value={stats.hunger}    color="#f59e0b" />
        <StatBar label="Happiness" value={stats.happiness} color="#7c3aed" />
        <StatBar label="Energy"    value={stats.energy}    color="#10b981" />
      </div>
      <div style={s.tamaActions}>
        <button style={s.tamaBtn} onClick={() => act(feed)}>🍖 Feed</button>
        <button style={s.tamaBtn} onClick={() => act(pet)}>🤚 Pet</button>
        <button style={s.tamaBtn} onClick={() => act(play)}>🎮 Play</button>
      </div>
    </div>
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
      address: getCollection(cat.collection).address,
      abi: COLLECTION_ABI,
      functionName: 'safeTransferFrom',
      args: [address, target as `0x${string}`, BigInt(cat.id)],
    })
  }

  if (isSuccess) {
    return (
      <div style={s.sendPanel}>
        <div style={{ fontSize: 36, textAlign: 'center' as const }}>✅</div>
        <div style={{ fontSize: 15, fontWeight: 'bold', textAlign: 'center' as const }}>{meta?.name ?? `Cat #${cat.id}`} sent!</div>
        <div style={{ fontSize: 11, color: '#555', textAlign: 'center' as const, wordBreak: 'break-all' as const }}>To: {resolved ? '@' + resolved.username : target}</div>
        <button style={s.sendConfirmBtn} onClick={onClose}>Done</button>
      </div>
    )
  }

  return (
    <div style={s.sendPanel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 'bold', color: '#ccc' }}>Send Cat</span>
        <button style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 18 }} onClick={onClose}>×</button>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {meta?.image
          ? <img src={meta.image} style={{ width: 64, height: 64, borderRadius: 8, border: '1px solid #2a2a3e', objectFit: 'cover' }} />
          : <div style={{ width: 64, height: 64, borderRadius: 8, background: '#12122a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🐱</div>
        }
        <div>
          <div style={{ fontSize: 15, fontWeight: 'bold' }}>{meta?.name ?? `Cat #${cat.id}`}</div>
          <div style={{ fontSize: 11, color: '#555' }}>{getCollection(cat.collection).label} · Base</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11, color: '#555', textTransform: 'uppercase' as const, letterSpacing: 1 }}>Send to</label>
        <input
          value={to}
          onChange={e => setTo(e.target.value)}
          placeholder="@username or 0x..."
          style={s.sendInput}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="none"
        />

        {looking && <div style={{ fontSize: 11, color: '#555' }}>Looking up…</div>}

        {resolved && (
          <div style={s.resolvedRow}>
            {resolved.pfp && <img src={resolved.pfp} alt="" style={{ width: 22, height: 22, borderRadius: 11 }} />}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12, color: '#ccc' }}>@{resolved.username}</span>
              <span style={{ fontSize: 10, color: '#555' }}>{resolved.address.slice(0, 6)}…{resolved.address.slice(-4)}</span>
            </div>
          </div>
        )}

        {/* Custody wallets are often inaccessible in practice — say so plainly. */}
        {resolved && !resolved.verified && (
          <div style={{ fontSize: 11, color: '#f2d857' }}>
            No verified wallet — this goes to their custody address.
          </div>
        )}

        {lookupError && <div style={{ fontSize: 11, color: '#ef4444' }}>{lookupError}</div>}
        {to.length > 0 && !asHandle && !isRawAddr && (
          <div style={{ fontSize: 11, color: '#ef4444' }}>Enter a Farcaster username or a 0x address</div>
        )}
      </div>

      {!confirmed ? (
        <button
          style={{ ...s.sendConfirmBtn, opacity: valid ? 1 : 0.4 }}
          disabled={!valid}
          onClick={() => setConfirmed(true)}
        >
          Review Send →
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: '#aaa', background: '#0a0a14', border: '1px solid #2a2a3e', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ color: '#ef4444', fontWeight: 'bold', marginBottom: 4 }}>⚠️ This cannot be undone</div>
            Sending <strong style={{ color: '#ccc' }}>{meta?.name ?? `Cat #${cat.id}`}</strong> to<br />
            {resolved && <span style={{ color: '#ccc' }}>@{resolved.username}<br /></span>}
            {/* Always show the address being sent to, even for a handle — this
                is the last screen before an irreversible transfer. */}
            <span style={{ fontSize: 10, color: '#555', wordBreak: 'break-all' as const }}>{target}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...s.sendConfirmBtn, background: '#1e1e2e', flex: 1 }} onClick={() => setConfirmed(false)}>Cancel</button>
            <button
              style={{ ...s.sendConfirmBtn, flex: 2, opacity: isPending || isConfirming ? 0.6 : 1 }}
              disabled={isPending || isConfirming}
              onClick={send}
            >
              {isPending ? 'Confirm in wallet…' : isConfirming ? 'Sending…' : 'Confirm Send'}
            </button>
          </div>
          {isError && <div style={{ fontSize: 11, color: '#ef4444' }}>{error?.message?.slice(0, 80)}</div>}
        </div>
      )}
    </div>
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
    <>
      <div style={s.sectionLabel}>
        {rec ? `Season ${rec.season}` : 'Season'}
      </div>
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
      <div style={{ fontSize: 11, color: '#555', marginTop: 6, lineHeight: 1.5 }}>
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
    </>
  )
}

function CatDetail({ cat, onBack }: { cat: Cat; onBack: () => void }) {
  const [showSend, setShowSend] = useState(false)
  const meta = cat.meta
  const col  = getCollection(cat.collection)

  async function share() {
    const shareUrl = `https://ccat-viewer.vercel.app/api/share?id=${cat.id}&c=${cat.collection}`
    const name = meta?.name ?? `Clanker Cat #${cat.id}`
    // $CLKCAT renders as a token chip; @crezno makes every share a mention so
    // the drop collects into one thread instead of scattering.
    const text = encodeURIComponent(`my cat 🐱 ${name}\nby @crezno\n$CLKCAT`)
    const url = `https://warpcast.com/~/compose?text=${text}&embeds[]=${encodeURIComponent(shareUrl)}`
    try { await sdk.actions.openUrl(url) }
    catch { window.open(url, '_blank') }
  }

  async function viewOnSite() {
    try { await sdk.actions.openUrl(`https://clankercats.com`) }
    catch { window.open('https://clankercats.com', '_blank') }
  }

  return (
    <div style={s.detail}>
      <button style={s.back} onClick={onBack}>← Back to my cats</button>
      <div style={s.detailCard}>
        {meta?.image
          ? <img src={meta.image} style={{ width: '100%', borderRadius: 12, display: 'block', imageRendering: col.pixelArt ? 'pixelated' : 'auto' }} />
          : <div style={{ ...s.placeholder, aspectRatio: '1', borderRadius: 12 }}><span style={{ fontSize: 48 }}>🐱</span></div>
        }
      </div>
      <div style={s.detailName}>{meta?.name ?? `Clanker Cat #${cat.id}`}</div>
      <div style={{ fontSize: 12, color: '#555' }}>{col.label} · token #{cat.id} on Base</div>
      {meta?.attributes && meta.attributes.length > 0 && (
        <>
          <div style={s.sectionLabel}>Traits</div>
          <div style={s.traits}>
            {meta.attributes.map((a, i) => (
              <div key={i} style={s.trait}>
                <div style={s.traitKey}>{a.trait_type}</div>
                <div style={s.traitVal}>{a.value}</div>
              </div>
            ))}
          </div>
        </>
      )}
      <SeasonRecord uid={cat.uid} />

      <TamagotchiPanel catId={cat.uid} />

      {showSend && <SendPanel cat={cat} onClose={() => setShowSend(false)} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <a href={`/tama/${cat.id}?c=${cat.collection}`} style={s.tamaPlayBtn}>🐾 TamoCatch</a>
        <button style={s.shareBtn} onClick={share}>Cast this cat 🐱</button>
        <button style={s.sendBtn} onClick={() => setShowSend(v => !v)}>
          {showSend ? '✕ Cancel Send' : '📤 Send Cat'}
        </button>
        <button style={s.explorerBtn} onClick={viewOnSite}>clankercats.com</button>
      </div>
    </div>
  )
}

function EmptyState() {
  async function openOpenSea() {
    try { await sdk.actions.openUrl(OPENSEA) }
    catch { window.open(OPENSEA, '_blank') }
  }
  return (
    <div style={s.emptyState}>
      <div style={s.heroCat}>🐱</div>
      <div style={s.emptyTitle}>No Clanker Cats yet</div>
      {/*
        This page reads BOTH drops — /api/owned scans every collection — but the
        copy only mentioned the original 200, which read as though V2 were not
        being looked at. Say what is actually being checked, and say which wallet,
        because the usual reason for an empty page is a different account being
        connected rather than an empty one.
      */}
      <div style={s.emptySubtitle}>
        Nothing in this wallet, across either drop —<br />
        the original 200 or the 1111 of V2.<br />
        If you hold some, check which account is connected.
      </div>
      <button style={s.buyBtn} onClick={openOpenSea}>View on OpenSea →</button>
      <div style={s.emptyHint}>More free mints coming — watch @crezno</div>
    </div>
  )
}

export default function Home() {
  const { address, isConnected } = useAccount()
  const { connect, connectors }  = useConnect()
  const [ready, setReady]        = useState(false)
  const [selected, setSelected]  = useState<Cat | null>(null)
  const [cats, setCats]          = useState<Cat[]>([])
  const [loading, setLoading]    = useState(false)

  useEffect(() => {
    try { sdk.actions.ready() } catch {}
    setReady(true)
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
    <div style={s.root}>
      <div style={s.header}>
        <div>
          <div style={s.logo}>Clanker Cats</div>
          {count > 0 && <div style={s.supply}>{count} cat{count !== 1 ? 's' : ''}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="/mint" style={s.mintLink}>🐱 Mint</a>
          <a href="/game" style={s.gameLink}>🎮 Idle Clank</a>
          {address && <div style={s.addr}>{address.slice(0,6)}…{address.slice(-4)}</div>}
        </div>
      </div>

      {!isConnected ? (
        <div style={s.connectState}>
          <div style={s.heroCat}>🐱</div>
          <div style={s.emptyTitle}>Clanker Cats Viewer</div>
          <div style={s.emptySubtitle}>Open in Warpcast to auto-connect,<br />or connect your wallet below.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            {connectors.filter(c => c.id !== 'farcaster-frame').map(c => (
              <button key={c.id} style={s.connectBtn} onClick={() => connect({ connector: c })}>{c.name}</button>
            ))}
          </div>
        </div>
      ) : selected !== null ? (
        <CatDetail cat={selected} onBack={() => setSelected(null)} />
      ) : loading ? (
        <div style={{ padding: 60, textAlign: 'center' as const, color: '#555', fontSize: 13 }}>Loading your cats…</div>
      ) : cats.length > 0 ? (
        <>
          <div style={s.ownedHeader}>
            <span style={{ color: '#7c3aed', fontWeight: 'bold' }}>{cats.length}</span>
            <span style={{ color: '#555' }}> Clanker Cat{cats.length !== 1 ? 's' : ''} owned</span>
          </div>
          <div style={s.grid}>
            {cats.map(c => (
              <CatCard key={c.uid} cat={c} selected={selected === c} onClick={() => setSelected(c)} />
            ))}
          </div>
          <div style={s.mintHint}>Tap a cat to see its traits ↑</div>
          <a href="/game" style={s.gameCard}>
            <span style={{ fontSize: 28 }}>🎮</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 'bold', color: '#ccc' }}>Idle Clank</div>
              <div style={{ fontSize: 11, color: '#555' }}>Fish · Build · Fight</div>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 18, color: '#7c3aed' }}>→</span>
          </a>
        </>
      ) : (
        <EmptyState />
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:         { padding: '16px 16px 32px', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, minHeight: '100vh' },
  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo:         { fontSize: 18, fontWeight: 'bold', color: '#7c3aed' },
  supply:       { fontSize: 11, color: '#7c3aed', marginTop: 2 },
  addr:         { fontSize: 11, color: '#555', background: '#1e1e2e', padding: '4px 10px', borderRadius: 20, flexShrink: 0 },
  ownedHeader:  { fontSize: 14 },
  mintHint:     { fontSize: 11, color: '#333', textAlign: 'center' as const },
  grid:         { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 },
  card:         { border: '1px solid #1e1e2e', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', background: '#12122a' },
  placeholder:  { display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '1', color: '#2a2a3e', fontSize: 12 },
  cardLabel:    { padding: '6px 8px', fontSize: 11, color: '#444' },
  ogBadge:      { position: 'absolute', top: 6, right: 6, padding: '2px 6px', borderRadius: 5, background: '#7c3aed', color: '#fff', fontSize: 9, fontWeight: 'bold', letterSpacing: 1 },
  detail:       { display: 'flex', flexDirection: 'column', gap: 14 },
  detailCard:   { borderRadius: 14, overflow: 'hidden', border: '1px solid #1e1e2e' },
  detailName:   { fontSize: 22, fontWeight: 'bold' },
  sectionLabel: { fontSize: 11, color: '#555', textTransform: 'uppercase' as const, letterSpacing: 1 },
  traits:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  trait:        { background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 8, padding: '8px 10px' },
  traitKey:     { fontSize: 10, color: '#555', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 3 },
  traitVal:     { fontSize: 13, color: '#ccc', fontWeight: 'bold' },
  tamaPlayBtn:  { display: 'block', padding: 14, background: '#12122a', border: '2px solid #7c3aed', color: '#a78bfa', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 'bold', textAlign: 'center' as const, textDecoration: 'none' },
  shareBtn:     { padding: 14, background: '#7c3aed', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 'bold' },
  sendBtn:      { padding: 12, background: 'transparent', color: '#ccc', border: '1px solid #3a3a4e', borderRadius: 10, cursor: 'pointer', fontSize: 13 },
  explorerBtn:  { padding: 12, background: 'transparent', color: '#555', border: '1px solid #2a2a3e', borderRadius: 10, cursor: 'pointer', fontSize: 13 },
  sendPanel:    { display: 'flex', flexDirection: 'column', gap: 14, background: '#0a0a14', border: '1px solid #2a2a3e', borderRadius: 12, padding: '16px' },
  resolvedRow:  { display: 'flex', alignItems: 'center', gap: 8, background: '#12122a', border: '1px solid #2a2a3e', borderRadius: 8, padding: '7px 10px' },
  sendInput:    { background: '#12122a', border: '1px solid #2a2a3e', borderRadius: 8, padding: '10px 12px', color: 'white', fontSize: 13, fontFamily: 'monospace', width: '100%', boxSizing: 'border-box' as const, outline: 'none' },
  sendConfirmBtn: { padding: '12px 0', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 'bold', width: '100%' },
  back:         { background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 13, padding: '0 0 4px 0', textAlign: 'left' as const },
  tamaPanel:    { display: 'flex', flexDirection: 'column', gap: 12, background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 12, padding: '14px 16px' },
  tamaMessage:  { fontSize: 13, color: '#aaa', fontStyle: 'italic', lineHeight: 1.5 },
  tamaActions:  { display: 'flex', gap: 8 },
  tamaBtn:      { flex: 1, padding: '10px 0', background: '#1e1e2e', border: '1px solid #2a2a3e', borderRadius: 10, color: 'white', cursor: 'pointer', fontSize: 13 },
  gameLink:     { fontSize: 12, color: '#7c3aed', textDecoration: 'none', background: '#1a1a2e', padding: '4px 10px', borderRadius: 20 },
  mintLink:     { fontSize: 12, color: '#fff', textDecoration: 'none', background: '#7c3aed', padding: '4px 10px', borderRadius: 20, fontWeight: 'bold' },
  gameCard:     { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#12122a', border: '1px solid #2a2a3e', borderRadius: 12, textDecoration: 'none', cursor: 'pointer' },
  connectState: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 24 },
  emptyState:   { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, paddingTop: 24, textAlign: 'center' as const },
  heroCat:      { fontSize: 72, lineHeight: 1 },
  emptyTitle:   { fontSize: 20, fontWeight: 'bold', color: '#ccc' },
  emptySubtitle:{ fontSize: 14, color: '#555', lineHeight: 1.6 },
  emptyHint:    { fontSize: 11, color: '#333' },
  buyBtn:       { padding: '14px 24px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 'bold', width: '100%' },
  connectBtn:   { padding: '14px 20px', background: '#1e1e2e', border: '1px solid #2a2a3e', borderRadius: 10, color: 'white', cursor: 'pointer', fontSize: 14, width: '100%' },
}
