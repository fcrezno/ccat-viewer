// ClankerCats Idle — Trimps-style engine

export type Resources = { fish: number; moondust: number; clank: number }

export type Building = {
  id:   string
  name: string
  desc: string
  emoji: string
  count: number
  baseCost: Resources
  prod: Partial<Resources>   // per second per building
  unlockAt?: Partial<Resources>
}

export type Enemy = { name: string; emoji: string; hp: number; maxHp: number; attack: number; sprite?: string; isBoss?: boolean }

export type GameState = {
  resources:   Resources
  buildings:   Building[]
  cats:        number
  maxCats:     number
  catAttack:   number   // base attack per cat
  catHealth:   number   // base health per cat (current)
  catMaxHealth:number
  upgrades:    { claws: number; armor: number; speed: number }
  zone:        number
  enemy:       Enemy | null
  fighting:    boolean
  kills:       number
  portals:     number
  killLog:     string[]
  attackClock:    number
  lastHitDamage:  number
  hitTick:        number
  lastTick:       number
}

export const MAX_ZONE = 0  // unlock more zones as content is added

export const ZONE_NAMES = [
  'The Lake', 'The Feed', 'The Channels',
  'The Memes', 'Purple Territory', 'The Void',
]

const ENEMY_POOLS: { name: string; emoji: string; sprite?: string }[][] = [
  [
    { name: 'Mr. Fish',          emoji: '🐟', sprite: 'MrFish' },
    { name: 'Slime',             emoji: '🟢', sprite: 'Slime' },
    { name: 'Cool Rat',          emoji: '🐀', sprite: 'cool rat' },
    { name: 'Duck with a Knife', emoji: '🦆', sprite: 'duck with a knife' },
    { name: 'Big Frog',          emoji: '🐸', sprite: 'big frog' },
  ],
  [{ name: 'Reply Guy',  emoji: '💬', sprite: 'cool rat'          }, { name: 'Shill Bot', emoji: '🤖', sprite: 'Slime'              }, { name: 'Normie',    emoji: '🧑', sprite: 'MrFish'             }],
  [{ name: 'Whale',      emoji: '🐋', sprite: 'big frog'          }, { name: 'Degen',     emoji: '🎰', sprite: 'duck with a knife'  }],
  [{ name: 'Short',      emoji: '📉', sprite: 'cool rat'          }, { name: 'Ponzi',     emoji: '🌀', sprite: 'Slime'              }],
  [{ name: 'SEC Agent',  emoji: '👮', sprite: 'MrFish'            }, { name: 'Lawyer',    emoji: '⚖️', sprite: 'big frog'           }],
  [{ name: 'BlackHole',  emoji: '🕳️', sprite: 'duck with a knife' }, { name: 'Void Cat',  emoji: '👾', sprite: 'Slime'              }],
]

const BASE_BUILDINGS: Omit<Building, 'count'>[] = [
  {
    id: 'fish_tank',  name: 'The Feed',    emoji: '📡', desc: 'Generates fish from the cast stream',
    baseCost: { fish: 0,   moondust: 0,  clank: 10 },
    prod:     { fish: 0.35 },
    unlockAt: { clank: 5 },
  },
  {
    id: 'cat_trap',   name: 'Cat Recruit', emoji: '🪤', desc: 'Recruit a cat using fish',
    baseCost: { fish: 50,  moondust: 0,  clank: 0  },
    prod:     {},
    unlockAt: { fish: 10 },
  },
  {
    id: 'moon_base',  name: 'The Hub',     emoji: '🌙', desc: '+5 max cats, generates MoonDust',
    baseCost: { fish: 0,   moondust: 0,  clank: 20 },
    prod:     { moondust: 0.14 },
    unlockAt: { clank: 15 },
  },
  {
    id: 'clank_mine', name: 'Clank Bot',   emoji: '⚡', desc: 'Auto-generates Clank',
    baseCost: { fish: 0,   moondust: 20, clank: 0  },
    prod:     { clank: 0.07 },
    unlockAt: { moondust: 10 },
  },
  {
    id: 'laser_forge',name: 'Purr Laser',  emoji: '🔫', desc: 'Boosts cat attack',
    baseCost: { fish: 0,   moondust: 50, clank: 0  },
    prod:     {},
    unlockAt: { moondust: 40 },
  },
  {
    id: 'shield_gen', name: 'Shield Gen',  emoji: '🛡️', desc: 'Boosts cat armor',
    baseCost: { fish: 0,   moondust: 0,  clank: 10 },
    prod:     {},
    unlockAt: { clank: 5 },
  },
]

export const UPGRADES = [
  { id: 'claws',  name: 'Claws',  emoji: '🗡️',  desc: '+50% cat attack',  cost: { fish: 0, moondust: 30, clank: 0  } },
  { id: 'armor',  name: 'Armor',  emoji: '🛡️',  desc: '+50% cat health',  cost: { fish: 0, moondust: 0,  clank: 5  } },
  { id: 'speed',  name: 'Speed',  emoji: '⚡',   desc: '+50% resource rate',cost: { fish: 0, moondust: 10, clank: 0  } },
]

export function defaultState(): GameState {
  return {
    resources:    { fish: 0, moondust: 0, clank: 0 },
    buildings:    BASE_BUILDINGS.map(b => ({ ...b, count: 0 })),
    cats:         1,
    maxCats:      5,
    catAttack:    2,
    catHealth:    10,
    catMaxHealth: 10,
    upgrades:     { claws: 0, armor: 0, speed: 0 },
    zone:         0,
    enemy:        null,
    fighting:     false,
    kills:        0,
    portals:      0,
    killLog:      [],
    attackClock:   0,
    lastHitDamage: 0,
    hitTick:       0,
    lastTick:      Date.now(),
  }
}

export function loadGame(key = 'ccat-idle'): GameState {
  if (typeof window === 'undefined') return defaultState()
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaultState()
    const saved = JSON.parse(raw) as GameState
    // Migration: old economy used fish as base resource — incompatible, reset
    if (saved.resources.fish > 50 && saved.resources.clank === 0) return defaultState()
    const def = defaultState()
    return {
      ...def, ...saved,
      buildings: def.buildings.map(b => {
        const found = saved.buildings?.find(sb => sb.id === b.id)
        return found ? { ...b, count: found.count } : b
      }),
    }
  } catch { return defaultState() }
}

export function saveGame(state: GameState, key = 'ccat-idle') {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify({ ...state, lastTick: Date.now() }))
}

export function buildingCost(b: Building): Resources {
  const mult = Math.pow(1.15, b.count)
  return {
    fish:     Math.floor(b.baseCost.fish     * mult),
    moondust: Math.floor(b.baseCost.moondust * mult),
    clank:    Math.floor(b.baseCost.clank    * mult),
  }
}

export function canAfford(res: Resources, cost: Resources): boolean {
  return res.fish >= cost.fish && res.moondust >= cost.moondust && res.clank >= cost.clank
}

export function subtract(res: Resources, cost: Resources): Resources {
  return { fish: res.fish - cost.fish, moondust: res.moondust - cost.moondust, clank: res.clank - cost.clank }
}

function spawnEnemy(zone: number, kills: number): Enemy {
  const pool   = ENEMY_POOLS[Math.min(zone, ENEMY_POOLS.length - 1)]
  const pick   = pool[kills % pool.length]
  const isBoss = kills % 10 === 9
  const hp     = Math.floor(10 * Math.pow(1.3, zone) * (1 + kills * 0.05) * (isBoss ? 3 : 1))
  const atk    = Math.floor(1  * Math.pow(1.2, zone) * (1 + kills * 0.02) * (isBoss ? 2 : 1))
  const name   = isBoss ? `⚠️ BOSS: ${pick.name}` : pick.name
  return { ...pick, name, hp, maxHp: hp, attack: atk, isBoss }
}

export function tick(state: GameState, dtMs: number): GameState {
  const s     = structuredClone(state)
  const dt    = Math.min(dtMs / 1000, 14400)  // seconds, cap at 4 hours offline
  const speed = 1 + s.upgrades.speed * 0.5

  // Resource production
  for (const b of s.buildings) {
    if (!b.prod) continue
    for (const [r, rate] of Object.entries(b.prod) as [keyof Resources, number][]) {
      s.resources[r] += rate * b.count * dt * speed
    }
  }

  // Spawn enemy if fighting and no enemy
  if (s.fighting && !s.enemy) {
    s.enemy = spawnEnemy(s.zone, s.kills)
  }

  // Combat — discrete hits every 1.5s
  const ATTACK_INTERVAL = 1.5
  s.lastHitDamage = 0
  if (s.fighting && s.cats > 0) {
    s.attackClock += dt
    while (s.attackClock >= ATTACK_INTERVAL && s.enemy && s.cats > 0) {
      s.attackClock -= ATTACK_INTERVAL

      const catAtk   = s.catAttack * s.cats * (1 + s.upgrades.claws * 0.5) * ATTACK_INTERVAL
      s.enemy.hp    -= catAtk
      s.lastHitDamage += Math.round(catAtk)

      const enemyAtk = s.enemy.attack * ATTACK_INTERVAL
      s.catHealth   -= enemyAtk

      if (s.catHealth <= 0) {
        s.cats      = Math.max(0, s.cats - 1)
        s.catHealth = s.catMaxHealth
        s.enemy     = null
      }

      if (s.enemy && s.enemy.hp <= 0) {
        const defeated = s.enemy
        s.kills++
        s.resources.fish     += s.zone + 1
        s.resources.moondust += defeated.isBoss ? (s.zone + 1) * 3 : s.zone * 0.5
        s.killLog = [`${defeated.emoji} ${defeated.name} defeated`, ...s.killLog].slice(0, 5)
        s.enemy = null
        if (s.kills % 10 === 0 && s.zone < MAX_ZONE) s.zone++
      }
    }
    if (s.lastHitDamage > 0) s.hitTick = (s.hitTick + 1) % 10000
  }

  return s
}

export function buyBuilding(state: GameState, id: string): GameState {
  const s = structuredClone(state)
  const b = s.buildings.find(b => b.id === id)
  if (!b) return s
  const cost = buildingCost(b)
  if (!canAfford(s.resources, cost)) return s
  s.resources = subtract(s.resources, cost)

  if (id === 'cat_trap') {
    if (s.cats < s.maxCats) s.cats++
    b.count++
  } else if (id === 'moon_base') {
    s.maxCats += 5
    b.count++
  } else if (id === 'laser_forge') {
    s.catAttack = Math.round(s.catAttack * 1.5 * 10) / 10
    b.count++
  } else if (id === 'shield_gen') {
    s.catMaxHealth = Math.round(s.catMaxHealth * 1.5 * 10) / 10
    s.catHealth    = s.catMaxHealth
    b.count++
  } else {
    b.count++
  }
  return s
}

export function buyUpgrade(state: GameState, id: 'claws' | 'armor' | 'speed'): GameState {
  const s    = structuredClone(state)
  const upg  = UPGRADES.find(u => u.id === id)!
  if (!canAfford(s.resources, upg.cost as Resources)) return s
  s.resources = subtract(s.resources, upg.cost as Resources)
  s.upgrades[id]++
  if (id === 'armor') {
    s.catMaxHealth = Math.round(s.catMaxHealth * 1.5 * 10) / 10
    s.catHealth    = s.catMaxHealth
  }
  return s
}

export function fmt(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return Math.floor(n).toString()
}
