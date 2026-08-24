import { deck, type ScriptLine } from '@/lib/script'
import { movesFor } from '@/lib/moves'
import { AWARDS } from '@/lib/score'

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
  /** The move this line names, so the scoring can see what was swung. */
  move?: string
}

/** One line of the results card. */
export type ScoreRow = { name: string; score: number; colour: string }

export type FightResult = {
  seed: number
  turf: string
  you: ArenaCat
  foe: ArenaCat
  log: LogLine[]
  youWon: boolean
  turns: number
  /** What the winner earned, and the number that goes under it. */
  rows: ScoreRow[]
  total: number
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

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]

/*
 * TWO MOVES A CAT CAN ACTUALLY SWING.
 *
 * Drawn from its own TYPE, using the game's real move names — a ZOOMIES cat gets
 * Zoom, Taze and Live Wire rather than something invented for the preview. Only
 * the NAMES came across; power, accuracy and the type chart stayed with the game.
 *
 * Distinct where the type has moves to spare, so a cat does not spend a whole
 * fight swinging the same one twice.
 */
function twoMoves(r: () => number, type: CatType): string[] {
  const pool = movesFor(type)
  if (pool.length < 2) return [pool[0] ?? 'Swipe', pool[0] ?? 'Swipe']
  const first = Math.floor(r() * pool.length)
  let second = Math.floor(r() * (pool.length - 1))
  if (second >= first) second++
  return [pool[first], pool[second]]
}

/*
 * NAMES FOR CATS THAT ARE NOT CLANKER CATS.
 *
 * An invented opponent used to be called "#412", which is the same shape as a
 * real token's name — so a made-up cat read exactly like somebody's property,
 * and the number pointed at a token it had nothing to do with.
 *
 * A cat that belongs to nobody gets a CAT'S NAME instead. It cannot be mistaken
 * for a token, and it says what it is: a stray, not a holding.
 *
 * Ordinary names on purpose. These sit next to real cats in the same log, and a
 * joke name would make the invented ones the loud ones.
 */
const STRAY_NAMES = [
  'Mittens', 'Socks', 'Tabby', 'Smudge', 'Pepper', 'Biscuit', 'Marmalade', 'Nutmeg',
  'Domino', 'Patches', 'Freckles', 'Bandit', 'Clover', 'Pumpkin', 'Sable', 'Ash',
  'Willow', 'Juniper', 'Poppy', 'Hazel', 'Olive', 'Maple', 'Cinder', 'Dusty',
  'Boots', 'Ziggy', 'Pickles', 'Waffles', 'Noodle', 'Dumpling', 'Bean', 'Peanut',
  'Shadow', 'Midnight', 'Storm', 'Comet', 'Rocket', 'Pebble', 'Flint', 'Slate',
  'Ginger', 'Saffron', 'Honey', 'Toffee', 'Custard', 'Muffin', 'Crumpet', 'Scone',
] as const

/** A cat invented on the spot. Endless opponents, none of them anyone's property. */
export function randomCat(r: () => number): ArenaCat {
  const hp = 90 + Math.floor(r() * 50)
  const type = pick(r, TYPES)
  return {
    label: pick(r, STRAY_NAMES),
    type,
    hp,
    maxHp: hp,
    atk: 45 + Math.floor(r() * 35),
    def: 40 + Math.floor(r() * 35),
    spd: 40 + Math.floor(r() * 45),
    moves: twoMoves(r, type),
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
  const type = pick(r, TYPES)
  return {
    label,
    type,
    hp,
    maxHp: hp,
    atk: 50 + Math.floor(r() * 35),
    def: 45 + Math.floor(r() * 35),
    spd: 45 + Math.floor(r() * 45),
    moves: twoMoves(r, type),
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

/*
 * WHAT THE WINNER EARNED — mirroring earned() in the game's score.mjs.
 *
 * The thresholds are HIS and are not re-tuned: they were measured over 120
 * fights rather than guessed, and his own note says the first guesses were badly
 * wrong in both directions. So `quick` is 5 turns, `endurance` is 16, `comeback`
 * is under a quarter health, `minimalist` needs seven swings of one move (one
 * move alone fires in 42% of fights, which is the default rather than
 * discipline), and `overkill` is a finishing blow worth half the loser's bar.
 *
 * THREE AWARDS ARE DELIBERATELY NOT DETECTED, because this preview cannot see
 * what they need, and inventing a substitute would make the number a lie:
 *
 *   secondWind  needs the Endure perk, which the preview does not model
 *   homeTurf    needs a cat to have a home zone; there are none here
 *   closeRange  needs each move's `kind`, and only move NAMES came across
 */
function earned(log: LogLine[], you: ArenaCat, foe: ArenaCat, turns: number): ScoreRow[] {
  const youWon = you.hp > 0
  const win = youWon ? you : foe
  const winSide = youWon ? 'you' : 'foe'
  const loseSide = youWon ? 'foe' : 'you'
  const hpOf = (l: LogLine, side: string) => (side === 'you' ? l.hpYou : l.hpFoe)

  const rows: ScoreRow[] = []
  const add = (key: string, n = 1) => {
    const a = AWARDS[key]
    if (!a || n <= 0) return
    rows.push({
      name: a.per && n > 1 ? `${a.name} x${n}` : a.name,
      score: a.score * (a.per ? n : 1),
      colour: a.colour,
    })
  }

  // Damage is not on a line, but the health snapshots are — a drop between one
  // line and the next IS the blow that landed.
  const blows: { onSide: string; amount: number; at: number }[] = []
  for (let i = 1; i < log.length; i++) {
    for (const side of ['you', 'foe']) {
      const drop = hpOf(log[i - 1], side) - hpOf(log[i], side)
      if (drop > 0) blows.push({ onSide: side, amount: drop, at: i })
    }
  }

  const crits = log.filter(l => l.kind === 'crit' && l.actor === winSide).length
  const dodged = log.filter(l => l.kind === 'miss' && l.actor === loseSide).length
  const swings = log.filter(l => l.kind === 'move' && l.actor === winSide)
  const whiffs = log.filter(l => l.kind === 'miss' && l.actor === winSide).length

  add('win')
  if (win.hp === win.maxHp) add('flawless')
  else if (win.hp / win.maxHp < 0.25) add('comeback')

  if (turns <= 5) add('quick')
  else if (turns >= 16) add('endurance')

  if (swings.length > 2 && whiffs === 0) add('perfectAim')
  add('crit', crits)
  add('dodge', dodged)

  const first = blows[0]
  if (first && first.onSide === loseSide) add('firstBlood')

  const names = new Set(swings.map(l => l.move).filter(Boolean))
  if (swings.length >= 7 && names.size === 1) add('minimalist')

  const onLoser = blows.filter(b => b.onSide === loseSide)
  const last = onLoser[onLoser.length - 1]
  const loser = youWon ? foe : you
  if (last && loser.maxHp && last.amount >= loser.maxHp * 0.5) add('overkill')

  return rows
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
  const add = (
    l: { text: string; style: string },
    kind: LogLine['kind'],
    actor: LogLine['actor'] = null,
    move?: string,
  ) =>
    log.push({ text: l.text, kind, style: l.style, hpYou: you.hp, hpFoe: foe.hp, actor, move })

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
      add(say(r, 'move', vars, '{cat} used {move}!'), 'move', who, move)

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

  const rows = earned(log, you, foe, turn)
  const total = rows.reduce((n, x) => n + x.score, 0)

  return { seed, turf, you, foe, log, youWon: winner === you, turns: turn, rows, total }
}
