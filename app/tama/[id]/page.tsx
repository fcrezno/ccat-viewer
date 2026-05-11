'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { useReadContract } from 'wagmi'
import { loadStats, saveStats, feed, pet, play, mood, catLine, type Stats } from '@/lib/tamagotchi'

const RENDERER = '0x2fE5bf2aB284bc71B261Ea6d32aaadfcA987Eeb8' as `0x${string}`
const RENDERER_ABI = [
  {
    name: 'tokenURI', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'upegId', type: 'uint256' }, { name: 'seed', type: 'uint256' }],
    outputs: [{ type: 'string' }],
  },
] as const

type CatMeta = { name: string; image: string }

function decodeMeta(uri: string): CatMeta | null {
  try { return JSON.parse(atob(uri.split(',')[1])) }
  catch { return null }
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666' }}>
        <span style={{ textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
        <span style={{ color: value < 25 ? '#ef4444' : '#aaa' }}>{Math.round(value)}%</span>
      </div>
      <div style={{ background: '#0f0f1e', borderRadius: 4, height: 7, overflow: 'hidden', border: '1px solid #1a1a2e' }}>
        <div style={{
          width: `${value}%`, height: '100%', borderRadius: 4,
          background: value < 25 ? '#ef4444' : color,
          transition: 'width 0.4s ease',
          boxShadow: value > 25 ? `0 0 6px ${color}88` : 'none',
        }} />
      </div>
    </div>
  )
}

const ACTION_COOLDOWN = 1500

export default function TamaPage() {
  const params       = useParams()
  const searchParams = useSearchParams()
  const router       = useRouter()

  const catId   = params.id as string
  const seedStr = searchParams.get('seed') ?? '0'

  const [stats,      setStats]      = useState<Stats | null>(null)
  const [flash,      setFlash]      = useState<string | null>(null)
  const [lastAction, setLastAction] = useState(0)

  const { data: uri } = useReadContract({
    address: RENDERER, abi: RENDERER_ABI, functionName: 'tokenURI',
    args: [BigInt(catId), BigInt(seedStr)],
  })
  const meta = uri ? decodeMeta(uri as string) : null

  useEffect(() => { setStats(loadStats(catId)) }, [catId])

  useEffect(() => {
    if (!stats) return
    const t = setInterval(() => setStats(loadStats(catId)), 60_000)
    return () => clearInterval(t)
  }, [catId, stats])

  const act = useCallback((fn: (s: Stats) => Stats, msg: string) => {
    const now = Date.now()
    if (now - lastAction < ACTION_COOLDOWN) return
    setLastAction(now)
    setStats(prev => {
      const next = fn(prev!)
      saveStats(catId, next)
      return next
    })
    setFlash(msg)
    setTimeout(() => setFlash(null), 1200)
  }, [catId, lastAction])

  if (!stats) return null

  const m    = mood(stats)
  const line = catLine(stats)

  const moodColor: Record<typeof m, string> = {
    happy:   '#7c3aed',
    neutral: '#3b82f6',
    hungry:  '#f59e0b',
    sad:     '#6366f1',
    tired:   '#8b5cf6',
  }
  const screenGlow = moodColor[m]

  return (
    <div style={s.root}>
      <div style={s.header}>
        <button style={s.back} onClick={() => router.back()}>← Back</button>
        <div style={s.catName}>{meta?.name ?? `CCat #${catId}`}</div>
        <div style={{ width: 60 }} />
      </div>

      {/* device frame */}
      <div style={{ ...s.device, boxShadow: `0 0 40px ${screenGlow}44, inset 0 0 20px #00000066` }}>
        {/* screen */}
        <div style={{ ...s.screen, boxShadow: `0 0 24px ${screenGlow}66` }}>
          <div className={`tama-${m}`} style={s.spriteWrap}>
            {meta?.image
              ? <img src={meta.image} style={s.sprite} />
              : <div style={s.spriteFallback}>🐱</div>
            }
          </div>

          {/* speech bubble */}
          <div key={line} className="tama-bubble" style={s.bubble}>
            <span style={{ fontSize: 12, color: '#ccc', lineHeight: 1.4 }}>{line}</span>
            <div style={s.bubbleTail} />
          </div>

          {/* flash message */}
          {flash && (
            <div style={s.flash}>{flash}</div>
          )}
        </div>

        {/* device buttons row */}
        <div style={s.deviceButtons}>
          <div style={{ ...s.deviceDot, background: screenGlow, boxShadow: `0 0 8px ${screenGlow}` }} />
          <div style={{ ...s.deviceDot, background: '#1a1a2e' }} />
          <div style={{ ...s.deviceDot, background: '#1a1a2e' }} />
        </div>
      </div>

      {/* stats */}
      <div style={s.stats}>
        <StatBar label="Hunger"    value={stats.hunger}    color="#f59e0b" />
        <StatBar label="Happiness" value={stats.happiness} color="#7c3aed" />
        <StatBar label="Energy"    value={stats.energy}    color="#10b981" />
      </div>

      {/* action buttons */}
      <div style={s.actions}>
        <button style={{ ...s.btn, ...s.btnFeed }} onClick={() => act(feed, '🍖 Yum!')}>
          <span style={s.btnIcon}>🍖</span>
          <span>Feed</span>
        </button>
        <button style={{ ...s.btn, ...s.btnPet }} onClick={() => act(pet, '🤚 Purr~')}>
          <span style={s.btnIcon}>🤚</span>
          <span>Pet</span>
        </button>
        <button style={{ ...s.btn, ...s.btnPlay }} onClick={() => act(play, '🎮 Wheee!')}>
          <span style={s.btnIcon}>🎮</span>
          <span>Play</span>
        </button>
      </div>

      {/* low stat warnings */}
      {(stats.hunger < 25 || stats.happiness < 25 || stats.energy < 25) && (
        <div style={s.warning}>
          {stats.hunger    < 25 && <span>🍖 Hungry!</span>}
          {stats.happiness < 25 && <span>💔 Sad!</span>}
          {stats.energy    < 25 && <span>😴 Tired!</span>}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:          { padding: '16px 16px 32px', maxWidth: 400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20, minHeight: '100vh' },
  header:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  back:          { background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 13, padding: 0 },
  catName:       { fontSize: 15, fontWeight: 'bold', color: '#ccc', textAlign: 'center' },
  device:        { background: '#0d0d1f', border: '2px solid #2a2a4e', borderRadius: 24, padding: '20px 20px 14px', display: 'flex', flexDirection: 'column', gap: 14, transition: 'box-shadow 0.5s ease' },
  screen:        { background: '#08081a', border: '2px solid #1a1a3a', borderRadius: 16, aspectRatio: '1', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'box-shadow 0.5s ease' },
  spriteWrap:    { width: '70%', height: '70%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  sprite:        { width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' },
  spriteFallback:{ fontSize: 72, lineHeight: 1 },
  bubble:        { position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', background: '#1a1a30', border: '1px solid #2a2a4e', borderRadius: 10, padding: '8px 12px', maxWidth: '85%', textAlign: 'center', zIndex: 2 },
  bubbleTail:    { position: 'absolute', bottom: -7, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '7px solid #2a2a4e' },
  flash:         { position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', background: '#7c3aed', color: 'white', padding: '6px 16px', borderRadius: 20, fontSize: 13, fontWeight: 'bold', whiteSpace: 'nowrap', pointerEvents: 'none' },
  deviceButtons: { display: 'flex', gap: 8, justifyContent: 'center', paddingBottom: 2 },
  deviceDot:     { width: 10, height: 10, borderRadius: '50%', border: '1px solid #2a2a4e' },
  stats:         { display: 'flex', flexDirection: 'column', gap: 10, background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 12, padding: '14px 16px' },
  actions:       { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 },
  btn:           { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 0', border: '1px solid #2a2a3e', borderRadius: 14, cursor: 'pointer', fontSize: 13, fontWeight: 'bold', color: 'white', transition: 'transform 0.1s, opacity 0.1s' },
  btnIcon:       { fontSize: 24 },
  btnFeed:       { background: '#1a120a', borderColor: '#f59e0b44' },
  btnPet:        { background: '#120a1a', borderColor: '#7c3aed44' },
  btnPlay:       { background: '#0a121a', borderColor: '#3b82f644' },
  warning:       { display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' as const, fontSize: 13, color: '#ef4444', fontWeight: 'bold' },
}
