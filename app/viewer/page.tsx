'use client'

import { useEffect, useState } from 'react'
import { useAccount, useConnect, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { isAddress } from 'viem'
import sdk from '@farcaster/miniapp-sdk'
import { loadStats, saveStats, feed, pet, play, mood, moodEmoji, catLine, type Stats } from '@/lib/tamagotchi'

const CCAT     = '0xD7800C338228a6eeb37cF74133732Fb6aE05915F' as `0x${string}`
const RENDERER = '0x2fE5bf2aB284bc71B261Ea6d32aaadfcA987Eeb8' as `0x${string}`
const CCAT_DEXSCREENER = 'https://dexscreener.com/base/0x88b2debaed47d530ec3442bc28ce8073422180e6f2acdb6b1ff75cee12c9806f'

const CCAT_ABI = [
  {
    name: 'OwnerUpegsCount',
    type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'OwnerUpegsPage',
    type: 'function', stateMutability: 'view',
    inputs: [
      { name: 'owner',    type: 'address'  },
      { name: 'page',     type: 'uint256'  },
      { name: 'pageSize', type: 'uint256'  },
    ],
    outputs: [{
      name: 'upegs', type: 'tuple[]',
      components: [
        { name: 'id',   type: 'uint256' },
        { name: 'seed', type: 'uint256' },
      ],
    }],
  },
  {
    name: 'transferUpeg',
    type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'to',     type: 'address' },
      { name: 'upegId', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

const RENDERER_ABI = [
  {
    name: 'tokenURI',
    type: 'function', stateMutability: 'view',
    inputs: [
      { name: 'upegId', type: 'uint256' },
      { name: 'seed',   type: 'uint256' },
    ],
    outputs: [{ type: 'string' }],
  },
] as const

type Upeg    = { id: bigint; seed: bigint }
type CatMeta = { name: string; image: string; attributes: { trait_type: string; value: string }[] }

function decodeMeta(uri: string): CatMeta | null {
  try { return JSON.parse(atob(uri.split(',')[1])) }
  catch { return null }
}

function CatCard({ upeg, selected, onClick }: { upeg: Upeg; selected: boolean; onClick: () => void }) {
  const { data: uri } = useReadContract({
    address: RENDERER, abi: RENDERER_ABI, functionName: 'tokenURI',
    args: [upeg.id, upeg.seed],
  })
  const meta = uri ? decodeMeta(uri as string) : null

  return (
    <div onClick={onClick} style={{ ...s.card, borderColor: selected ? '#7c3aed' : '#1e1e2e', transform: selected ? 'scale(0.97)' : 'scale(1)', transition: 'all 0.15s ease' }}>
      {meta?.image
        ? <img src={meta.image} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
        : <div style={s.placeholder}><span style={{ fontSize: 24 }}>🐱</span></div>
      }
      <div style={s.cardLabel}>#{upeg.id.toString()}</div>
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

function SendPanel({ upeg, meta, onClose }: { upeg: Upeg; meta: CatMeta | null; onClose: () => void }) {
  const [to, setTo]         = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const { writeContract, data: txHash, isPending, isError, error } = useWriteContract()
  const { isSuccess, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash })

  const valid = isAddress(to)

  function send() {
    if (!valid) return
    writeContract({
      address: CCAT,
      abi: CCAT_ABI,
      functionName: 'transferUpeg',
      args: [to as `0x${string}`, upeg.id],
    })
  }

  if (isSuccess) {
    return (
      <div style={s.sendPanel}>
        <div style={{ fontSize: 36, textAlign: 'center' as const }}>✅</div>
        <div style={{ fontSize: 15, fontWeight: 'bold', textAlign: 'center' as const }}>CCat #{upeg.id.toString()} sent!</div>
        <div style={{ fontSize: 11, color: '#555', textAlign: 'center' as const, wordBreak: 'break-all' as const }}>To: {to}</div>
        <button style={s.sendConfirmBtn} onClick={onClose}>Done</button>
      </div>
    )
  }

  return (
    <div style={s.sendPanel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 'bold', color: '#ccc' }}>Send CCat</span>
        <button style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 18 }} onClick={onClose}>×</button>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {meta?.image
          ? <img src={meta.image} style={{ width: 64, height: 64, borderRadius: 8, border: '1px solid #2a2a3e', objectFit: 'cover' }} />
          : <div style={{ width: 64, height: 64, borderRadius: 8, background: '#12122a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🐱</div>
        }
        <div>
          <div style={{ fontSize: 15, fontWeight: 'bold' }}>{meta?.name ?? `CCat #${upeg.id}`}</div>
          <div style={{ fontSize: 11, color: '#555' }}>UniPeg · ClankerCats</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11, color: '#555', textTransform: 'uppercase' as const, letterSpacing: 1 }}>Recipient Address</label>
        <input
          value={to}
          onChange={e => setTo(e.target.value)}
          placeholder="0x..."
          style={s.sendInput}
          spellCheck={false}
          autoComplete="off"
        />
        {to.length > 0 && !valid && <div style={{ fontSize: 11, color: '#ef4444' }}>Invalid address</div>}
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
            Sending <strong style={{ color: '#ccc' }}>{meta?.name ?? `CCat #${upeg.id}`}</strong> to<br />
            <span style={{ fontSize: 10, color: '#555', wordBreak: 'break-all' as const }}>{to}</span>
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

function CatDetail({ upeg, onBack }: { upeg: Upeg; onBack: () => void }) {
  const [showSend, setShowSend] = useState(false)
  const { data: uri } = useReadContract({
    address: RENDERER, abi: RENDERER_ABI, functionName: 'tokenURI',
    args: [upeg.id, upeg.seed],
  })
  const meta = uri ? decodeMeta(uri as string) : null

  async function share() {
    const shareUrl = `https://ccat-viewer.vercel.app/api/share?id=${upeg.id}&seed=${upeg.seed}`
    const text = encodeURIComponent(`Check out my ClankerCat #${upeg.id} 🐱 $CLKCAT`)
    const embed = encodeURIComponent(shareUrl)
    const url = `https://warpcast.com/~/compose?text=${text}&embeds[]=${embed}`
    try { await sdk.actions.openUrl(url) }
    catch { window.open(url, '_blank') }
  }

  async function viewOnSite() {
    try { await sdk.actions.openUrl(`https://clankercats.com`) }
    catch { window.open('https://clankercats.com', '_blank') }
  }

  return (
    <div style={s.detail}>
      <button style={s.back} onClick={onBack}>← Back to my CCats</button>
      <div style={s.detailCard}>
        {meta?.image
          ? <img src={meta.image} style={{ width: '100%', borderRadius: 12, display: 'block' }} />
          : <div style={{ ...s.placeholder, aspectRatio: '1', borderRadius: 12 }}><span style={{ fontSize: 48 }}>🐱</span></div>
        }
      </div>
      <div style={s.detailName}>{meta?.name ?? `CCat #${upeg.id}`}</div>
      <div style={{ fontSize: 12, color: '#555' }}>ClankerCat · UniPeg on Base</div>
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
      <TamagotchiPanel catId={upeg.id.toString()} />

      {showSend && <SendPanel upeg={upeg} meta={meta} onClose={() => setShowSend(false)} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <a href={`/tama/${upeg.id}?seed=${upeg.seed}`} style={s.tamaPlayBtn}>🐾 TamoCatch</a>
        <button style={s.shareBtn} onClick={share}>Cast this CCat 🐱</button>
        <button style={s.sendBtn} onClick={() => setShowSend(v => !v)}>
          {showSend ? '✕ Cancel Send' : '📤 Send CCat'}
        </button>
        <button style={s.explorerBtn} onClick={viewOnSite}>clankercats.com</button>
      </div>
    </div>
  )
}

function EmptyState() {
  async function openDex() {
    try { await sdk.actions.openUrl(CCAT_DEXSCREENER) }
    catch { window.open(CCAT_DEXSCREENER, '_blank') }
  }
  return (
    <div style={s.emptyState}>
      <div style={s.heroCat}>🐱</div>
      <div style={s.emptyTitle}>No ClankerCats yet</div>
      <div style={s.emptySubtitle}>
        Buy $CCAT on Base to get your cat.<br />
        Each CCat is unique — fully on-chain pixel art.
      </div>
      <button style={s.buyBtn} onClick={openDex}>Buy $CCAT →</button>
      <div style={s.emptyHint}>Get $CCAT at clankercats.com</div>
    </div>
  )
}

export default function Home() {
  const { address, isConnected } = useAccount()
  const { connect, connectors }  = useConnect()
  const [ready, setReady]        = useState(false)
  const [selected, setSelected]  = useState<Upeg | null>(null)

  useEffect(() => {
    try { sdk.actions.ready() } catch {}
    setReady(true)
    const fc = connectors.find(c => c.id === 'farcaster-frame')
    if (fc) connect({ connector: fc })
  }, [])

  const { data: countData } = useReadContract({
    address: CCAT, abi: CCAT_ABI, functionName: 'OwnerUpegsCount',
    args: [address!],
    query: { enabled: !!address },
  })
  const count = countData ? Number(countData as bigint) : 0

  const { data: upegsData } = useReadContract({
    address: CCAT, abi: CCAT_ABI, functionName: 'OwnerUpegsPage',
    args: [address!, BigInt(0), BigInt(500)],
    query: { enabled: count > 0 && !!address },
  })

  const upegs: Upeg[] = (upegsData as Upeg[] | undefined) ?? []

  if (!ready) return null

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div>
          <div style={s.logo}>ClankerCats</div>
          {count > 0 && <div style={s.supply}>{count} cat{count !== 1 ? 's' : ''}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="/game" style={s.gameLink}>🎮 Idle Game</a>
          {address && <div style={s.addr}>{address.slice(0,6)}…{address.slice(-4)}</div>}
        </div>
      </div>

      {!isConnected ? (
        <div style={s.connectState}>
          <div style={s.heroCat}>🐱</div>
          <div style={s.emptyTitle}>ClankerCats Viewer</div>
          <div style={s.emptySubtitle}>Open in Warpcast to auto-connect,<br />or connect your wallet below.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            {connectors.filter(c => c.id !== 'farcaster-frame').map(c => (
              <button key={c.id} style={s.connectBtn} onClick={() => connect({ connector: c })}>{c.name}</button>
            ))}
          </div>
        </div>
      ) : selected !== null ? (
        <CatDetail upeg={selected} onBack={() => setSelected(null)} />
      ) : upegs.length > 0 ? (
        <>
          <div style={s.ownedHeader}>
            <span style={{ color: '#7c3aed', fontWeight: 'bold' }}>{upegs.length}</span>
            <span style={{ color: '#555' }}> ClankerCat{upegs.length !== 1 ? 's' : ''} owned</span>
          </div>
          <div style={s.grid}>
            {upegs.map(u => (
              <CatCard key={u.id.toString()} upeg={u} selected={selected === u} onClick={() => setSelected(u)} />
            ))}
          </div>
          <div style={s.mintHint}>Tap a CCat to see its traits ↑</div>
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
  sendInput:    { background: '#12122a', border: '1px solid #2a2a3e', borderRadius: 8, padding: '10px 12px', color: 'white', fontSize: 13, fontFamily: 'monospace', width: '100%', boxSizing: 'border-box' as const, outline: 'none' },
  sendConfirmBtn: { padding: '12px 0', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 'bold', width: '100%' },
  back:         { background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 13, padding: '0 0 4px 0', textAlign: 'left' as const },
  tamaPanel:    { display: 'flex', flexDirection: 'column', gap: 12, background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 12, padding: '14px 16px' },
  tamaMessage:  { fontSize: 13, color: '#aaa', fontStyle: 'italic', lineHeight: 1.5 },
  tamaActions:  { display: 'flex', gap: 8 },
  tamaBtn:      { flex: 1, padding: '10px 0', background: '#1e1e2e', border: '1px solid #2a2a3e', borderRadius: 10, color: 'white', cursor: 'pointer', fontSize: 13 },
  gameLink:     { fontSize: 12, color: '#7c3aed', textDecoration: 'none', background: '#1a1a2e', padding: '4px 10px', borderRadius: 20 },
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
