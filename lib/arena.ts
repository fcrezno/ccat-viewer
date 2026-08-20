import { deck, type ScriptLine } from '@/lib/script'

/**
 * A PREVIEW OF THE FIGHT FROM THE MAIN GAME.
 *
 * Your Clanker Cat against a cat made up on the spot, narrated in the game's own
 * words. This is a taster, not the real simulation — it is deliberately its own
 * small thing and shares no code with the s&box build.
 *
 * ── WHAT IS DELIBERATELY MISSING ─────────────────────────────────────────────
 *
 * THERE IS NO TYPE CHART HERE, and that is not an oversight. The real strength
 * and weakness tables live in the main game's `data/combat.json` and are not
 * public. Putting them in this repo would publish them, and running the real
 * simulation in the browser would hand them to anyone who opened dev tools. So
 * every matchup in the preview is neutral and the drama comes from crits and
 * the roll. Type NAMES are fine to show; the tables are not.
 *
 * That is also why this runs on the SERVER (see app/api/fight/route.ts) — the
 * client is handed a finished log, never the machinery that produced it.
 */

/** The eight types, by name only. */
export const TYPES = [
  'ZOOMIES', 'FORGE', 'COOLANT', 'SIGNAL',
  'GLITCH', 'CRYO', 'SCRAP', 'STRAY',
] as const

export type CatType = (typeof TYPES)[number]

export type ArenaCat = {
  /** How the log names it — your cat's name, or #412 for a made-up one. */
  label: string
  type: CatType
  hp: number
  maxHp: number
  atk: number
  def: number
  spd: number
  moves: string[]
  /** True for the player's own cat, so the UI can mark it. */
  mine: boolean
  /**
   * Where to find its face. A real cat points at the collection image; a made-up
   * one points at /api/cat-art, which composes one from the drop's layers.
   */
  art: string
}

export type LogLine = {
  text: string
  kind: 'info' | 'move' | 'miss' | 'crit' | 'weak' | 'perk' | 'ko' | 'win'
  style: string
  /*
   * HEALTH AS IT STOOD WHEN THIS LINE WAS SAID.
   *
   * Without these the page could only draw the cats as they ended up, because the
   * fight is over before the first word appears — so both bars sat at their final
   * value while the log was still on the opening move, and the result was spoiled
   * before it was told. A snapshot per line lets the bars follow the story.
   */
  hpYou: number
  hpFoe: number
  /**
   * Who acted on this line, so the page can lunge and flash the right cat.
   * render.mjs flashes the ATTACKER white on the frame it commits to the swing.
   * Null for lines that are about nobody in particular.
   */
  actor: 'you' | 'foe' | null
}

export type FightResult = {
  seed: number
  turf: string
  you: ArenaCat
  foe: ArenaCat
  log: LogLine[]
  youWon: boolean
  turns: number
}

/**
 * mulberry32 — small, fast, and the same everywhere.
 *
 * SEEDED ON PURPOSE. The server decides the seed, so a fight cannot be re-rolled
 * by refreshing the page, and the same seed always tells the same story.
 */
export function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TURFS = ['the town', 'the temple', 'the caves', 'the mountain', 'the forest']

/** Preview move names. The real move list lives with the main game. */
const MOVES = [
  'Pounce', 'Swipe', 'Headbutt', 'Tail Whip', 'Static Cling',
  'Hairball', 'Loaf', 'Zoom', 'Knock It Off The Table', 'Slow Blink',
]

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]

/** A cat invented on the spot. Endless opponents, none of them anyone's property. */
export function randomCat(r: () => number): ArenaCat {
  const hp = 90 + Math.floor(r() * 50)
  return {
    label: '#' + (100 + Math.floor(r() * 900)),
    type: pick(r, TYPES),
    hp,
    maxHp: hp,
    atk: 45 + Math.floor(r() * 35),
    def: 40 + Math.floor(r() * 35),
    spd: 40 + Math.floor(r() * 45),
    moves: [pick(r, MOVES), pick(r, MOVES)],
    mine: false,
    art: '',
  }
}

/**
 * The player's cat.
 *
 * Its numbers are rolled from its TOKEN ID, so the same cat is the same fighter
 * every time — an owner's cat has a settled identity rather than new stats each
 * visit. The name is whatever the collection calls it.
 */
export function ownedCat(tokenId: string | number, label: string): ArenaCat {
  const r = seeded(Number(tokenId) * 2654435761)
  const hp = 100 + Math.floor(r() * 45)
  return {
    label,
    type: pick(r, TYPES),
    hp,
    maxHp: hp,
    atk: 50 + Math.floor(r() * 35),
    def: 45 + Math.floor(r() * 35),
    spd: 45 + Math.floor(r() * 45),
    moves: [pick(r, MOVES), pick(r, MOVES)],
    mine: true,
    art: '',
  }
}

/** Fill the owner's {cat} tokens. Unknown ones stay visible, as the game does. */
function fill(s: string, vars: Record<string, string>) {
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
}

/** One line from a deck, or a fallback if the deck is empty. */
function say(r: () => number, key: string, vars: Record<string, string>, fallback: string): { text: string; style: string } {
  const lines: ScriptLine[] = deck(key)
  if (!lines.length) return { text: fill(fallback, vars), style: '' }
  const e = lines[Math.floor(r() * lines.length)]
  return { text: fill(e.text, vars), style: e.style }
}

/**
 * Run a fight and return the whole story at once.
 *
 * The log is finished before the page sees it. The UI's job is only to reveal it
 * a line at a time, the way the main game types it out — so the pacing is a
 * presentation choice and nothing can desync.
 */
export function fight(you: ArenaCat, foe: ArenaCat, seed: number): FightResult {
  const r = seeded(seed)
  const log: LogLine[] = []
  // Read the health AT PUSH TIME — both cats are mutated as the fight runs, so
  // this captures the moment rather than the outcome.
  const add = (l: { text: string; style: string }, kind: LogLine['kind'], actor: LogLine['actor'] = null) =>
    log.push({ text: l.text, kind, style: l.style, hpYou: you.hp, hpFoe: foe.hp, actor })

  const turf = pick(r, TURFS)
  add(say(r, 'arena', { turf, cat: you.label }, 'ARENA: {turf}'), 'info')

  let turn = 0
  const order = you.spd >= foe.spd ? [you, foe] : [foe, you]

  while (you.hp > 0 && foe.hp > 0 && turn < 40) {
    for (const atk of order) {
      const def = atk === you ? foe : you
      if (you.hp <= 0 || foe.hp <= 0) break
      turn++

      const who: LogLine['actor'] = atk === you ? 'you' : 'foe'
      const vars = { cat: atk.label, foe: def.label, move: '', n: String(turn) }

      // A cat sometimes thinks better of it.
      if (r() < 0.06) {
        add(say(r, 'hesitate', vars, '{cat} hesitated...'), 'miss', who)
        continue
      }

      const move = pick(r, atk.moves)
      vars.move = move
      add(say(r, 'move', vars, '{cat} used {move}!'), 'move', who)

      if (r() < 0.12) {
        add(say(r, 'miss', { cat: atk.label, foe: def.label }, 'It missed!'), 'miss', who)
        continue
      }

      // Crit scales off Speed, the way the main game does it.
      const crit = r() < Math.min(0.25, atk.spd / 900)
      const base = Math.floor((atk.atk * 22) / Math.max(1, def.def)) + 2
      const hit = Math.max(1, Math.floor(base * (crit ? 2 : 1) * (0.85 + r() * 0.3)))

      def.hp = Math.max(0, def.hp - hit)

      if (crit) add(say(r, 'crit', { cat: def.label, foe: atk.label }, 'A critical hit!'), 'crit', who)

      if (def.hp > 0 && def.hp <= def.maxHp * 0.2 && r() < 0.5)
        add(say(r, 'lowHp', { cat: def.label, foe: atk.label }, '{cat} IS BARELY STANDING!'), 'crit')

      if (def.hp === 0) {
        add(say(r, 'down', { cat: def.label, foe: atk.label }, '{cat} is down!'), 'ko', who)
        break
      }
    }
  }

  const winner = you.hp > 0 ? you : foe
  const loser = winner === you ? foe : you
  add(say(r, 'win', { cat: winner.label, foe: loser.label, n: String(turn) }, '{cat} wins!'), 'win')

  return { seed, turf, you, foe, log, youWon: winner === you, turns: turn }
}
