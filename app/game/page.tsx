'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import sdk from '@farcaster/miniapp-sdk'
import {
  loadGame, saveGame, tick, buyBuilding, buyUpgrade,
  buildingCost, canAfford, fmt, ZONE_NAMES, UPGRADES,
  type GameState,
} from '@/lib/game'

const TICK_MS = 250

// Placeholder — replace with deployed contract address
const AUTO_RUN_ADDRESS = '0xa003b34f82950604d2c5e7b26986d6acc7862514' as `0x${string}`
const CLKCAT_ADDRESS   = '0xD7800C338228a6eeb37cF74133732Fb6aE05915F' as `0x${string}`

const AUTO_RUN_ABI = [
  { name: 'startAutoRun', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'tier', type: 'uint8' }], outputs: [] },
  { name: 'isActive', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }], outputs: [{ type: 'bool' }] },
  { name: 'remainingSecs', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'getSession', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ type: 'tuple', components: [
      { name: 'startedAt', type: 'uint64' },
      { name: 'expiresAt', type: 'uint64' },
      { name: 'tier',      type: 'uint8'  },
    ]}] },
  { name: 'prizePool', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'seasonActive', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'bool' }] },
] as const

const CLKCAT_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
] as const

const TIER_LABELS    = ['6 hours', '12 hours', '24 hours']
const TIER_COSTS     = ['100K $CLKCAT', '250K $CLKCAT', '500K $CLKCAT']
const TIER_COSTS_WEI = [BigInt('100000000000000000000000'), BigInt('250000000000000000000000'), BigInt('500000000000000000000000')]

function fmtSecs(s: number): string {
  if (s <= 0) return '0s'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

const MINI_GRID_SIZE = 12
const FISH_COUNT     = 5
const DECOYS         = ['🐻', '🤖', '🧶', '🎰', '📉', '🌀', '👮', '🐋']

function MiniGame({ onWin, onClose }: { onWin: () => void; onClose: () => void }) {
  const [phase, setPhase]     = useState<'intro' | 'play' | 'win' | 'lose'>('intro')
  const [timeLeft, setTimeLeft] = useState(5)
  const [grid, setGrid]       = useState<string[]>([])
  const [tapped, setTapped]   = useState<Set<number>>(new Set())
  const [fishIdx, setFishIdx] = useState<Set<number>>(new Set())

  function startGame() {
    const fish = new Set<number>()
    while (fish.size < FISH_COUNT) fish.add(Math.floor(Math.random() * MINI_GRID_SIZE))
    const items = Array.from({ length: MINI_GRID_SIZE }, (_, i) =>
      fish.has(i) ? '🐟' : DECOYS[Math.floor(Math.random() * DECOYS.length)]
    )
    setFishIdx(fish)
    setGrid(items)
    setTapped(new Set())
    setTimeLeft(8)
    setPhase('play')
  }

  useEffect(() => {
    if (phase !== 'play') return
    if (timeLeft <= 0) { setPhase('lose'); return }
    const id = setTimeout(() => setTimeLeft(t => t - 1), 1000)
    return () => clearTimeout(id)
  }, [phase, timeLeft])

  function tap(i: number) {
    if (phase !== 'play') return
    if (!fishIdx.has(i)) { setPhase('lose'); return }
    const next = new Set(tapped).add(i)
    setTapped(next)
    if (next.size === FISH_COUNT) { setPhase('win'); onWin() }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'white', border: '2.5px solid #111', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>

        {phase === 'intro' && <>
          <div style={{ fontSize: 32, fontWeight: 'bold', color: '#111', textAlign: 'center' as const, lineHeight: 1.2 }}>🎮 MINI GAME TIME!</div>
          <div style={{ fontSize: 14, color: '#555', textAlign: 'center' as const }}>Tap all the 🐟 fish before time runs out!</div>
          <div style={{ fontSize: 13, color: '#666', textAlign: 'center' as const }}>Win → bonus Fish + Clank!</div>
          <button style={{ ...g.actionBtn, background: '#111', color: 'white', width: '100%', fontSize: 16 }} onClick={startGame}>Let's GO! 🚀</button>
          <button style={{ background: 'none', border: 'none', color: '#333', cursor: 'pointer', fontSize: 12 }} onClick={onClose}>skip</button>
        </>}

        {phase === 'play' && <>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#555' }}>Tap the 🐟 fish!</span>
            <span style={{ fontSize: 20, fontWeight: 'bold', color: timeLeft <= 2 ? '#ef4444' : '#111' }}>⏱ {timeLeft}s</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, width: '100%' }}>
            {grid.map((emoji, i) => (
              <button key={i} onClick={() => tap(i)}
                style={{ fontSize: 28, padding: 10, borderRadius: 10, border: '1.5px solid #111',
                  background: tapped.has(i) ? '#ddd' : 'white', cursor: 'pointer',
                  opacity: tapped.has(i) ? 0.4 : 1, transition: 'all 0.1s' }}>
                {emoji}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>{tapped.size}/{FISH_COUNT} caught</div>
        </>}

        {phase === 'win' && <>
          <div style={{ fontSize: 48 }}>🎉</div>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#10b981' }}>You got them all!</div>
          <div style={{ fontSize: 14, color: '#555', textAlign: 'center' as const }}>+50 🐟 Fish + 20 ⚡ Clank added!</div>
          <button style={{ ...g.actionBtn, background: '#10b981', width: '100%' }} onClick={onClose}>Collect & Continue</button>
        </>}

        {phase === 'lose' && <>
          <div style={{ fontSize: 48 }}>😿</div>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#ef4444' }}>Wrong one!</div>
          <div style={{ fontSize: 14, color: '#666', textAlign: 'center' as const }}>The fish got away...</div>
          <button style={{ ...g.actionBtn, background: '#111', color: 'white', width: '100%' }} onClick={startGame}>Try Again!</button>
          <button style={{ background: 'none', border: 'none', color: '#333', cursor: 'pointer', fontSize: 12 }} onClick={onClose}>skip</button>
        </>}

      </div>
    </div>
  )
}

function PrizePoolBanner() {
  const { data: prizePool } = useReadContract({
    address: AUTO_RUN_ADDRESS, abi: AUTO_RUN_ABI, functionName: 'prizePool',
    query: { refetchInterval: 30_000 },
  })
  const pool = prizePool ? Number(prizePool) / 1e18 : 0
  if (pool <= 0) return null
  return (
    <div style={{ background: '#111', borderRadius: 10, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>🏆 Season Prize Pool</div>
        <div style={{ fontSize: 20, fontWeight: 'bold', color: 'white' }}>{fmt(pool)} $CLKCAT</div>
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'right' as const }}>
        <div>Top players</div>
        <div>earn it all</div>
      </div>
    </div>
  )
}

function AutoRunPanel() {
  const { address } = useAccount()
  const [step, setStep] = useState<'idle' | 'approving' | 'buying'>('idle')
  const [selectedTier, setSelectedTier] = useState<number | null>(null)

  const { data: isActive, refetch: refetchActive } = useReadContract({
    address: AUTO_RUN_ADDRESS, abi: AUTO_RUN_ABI, functionName: 'isActive',
    args: [address!], query: { enabled: !!address && AUTO_RUN_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  })
  const { data: remainingSecs, refetch: refetchSecs } = useReadContract({
    address: AUTO_RUN_ADDRESS, abi: AUTO_RUN_ABI, functionName: 'remainingSecs',
    args: [address!], query: { enabled: !!address && AUTO_RUN_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  })
  const { data: prizePool } = useReadContract({
    address: AUTO_RUN_ADDRESS, abi: AUTO_RUN_ABI, functionName: 'prizePool',
    query: { enabled: AUTO_RUN_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  })
  const { data: seasonActive } = useReadContract({
    address: AUTO_RUN_ADDRESS, abi: AUTO_RUN_ABI, functionName: 'seasonActive',
    query: { enabled: AUTO_RUN_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  })

  const { writeContract: approve, data: approveTx } = useWriteContract()
  const { writeContract: buy,     data: buyTx      } = useWriteContract()
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTx })
  const { isSuccess: buySuccess }     = useWaitForTransactionReceipt({ hash: buyTx })

  useEffect(() => {
    if (approveSuccess && selectedTier !== null) {
      buy({ address: AUTO_RUN_ADDRESS, abi: AUTO_RUN_ABI, functionName: 'startAutoRun', args: [selectedTier] })
      setStep('buying')
    }
  }, [approveSuccess])

  useEffect(() => {
    if (buySuccess) { setStep('idle'); setSelectedTier(null); refetchActive(); refetchSecs() }
  }, [buySuccess])

  function startPurchase(tier: number) {
    if (!address) return
    setSelectedTier(tier)
    setStep('approving')
    approve({ address: CLKCAT_ADDRESS, abi: CLKCAT_ABI, functionName: 'approve',
      args: [AUTO_RUN_ADDRESS, TIER_COSTS_WEI[tier]] })
  }

  const notDeployed = AUTO_RUN_ADDRESS === '0x0000000000000000000000000000000000000000'
  const secs = remainingSecs ? Number(remainingSecs) : 0
  const pool = prizePool ? Number(prizePool) / 1e18 : 0
  const seasonOpen = seasonActive === true

  return (
    <div style={g.panel}>
      <div style={g.panelHeader}>
        <span>⚡ Auto-Run</span>
        {pool > 0 && <span style={{ fontSize: 11, color: '#111' }}>🏆 {fmt(pool)} $CLKCAT pool</span>}
      </div>

      {notDeployed ? (
        <div style={{ fontSize: 11, color: '#666', textAlign: 'center' as const, padding: '8px 0' }}>
          Contract deploying soon — check back!
        </div>
      ) : !seasonOpen ? (
        <div style={{ fontSize: 11, color: '#666', textAlign: 'center' as const, padding: '8px 0' }}>
          🏁 Season 1 starting soon — check back!
        </div>
      ) : isActive ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: '#10b981', textAlign: 'center' as const }}>✅ Auto-run active</div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#333', textAlign: 'center' as const }}>{fmtSecs(secs)}</div>
          <div style={{ fontSize: 11, color: '#666', textAlign: 'center' as const }}>remaining · game runs while you're away</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#666' }}>Pay $CLKCAT to auto-run. 80% goes to the prize pool — top players earn it back.</div>
          {TIER_LABELS.map((label, i) => (
            <button
              key={i}
              style={{ ...g.buildingRow, opacity: step !== 'idle' ? 0.5 : 1 }}
              disabled={step !== 'idle'}
              onClick={() => startPurchase(i)}
            >
              <div style={{ textAlign: 'left' as const }}>
                <div style={{ fontSize: 13, color: '#333' }}>{label}</div>
                <div style={{ fontSize: 11, color: '#666' }}>{TIER_COSTS[i]}</div>
              </div>
              <div style={{ fontSize: 11, color: '#111' }}>
                {step !== 'idle' && selectedTier === i
                  ? (step === 'approving' ? 'Approving…' : 'Starting…')
                  : '▶'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ResourceBar({ state }: { state: GameState }) {
  const { fish, moondust, clank } = state.resources
  const speed = 1 + state.upgrades.speed * 0.5
  const rates = { fish: 0, moondust: 0, clank: 0 }
  for (const b of state.buildings) {
    for (const [r, v] of Object.entries(b.prod) as [keyof typeof rates, number][]) {
      rates[r] += v * b.count * speed
    }
  }

  function RateLabel({ rate }: { rate: number }) {
    if (rate <= 0) return null
    return <span style={{ fontSize: 9, color: '#111' }}>+{rate < 1 ? rate.toFixed(1) : fmt(rate)}/s</span>
  }

  return (
    <div style={g.resBar}>
      <div style={g.resItem}>
        <span style={g.resEmoji}>⚡</span>
        <span>{fmt(clank)}</span>
        <RateLabel rate={rates.clank} />
      </div>
      <div style={g.resItem}>
        <span style={g.resEmoji}>🐟</span>
        <span>{fmt(fish)}</span>
        <RateLabel rate={rates.fish} />
      </div>
      <div style={g.resItem}>
        <span style={g.resEmoji}>🌙</span>
        <span>{fmt(moondust)}</span>
        <RateLabel rate={rates.moondust} />
      </div>
      <div style={g.resItem}>
        <span style={g.resEmoji}>🐱</span>
        <span>{state.cats}/{state.maxCats}</span>
      </div>
    </div>
  )
}

type DmgFloat = { id: number; val: number }

function CombatPanel({ state, onToggle, onHeal }: { state: GameState; onToggle: () => void; onHeal: () => void }) {
  const { enemy, zone, kills, cats, catHealth, catMaxHealth, fighting } = state
  const [flash, setFlash]     = useState(false)
  const [damages, setDamages] = useState<DmgFloat[]>([])
  const dmgId = useRef(0)
  const zoneName  = ZONE_NAMES[Math.min(zone, ZONE_NAMES.length - 1)]
  const zoneImg   = `/zones/zone-${Math.min(zone, ZONE_NAMES.length - 1)}.png`
  const enemyImg  = enemy ? `/sprites/enemies/${encodeURIComponent(enemy.sprite ?? 'enemy')}.png` : null
  const hpPct     = enemy ? Math.max(0, (enemy.hp / enemy.maxHp) * 100) : 0
  const catHpPct  = catMaxHealth > 0 ? (catHealth / catMaxHealth) * 100 : 100
  const canHeal   = catHealth < catMaxHealth && state.resources.fish >= 10

  useEffect(() => {
    if (!state.lastHitDamage) return
    setFlash(true)
    setTimeout(() => setFlash(false), 200)
    const id = ++dmgId.current
    setDamages(d => [...d, { id, val: state.lastHitDamage }])
    setTimeout(() => setDamages(d => d.filter(x => x.id !== id)), 800)
  }, [state.hitTick])

  return (
    <div style={g.panel}>
      {/* Zone banner */}
      <img
        src={zoneImg}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        style={{ width: '100%', borderRadius: 8, display: 'block', objectFit: 'cover', height: 120 }}
      />

      {/* Enemy arena */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        {enemy ? (
          <>
            <div style={{ position: 'relative' }}>
              <img
                src={enemyImg ?? ''}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                style={{ width: '100%', height: 200, objectFit: 'contain', display: 'block', background: 'white' }}
              />
              {flash && (
                <img
                  src="/sprites/hit.png"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', height: 80, width: 'auto', imageRendering: 'pixelated', pointerEvents: 'none' }}
                />
              )}
              {damages.map(d => (
                <div key={d.id} style={{ position: 'absolute', top: '30%', left: `${30 + Math.random() * 40}%`, fontWeight: 'bold', fontSize: 18, color: '#ef4444', pointerEvents: 'none', animation: 'floatDmg 0.8s ease-out forwards', fontFamily: "'MyFont', monospace" }}>
                  -{d.val}
                </div>
              ))}
            </div>
            <div style={{ padding: '10px 14px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#333', marginBottom: 6 }}>
                <span style={{ fontWeight: 'bold', color: enemy.isBoss ? '#ef4444' : '#333' }}>{enemy.name}</span>
                <span style={{ color: '#ef4444' }}>{fmt(Math.max(0, enemy.hp))}/{fmt(enemy.maxHp)} HP</span>
              </div>
              <div style={g.hpTrack}>
                <div style={{ ...g.hpFill, width: `${hpPct}%`, background: '#ef4444' }} />
              </div>
            </div>
          </>
        ) : (
          <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 12, color: '#333' }}>{fighting ? 'Spawning...' : 'Not exploring'}</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 'bold', color: '#111' }}>⚔️ {zoneName}</span>
        <span style={{ fontSize: 11, color: '#666' }}>Zone {zone + 1} · {kills} kills</span>
      </div>

      {cats > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#666' }}>
            <span>🐱 Cat HP {fmt(catHealth)}/{fmt(catMaxHealth)}</span>
            <button
              style={{ fontSize: 11, padding: '2px 8px', border: '1.5px solid #111', borderRadius: 6, background: 'white', color: '#111', cursor: canHeal ? 'pointer' : 'default', opacity: canHeal ? 1 : 0.35 }}
              disabled={!canHeal}
              onClick={() => onHeal()}
            >🩹 Heal (10🐟)</button>
          </div>
          <div style={g.hpTrack}>
            <div style={{ ...g.hpFill, width: `${catHpPct}%`, background: '#111' }} />
          </div>
        </div>
      )}

      <button
        style={{ ...g.actionBtn, background: fighting ? '#666' : '#111' }}
        onClick={onToggle}
      >
        {fighting ? '⏸ Pause' : '▶ Explore'}
      </button>
    </div>
  )
}

function ProdBar({ rate, speed }: { rate: number; speed: number }) {
  const [tick, setTick] = useState(0)
  const effective = rate * speed
  useEffect(() => {
    if (effective <= 0) return
    const ms = Math.max(200, 1000 / effective)
    const id = setInterval(() => setTick(t => (t + 1) % 100), ms / 100)
    return () => clearInterval(id)
  }, [effective])
  if (effective <= 0) return null
  return (
    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ fontSize: 10, color: '#444' }}>+{effective.toFixed(1)}/s</div>
      <div style={{ background: '#ddd', borderRadius: 4, height: 8, overflow: 'hidden', width: '100%' }}>
        <div style={{ width: `${tick}%`, height: '100%', background: '#111', borderRadius: 4, transition: 'width 0.05s linear' }} />
      </div>
    </div>
  )
}

function BuildingsPanel({ state, onBuy }: { state: GameState; onBuy: (id: string) => void }) {
  const speed    = 1 + state.upgrades.speed * 0.5
  const unlocked = state.buildings.filter(b => {
    if (!b.unlockAt) return true
    const r = state.resources
    return (!b.unlockAt.fish     || r.fish     >= b.unlockAt.fish)
        && (!b.unlockAt.moondust || r.moondust >= b.unlockAt.moondust)
        && (!b.unlockAt.clank    || r.clank    >= b.unlockAt.clank)
  })

  return (
    <div style={g.panel}>
      <div style={g.panelHeader}>🏗️ Buildings</div>
      {unlocked.map(b => {
        const cost       = buildingCost(b)
        const affordable = canAfford(state.resources, cost)
        const prodRate   = b.count > 0 ? Object.values(b.prod).reduce((s, v) => s + (v ?? 0), 0) * b.count : 0

        // ETA: seconds until affordable based on current production rates
        const res = state.resources
        const rates = { fish: 0, moondust: 0, clank: 0 }
        for (const ob of state.buildings) {
          for (const [r, v] of Object.entries(ob.prod) as [keyof typeof rates, number][]) {
            rates[r] += v * ob.count * speed
          }
        }
        const etaSecs = !affordable ? Math.max(
          cost.fish     > res.fish     && rates.fish     > 0 ? (cost.fish     - res.fish)     / rates.fish     : 0,
          cost.moondust > res.moondust && rates.moondust > 0 ? (cost.moondust - res.moondust) / rates.moondust : 0,
          cost.clank    > res.clank    && rates.clank    > 0 ? (cost.clank    - res.clank)    / rates.clank    : 0,
        ) : 0
        const etaLabel = !affordable && etaSecs > 0
          ? etaSecs < 60 ? `~${Math.ceil(etaSecs)}s` : `~${Math.ceil(etaSecs / 60)}m`
          : null

        return (
          <button
            key={b.id}
            style={{ ...g.buildingRow, opacity: affordable ? 1 : 0.5 }}
            onClick={() => onBuy(b.id)}
            disabled={!affordable}
          >
            <div style={{ flex: 1, textAlign: 'left' as const }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>{b.emoji}</span>
                <div>
                  <div style={{ fontSize: 13, color: '#333' }}>{b.name} <span style={{ color: '#666' }}>×{b.count}</span></div>
                  <div style={{ fontSize: 11, color: '#666' }}>{b.desc}</div>
                </div>
              </div>
              {b.count > 0 && <ProdBar rate={prodRate} speed={speed} />}
            </div>
            <div style={{ textAlign: 'right' as const, fontSize: 11, flexShrink: 0, marginLeft: 10 }}>
              {cost.fish     > 0 && <div>🐟 {fmt(cost.fish)}</div>}
              {cost.moondust > 0 && <div>🌙 {fmt(cost.moondust)}</div>}
              {cost.clank    > 0 && <div>⚡ {fmt(cost.clank)}</div>}
              {etaLabel && <div style={{ color: '#111', marginTop: 4 }}>{etaLabel}</div>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function UpgradesPanel({ state, onBuy }: { state: GameState; onBuy: (id: string) => void }) {
  const unlocked = UPGRADES.filter(u => {
    const r = state.resources
    const c = u.cost
    return r.fish >= c.fish * 0.3 || r.moondust >= c.moondust * 0.3 || r.clank >= c.clank * 0.3
  })
  if (!unlocked.length) return null

  return (
    <div style={g.panel}>
      <div style={g.panelHeader}>🔬 Upgrades</div>
      {unlocked.map(u => {
        const affordable = canAfford(state.resources, u.cost as any)
        const level      = state.upgrades[u.id as 'claws' | 'armor' | 'speed']
        return (
          <button
            key={u.id}
            style={{ ...g.buildingRow, opacity: affordable ? 1 : 0.5 }}
            onClick={() => onBuy(u.id)}
            disabled={!affordable}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>{u.emoji}</span>
              <div style={{ textAlign: 'left' as const }}>
                <div style={{ fontSize: 13, color: '#333' }}>{u.name} <span style={{ color: '#111' }}>Lv{level}</span></div>
                <div style={{ fontSize: 11, color: '#666' }}>{u.desc}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' as const, fontSize: 11, flexShrink: 0 }}>
              {u.cost.fish     > 0 && <div>🐟 {fmt(u.cost.fish)}</div>}
              {u.cost.moondust > 0 && <div>🌙 {fmt(u.cost.moondust)}</div>}
              {u.cost.clank    > 0 && <div>⚡ {fmt(u.cost.clank)}</div>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function KillFeed({ killLog }: { killLog: string[] }) {
  if (!killLog.length) return null
  return (
    <div style={{ ...g.panel, gap: 4, padding: '8px 14px' }}>
      {killLog.map((entry, i) => (
        <div key={i} style={{ fontSize: 11, color: '#333', opacity: 1 - i * 0.18 }}>{entry}</div>
      ))}
    </div>
  )
}

type ShareMoment = { type: 'zone'; zone: number; zoneName: string; kills: number } | { type: 'boss'; name: string; kills: number; zone: number }

function ShareMomentModal({ moment, state, onClose }: { moment: ShareMoment; state: GameState; onClose: () => void }) {
  const score   = state.kills * 10 + state.zone * 100
  const heading = moment.type === 'zone'
    ? `🎉 Zone ${moment.zone + 1}: ${moment.zoneName} unlocked!`
    : `💀 BOSS defeated!`
  const castText = `Zone ${state.zone + 1}: ${ZONE_NAMES[Math.min(state.zone, ZONE_NAMES.length - 1)]} · ${state.kills} kills · ${score}pts #IdleClank $CLKCAT\nCome play 👉 https://ccat-viewer.vercel.app/game`
  const url = `https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}`

  useEffect(() => {
    const t = setTimeout(onClose, 10_000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'white', border: '2.5px solid #111', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 'bold', color: '#111', textAlign: 'center' as const }}>{heading}</div>
        <textarea
          readOnly
          value={castText}
          style={{ fontSize: 12, color: '#333', background: '#f5f5f0', border: '1.5px solid #111', borderRadius: 8, padding: '8px 10px', resize: 'none', height: 80, fontFamily: "'MyFont', monospace" }}
        />
        <button style={{ ...g.actionBtn, background: '#111', color: 'white' }} onClick={() => { sdk.actions.openUrl(url); onClose() }}>
          ↗ Cast to Warpcast
        </button>
        <button style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 12, textAlign: 'center' as const }} onClick={onClose}>skip</button>
      </div>
    </div>
  )
}

type LeaderEntry = { fid: number; username: string; pfp: string; zone: number; kills: number; score: number; castHash: string }

function LeaderboardPanel() {
  const [entries, setEntries] = useState<LeaderEntry[] | null>(null)

  useEffect(() => {
    fetch('/api/leaderboard').then(r => r.json()).then(setEntries).catch(() => setEntries([]))
  }, [])

  return (
    <div style={g.panel}>
      <div style={g.panelHeader}>🏆 Season 1 Leaderboard</div>
      {entries === null && <div style={{ fontSize: 12, color: '#666', textAlign: 'center' as const }}>Loading…</div>}
      {entries?.length === 0 && (
        <div style={{ fontSize: 12, color: '#666', textAlign: 'center' as const }}>
          No entries yet — be the first to cast your score with #IdleClank!
        </div>
      )}
      {entries?.map((e, i) => (
        <div key={e.fid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < entries.length - 1 ? '1px solid #eee' : 'none' }}>
          <span style={{ fontSize: 12, color: '#aaa', width: 18, flexShrink: 0 }}>#{i + 1}</span>
          {e.pfp && <img src={e.pfp} alt="" style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #111', flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 'bold', color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>@{e.username}</div>
            <div style={{ fontSize: 10, color: '#666' }}>Zone {e.zone} · {e.kills} kills</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 'bold', color: '#111', flexShrink: 0 }}>{e.score}pts</div>
        </div>
      ))}
    </div>
  )
}

type Tab = 'home' | 'rules' | 'share' | 'token'

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { id: Tab; label: string; svg: string }[] = [
    { id: 'home',  label: 'Home',  svg: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { id: 'rules', label: 'Rules', svg: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
    { id: 'share', label: 'Share', svg: 'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z' },
    { id: 'token', label: 'Token', svg: 'M13 10V3L4 14h7v7l9-11h-7z' },
  ]
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #e5e5e0', display: 'flex', zIndex: 40, maxWidth: 480, margin: '0 auto', boxShadow: '0 -1px 8px rgba(0,0,0,0.06)' }}>
      {items.map(item => (
        <button key={item.id} onClick={() => setTab(item.id)}
          style={{ flex: 1, padding: '8px 0 10px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={tab === item.id ? '#111' : '#aaa'} strokeWidth={tab === item.id ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d={item.svg} />
          </svg>
          <span style={{ fontSize: 10, color: tab === item.id ? '#111' : '#aaa', fontWeight: tab === item.id ? 'bold' : 'normal', fontFamily: "'MyFont', monospace" }}>{item.label}</span>
        </button>
      ))}
    </div>
  )
}

function RulesPanel() {
  const rules = [
    ['⚡', 'Tap CLANK! to earn Clank — the base resource'],
    ['📡', 'Buy The Feed (5⚡) to passively generate 🐟 Fish'],
    ['🪤', 'Spend Fish to recruit cats with Cat Recruit'],
    ['⚔️', 'Press Explore to send cats into combat'],
    ['💀', 'Defeat 10 enemies to advance to the next zone'],
    ['⚠️', 'Every 10th enemy is a BOSS — 3× HP, big moondust drop'],
    ['🩹', 'Heal your cats for 10🐟 when their HP drops'],
    ['🔬', 'Upgrades unlock after reaching Zone 2 (The Feed)'],
    ['🎮', 'Mini-games appear every 10–30 min — tap all the fish!'],
    ['⚡', 'Auto-Run lets the game play while you\'re away'],
  ]
  return (
    <div style={g.panel}>
      <div style={g.panelHeader}>📖 How to Play</div>
      {rules.map(([icon, text], i) => (
        <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12, color: '#333', alignItems: 'flex-start' }}>
          <span style={{ flexShrink: 0 }}>{icon}</span>
          <span>{text}</span>
        </div>
      ))}
    </div>
  )
}

function SharePanel({ state }: { state: GameState }) {
  const zoneName = ZONE_NAMES[Math.min(state.zone, ZONE_NAMES.length - 1)]
  const text = `Zone ${state.zone + 1}: ${zoneName} · ${state.kills} kills · ${fmt(state.resources.fish)}🐟 · ${fmt(state.resources.clank)}⚡\nPlaying Idle Clank on ClankerCats $CLKCAT`
  const url = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=https://ccat-viewer.vercel.app/game`
  return (
    <div style={g.panel}>
      <div style={g.panelHeader}>↗ Share Your Progress</div>
      <div style={{ background: '#f5f5f0', border: '1.5px solid #111', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#333', lineHeight: 1.6 }}>
        {text}
      </div>
      <button style={{ ...g.actionBtn, background: '#111', color: 'white' }} onClick={() => sdk.actions.openUrl(url)}>
        Cast to Warpcast ↗
      </button>
    </div>
  )
}

const MINI_GAME_ABI = [
  { name: 'claimMiniReward', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'miniRewardCooldownRemaining', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

export default function GamePage() {
  const [state, setState]     = useState<GameState | null>(null)
  const [showMini, setShowMini] = useState(false)
  const [debug, setDebug]     = useState(false)
  const [titleTaps, setTitleTaps] = useState(0)
  const [clankPops, setClankPops] = useState<{ id: number; x: number; y: number }[]>([])
  const [offlineMsg, setOfflineMsg] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('home')
  const [shareMoment, setShareMoment] = useState<ShareMoment | null>(null)
  const prevZoneRef    = useRef(0)
  const prevKillLogRef = useRef<string[]>([])
  const stateRef              = useRef<GameState | null>(null)
  const lastTickRef           = useRef<number>(Date.now())
  const nextMiniAt            = useRef<number>(Date.now() + (10 + Math.random() * 20) * 60_000)
  const popIdRef              = useRef(0)
  const { address }           = useAccount()

  function tapTitle() {
    const next = titleTaps + 1
    setTitleTaps(next)
    if (next >= 5) { setDebug(d => !d); setTitleTaps(0) }
  }

  const { writeContract: claimMini } = useWriteContract()

  useEffect(() => {
    const s = loadGame()
    setState(s)
    stateRef.current = s
    const awayMs = Date.now() - s.lastTick
    if (awayMs > 60_000) {
      const mins = Math.floor(awayMs / 60_000)
      setOfflineMsg(`Welcome back! ${mins}m of progress earned.`)
      setTimeout(() => setOfflineMsg(null), 4000)
    }

    const interval = setInterval(() => {
      const now = Date.now()
      const dt  = now - lastTickRef.current
      lastTickRef.current = now
      stateRef.current = tick(stateRef.current!, dt)
      setState({ ...stateRef.current })

      // Milestone: zone advance
      if (stateRef.current.zone > prevZoneRef.current) {
        const z = stateRef.current.zone
        setShareMoment({ type: 'zone', zone: z, zoneName: ZONE_NAMES[Math.min(z, ZONE_NAMES.length - 1)], kills: stateRef.current.kills })
        prevZoneRef.current = z
      }
      // Milestone: boss kill
      const newLog = stateRef.current.killLog
      if (newLog[0]?.startsWith('⚠️') && newLog[0] !== prevKillLogRef.current[0]) {
        setShareMoment({ type: 'boss', name: newLog[0], kills: stateRef.current.kills, zone: stateRef.current.zone })
      }
      prevKillLogRef.current = newLog

      // Trigger mini-game on a random 10-30 min timer
      if (Date.now() >= nextMiniAt.current) {
        nextMiniAt.current = Date.now() + (10 + Math.random() * 20) * 60_000
        setShowMini(true)
      }
    }, TICK_MS)

    const save = setInterval(() => {
      if (stateRef.current) saveGame(stateRef.current)
    }, 5000)

    return () => { clearInterval(interval); clearInterval(save) }
  }, [])

  function update(fn: (s: GameState) => GameState) {
    stateRef.current = fn(stateRef.current!)
    setState({ ...stateRef.current })
  }

  function toggleFight() {
    update(s => ({ ...s, fighting: !s.fighting, enemy: s.fighting ? null : s.enemy }))
  }

  function onMiniWin() {
    update(s => ({ ...s, resources: { ...s.resources, fish: s.resources.fish + 50, clank: s.resources.clank + 20 } }))
  }

  if (!state) return null

  return (
    <div style={g.root}>
      {showMini && <MiniGame onWin={onMiniWin} onClose={() => setShowMini(false)} />}
      {shareMoment && <ShareMomentModal moment={shareMoment} state={state} onClose={() => setShareMoment(null)} />}

      {/* Always-visible header + status */}
      <div style={g.header}>
        <a href="/" style={g.backLink}>← Cats</a>
        <span style={g.title} onClick={tapTitle}>🐱 Idle Clank</span>
        <span style={{ fontSize: 11, color: '#666' }}>Zone {state.zone + 1}</span>
      </div>
      {offlineMsg && (
        <div style={{ background: '#111', color: 'white', borderRadius: 8, padding: '8px 14px', fontSize: 12, textAlign: 'center' as const }}>
          ⏰ {offlineMsg}
        </div>
      )}
      <ResourceBar state={state} />

      {/* Tab content */}
      {tab === 'home' && <>
        {clankPops.map(p => (
          <div key={p.id} style={{ position: 'fixed', left: p.x, top: p.y, transform: 'translate(-50%, -50%)', pointerEvents: 'none', fontWeight: 'bold', fontSize: 15, color: '#111', animation: 'floatDmg 0.7s ease-out forwards', fontFamily: "'MyFont', monospace", zIndex: 50 }}>+1</div>
        ))}
        <button
          style={g.clickBtn}
          onClick={e => {
            update(s => ({ ...s, resources: { ...s.resources, clank: s.resources.clank + 1 + s.upgrades.speed } }))
            const id = ++popIdRef.current
            setClankPops(p => [...p, { id, x: e.clientX, y: e.clientY }])
            setTimeout(() => setClankPops(p => p.filter(x => x.id !== id)), 700)
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#111', letterSpacing: 3 }}>CLANK!</div>
          <div style={{ fontSize: 10, color: '#999', letterSpacing: 1 }}>tap to earn ⚡</div>
        </button>
        <CombatPanel state={state} onToggle={toggleFight} onHeal={() => update(s => s.resources.fish >= 10 ? { ...s, resources: { ...s.resources, fish: s.resources.fish - 10 }, catHealth: s.catMaxHealth } : s)} />
        <KillFeed killLog={state.killLog} />
        <BuildingsPanel state={state} onBuy={id => update(s => buyBuilding(s, id))} />
        {state.zone >= 1 && <UpgradesPanel state={state} onBuy={id => update(s => buyUpgrade(s, id as any))} />}
        {debug && (
          <div style={{ background: 'white', border: '1.5px solid #ef4444', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 'bold' }}>🛠 DEBUG MODE</div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
              <button style={g.dbgBtn} onClick={() => setShowMini(true)}>🎮 Trigger Mini-Game</button>
              <button style={g.dbgBtn} onClick={() => { nextMiniAt.current = Date.now() }}>⏱ Reset Timer</button>
              <button style={g.dbgBtn} onClick={() => update(s => ({ ...s, resources: { fish: s.resources.fish + 1000, moondust: s.resources.moondust + 500, clank: s.resources.clank + 200 } }))}>+Resources</button>
              <button style={g.dbgBtn} onClick={() => update(s => ({ ...s, kills: s.kills + 25 }))}>+25 Kills</button>
              <button style={g.dbgBtn} onClick={() => update(s => ({ ...s, cats: Math.min(s.cats + 1, s.maxCats) }))}>+Cat</button>
              <button style={g.dbgBtn} onClick={() => { localStorage.removeItem('ccat-idle'); window.location.reload() }}>🗑 Reset Save</button>
            </div>
            <div style={{ fontSize: 10, color: '#333' }}>
              kills: {state.kills} · zone: {state.zone} · next mini: {Math.max(0, Math.round((nextMiniAt.current - Date.now()) / 1000))}s
            </div>
          </div>
        )}
      </>}

      {tab === 'rules' && <RulesPanel />}
      {tab === 'share' && <SharePanel state={state} />}
      {tab === 'token' && <>
        <LeaderboardPanel />
      </>}

      <BottomNav tab={tab} setTab={setTab} />
    </div>
  )
}

const g: Record<string, React.CSSProperties> = {
  root:        { padding: '14px 16px 88px', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10, minHeight: '100vh', background: '#f0efe9', color: '#111', fontFamily: "'MyFont', monospace" },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 2 },
  backLink:    { fontSize: 12, color: '#888', textDecoration: 'none', letterSpacing: 0.3 },
  title:       { fontSize: 17, fontWeight: 'bold', color: '#111', cursor: 'pointer', letterSpacing: 0.5 },
  resBar:      { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 7 },
  resItem:     { display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'white', borderRadius: 12, padding: '8px 4px', gap: 2, fontSize: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #e5e5e0' },
  resEmoji:    { fontSize: 18 },
  clickBtn:    { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 14px', background: 'white', border: '1px solid #e5e5e0', borderRadius: 16, cursor: 'pointer', gap: 4, boxShadow: '0 2px 6px rgba(0,0,0,0.08)' },
  panel:       { background: 'white', border: '1px solid #e5e5e0', borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 11, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  panelHeader: { fontSize: 13, fontWeight: 'bold', color: '#111', display: 'flex', justifyContent: 'space-between', letterSpacing: 0.3 },
  buildingRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f7f6f1', border: '1px solid #e5e5e0', borderRadius: 10, padding: '11px 13px', cursor: 'pointer', width: '100%', color: '#111' },
  actionBtn:   { padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 'bold', color: 'white', background: '#111', letterSpacing: 0.5 },
  hpTrack:     { background: '#ebebeb', borderRadius: 99, height: 7, overflow: 'hidden' },
  hpFill:      { height: '100%', borderRadius: 99 },
  dbgBtn:      { padding: '6px 10px', background: 'white', border: '1.5px solid #ef4444', borderRadius: 8, color: '#ef4444', cursor: 'pointer', fontSize: 11 },
}
