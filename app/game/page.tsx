'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import {
  loadGame, saveGame, tick, buyBuilding, buyUpgrade,
  buildingCost, canAfford, fmt, ZONE_NAMES, UPGRADES,
  type GameState,
} from '@/lib/game'

const TICK_MS = 250

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
    return <span style={{ fontSize: 9, color: '#7c3aed' }}>+{rate < 1 ? rate.toFixed(1) : fmt(rate)}/s</span>
  }

  return (
    <div style={g.resBar}>
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
        <span style={g.resEmoji}>⚡</span>
        <span>{fmt(clank)}</span>
        <RateLabel rate={rates.clank} />
      </div>
      <div style={g.resItem}>
        <span style={g.resEmoji}>🐱</span>
        <span>{state.cats}/{state.maxCats}</span>
      </div>
    </div>
  )
}

function CombatPanel({ state, onToggle }: { state: GameState; onToggle: () => void }) {
  const { enemy, zone, kills, cats, catHealth, catMaxHealth, fighting } = state
  const [flash, setFlash] = useState(false)
  const zoneName  = ZONE_NAMES[Math.min(zone, ZONE_NAMES.length - 1)]
  const zoneImg   = `/zones/zone-${Math.min(zone, ZONE_NAMES.length - 1)}.png`
  const enemyImg  = enemy ? `/sprites/enemies/${enemy.sprite ?? 'enemy'}.png` : null
  const hpPct     = enemy ? Math.max(0, (enemy.hp / enemy.maxHp) * 100) : 0
  const catHpPct  = catMaxHealth > 0 ? (catHealth / catMaxHealth) * 100 : 100

  const prevHp = useRef(enemy?.hp ?? 0)
  useEffect(() => {
    if (!enemy) return
    if (enemy.hp < prevHp.current) {
      setFlash(true)
      setTimeout(() => setFlash(false), 200)
    }
    prevHp.current = enemy.hp
  }, [enemy?.hp])

  return (
    <div style={g.panel}>
      {/* Zone banner */}
      <img
        src={zoneImg}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        style={{ width: '100%', borderRadius: 8, display: 'block', objectFit: 'cover', height: 120 }}
      />

      {/* Enemy arena */}
      <div style={{ background: '#0d0d1a', borderRadius: 10, minHeight: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px 0 0' }}>
        {enemy ? (
          <>
            <img
              src={enemyImg ?? ''}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              style={{
                height: 140, width: 'auto', imageRendering: 'pixelated',
                transform: flash ? 'scale(1.08)' : 'scale(1)',
                filter: flash ? 'brightness(2)' : 'none',
                transition: 'transform 0.1s ease, filter 0.1s ease',
              }}
            />
            <div style={{ width: '100%', padding: '10px 14px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#ccc', marginBottom: 6 }}>
                <span style={{ fontWeight: 'bold' }}>{enemy.name}</span>
                <span style={{ color: '#ef4444' }}>{fmt(Math.max(0, enemy.hp))}/{fmt(enemy.maxHp)} HP</span>
              </div>
              <div style={g.hpTrack}>
                <div style={{ ...g.hpFill, width: `${hpPct}%`, background: '#ef4444' }} />
              </div>
            </div>
          </>
        ) : (
          <span style={{ fontSize: 12, color: '#333' }}>
            {fighting ? 'Spawning...' : 'Not exploring'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 'bold', color: '#7c3aed' }}>⚔️ {zoneName}</span>
        <span style={{ fontSize: 11, color: '#555' }}>Zone {zone + 1} · {kills} kills</span>
      </div>

      {cats > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#555' }}>
            <span>🐱 Cat HP</span>
            <span>{fmt(catHealth)}/{fmt(catMaxHealth)}</span>
          </div>
          <div style={g.hpTrack}>
            <div style={{ ...g.hpFill, width: `${catHpPct}%`, background: '#7c3aed' }} />
          </div>
        </div>
      )}

      <button
        style={{ ...g.actionBtn, background: fighting ? '#1e1e2e' : '#7c3aed' }}
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
      <div style={{ background: '#1a1a2e', borderRadius: 4, height: 8, overflow: 'hidden', width: '100%' }}>
        <div style={{ width: `${tick}%`, height: '100%', background: '#7c3aed', borderRadius: 4, transition: 'width 0.05s linear' }} />
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
                  <div style={{ fontSize: 13, color: '#ccc' }}>{b.name} <span style={{ color: '#555' }}>×{b.count}</span></div>
                  <div style={{ fontSize: 11, color: '#555' }}>{b.desc}</div>
                </div>
              </div>
              {b.count > 0 && <ProdBar rate={prodRate} speed={speed} />}
            </div>
            <div style={{ textAlign: 'right' as const, fontSize: 11, flexShrink: 0, marginLeft: 10 }}>
              {cost.fish     > 0 && <div>🐟 {fmt(cost.fish)}</div>}
              {cost.moondust > 0 && <div>🌙 {fmt(cost.moondust)}</div>}
              {cost.clank    > 0 && <div>⚡ {fmt(cost.clank)}</div>}
              {etaLabel && <div style={{ color: '#7c3aed', marginTop: 4 }}>{etaLabel}</div>}
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
                <div style={{ fontSize: 13, color: '#ccc' }}>{u.name} <span style={{ color: '#7c3aed' }}>Lv{level}</span></div>
                <div style={{ fontSize: 11, color: '#555' }}>{u.desc}</div>
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

export default function GamePage() {
  const [state, setState]   = useState<GameState | null>(null)
  const stateRef            = useRef<GameState | null>(null)
  const lastTickRef         = useRef<number>(Date.now())

  useEffect(() => {
    const s = loadGame()
    setState(s)
    stateRef.current = s

    const interval = setInterval(() => {
      const now = Date.now()
      const dt  = now - lastTickRef.current
      lastTickRef.current = now
      stateRef.current = tick(stateRef.current!, dt)
      setState({ ...stateRef.current })
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

  if (!state) return null

  return (
    <div style={g.root}>
      <div style={g.header}>
        <a href="/" style={g.backLink}>← Cats</a>
        <span style={g.title}>🐱 Idle Clank</span>
        <span style={{ fontSize: 11, color: '#555' }}>Zone {state.zone + 1}</span>
      </div>

      <ResourceBar state={state} />

      {/* Click to fish */}
      <button style={g.clickBtn} onClick={() => update(s => ({ ...s, resources: { ...s.resources, fish: s.resources.fish + 1 + s.upgrades.speed } }))}>
        <div style={{ fontSize: 36 }}>🐟</div>
        <div style={{ fontSize: 11, color: '#555' }}>tap to fish</div>
      </button>

      <CombatPanel  state={state} onToggle={toggleFight} />
      <BuildingsPanel state={state} onBuy={id => update(s => buyBuilding(s, id))} />
      <UpgradesPanel  state={state} onBuy={id => update(s => buyUpgrade(s, id as any))} />

      <div style={{ fontSize: 10, color: '#222', textAlign: 'center' as const, paddingTop: 8 }}>
        Auto-saves every 5s · Offline progress up to 30s
      </div>
    </div>
  )
}

const g: Record<string, React.CSSProperties> = {
  root:        { padding: '12px 14px 40px', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12, minHeight: '100vh', background: '#0a0a14', color: 'white', fontFamily: 'monospace' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  backLink:    { fontSize: 12, color: '#555', textDecoration: 'none' },
  title:       { fontSize: 16, fontWeight: 'bold', color: '#7c3aed' },
  resBar:      { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 },
  resItem:     { display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#12122a', borderRadius: 8, padding: '6px 4px', gap: 2, fontSize: 12 },
  resEmoji:    { fontSize: 16 },
  clickBtn:    { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px', background: '#12122a', border: '1px solid #1e1e2e', borderRadius: 12, cursor: 'pointer', gap: 4 },
  panel:       { background: '#12122a', border: '1px solid #1a1a2e', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 },
  panelHeader: { fontSize: 13, fontWeight: 'bold', color: '#7c3aed', display: 'flex', justifyContent: 'space-between' },
  buildingRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', width: '100%', color: 'white' },
  actionBtn:   { padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 'bold', color: 'white' },
  hpTrack:     { background: '#1a1a2e', borderRadius: 4, height: 6, overflow: 'hidden' },
  hpFill:      { height: '100%', borderRadius: 4, transition: 'width 0.25s linear' },
}
