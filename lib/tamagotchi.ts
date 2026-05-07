export type Stats = { hunger: number; happiness: number; energy: number; lastSaved: number }

const DECAY_PER_HOUR = { hunger: 12, happiness: 8, energy: 6 }
const MAX = 100
const DEFAULT: Stats = { hunger: 80, happiness: 80, energy: 80, lastSaved: Date.now() }

export function loadStats(catId: string): Stats {
  if (typeof window === 'undefined') return { ...DEFAULT }
  try {
    const raw = localStorage.getItem(`ccat-tama-${catId}`)
    if (!raw) return { ...DEFAULT }
    const saved: Stats = JSON.parse(raw)
    const hoursElapsed = (Date.now() - saved.lastSaved) / 3_600_000
    return {
      hunger:    Math.max(0, saved.hunger    - DECAY_PER_HOUR.hunger    * hoursElapsed),
      happiness: Math.max(0, saved.happiness - DECAY_PER_HOUR.happiness * hoursElapsed),
      energy:    Math.max(0, saved.energy    - DECAY_PER_HOUR.energy    * hoursElapsed),
      lastSaved: saved.lastSaved,
    }
  } catch { return { ...DEFAULT } }
}

export function saveStats(catId: string, stats: Stats) {
  if (typeof window === 'undefined') return
  localStorage.setItem(`ccat-tama-${catId}`, JSON.stringify({ ...stats, lastSaved: Date.now() }))
}

export function feed(s: Stats):  Stats { return { ...s, hunger:    Math.min(MAX, s.hunger    + 30) } }
export function pet(s: Stats):   Stats { return { ...s, happiness: Math.min(MAX, s.happiness + 25) } }
export function play(s: Stats):  Stats { return { ...s, happiness: Math.min(MAX, s.happiness + 20), energy: Math.max(0, s.energy - 15), hunger: Math.max(0, s.hunger - 10) } }

export function mood(s: Stats): 'happy' | 'neutral' | 'hungry' | 'sad' | 'tired' {
  if (s.energy < 20)    return 'tired'
  if (s.hunger < 20)    return 'hungry'
  if (s.happiness < 20) return 'sad'
  if (s.hunger > 60 && s.happiness > 60 && s.energy > 60) return 'happy'
  return 'neutral'
}

export function moodEmoji(m: ReturnType<typeof mood>): string {
  return { happy: '😸', neutral: '🐱', hungry: '😿', sad: '😾', tired: '😴' }[m]
}

const LINES: Record<ReturnType<typeof mood>, string[]> = {
  happy:   ['Purring at maximum capacity 😸', 'Life is good on the moon 🌕', 'Ready to clank! 🚀'],
  neutral: ['Just vibing in space 🐱', 'Watching the stars pass by...', 'Thinking about $CLKCAT 📈'],
  hungry:  ['Feed me or I liquidate 😿', 'My hunger is dipping below support...', 'Need food. Now. 🍖'],
  sad:     ['Nobody pets me anymore 😾', 'Loneliness detected. Send help.', 'Even my tail is bearish 😾'],
  tired:   ['Zzz... $CLKCAT dreams 😴', 'Too tired to HODL... 😴', 'Recharging on the moon 🌕'],
}

export function catLine(s: Stats): string {
  const m = mood(s)
  const lines = LINES[m]
  return lines[Math.floor(Date.now() / 60000) % lines.length]
}
