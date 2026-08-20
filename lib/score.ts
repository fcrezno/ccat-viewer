// GENERATED from clanker-arena/data/script.json — do not edit by hand.
//
// The names, points and colours of the game's achievements. His writing and his
// numbers; the DETECTION lives in lib/arena.ts, mirroring earned() in score.mjs.

export type Award = {
  name: string
  score: number
  /** Awarded once per occurrence rather than once per fight. */
  per?: boolean
  colour: string
}

export const AWARDS: Record<string, Award> = {
  win: { name: "Victory", score: 500, colour: "#F59E0B" },
  flawless: { name: "Untouchable", score: 1000, colour: "#FFD700" },
  comeback: { name: "Clutch", score: 750, colour: "#EF4444" },
  secondWind: { name: "Second Wind", score: 400, colour: "#F97316" },
  quick: { name: "Speed Demon", score: 400, colour: "#8B5CF6" },
  endurance: { name: "Iron Lungs", score: 300, colour: "#6366F1" },
  homeTurf: { name: "Home Advantage", score: 200, colour: "#10B981" },
  perfectAim: { name: "Dead Eye", score: 350, colour: "#06B6D4" },
  crit: { name: "Critty Kitty", score: 50, per: true, colour: "#E11D48" },
  dodge: { name: "Ghost", score: 25, per: true, colour: "#3B82F6" },
  firstBlood: { name: "First Blood", score: 150, colour: "#DC2626" },
  overkill: { name: "Overkill", score: 250, colour: "#9D174D" },
  minimalist: { name: "Methodical", score: 300, colour: "#A8A29E" },
  closeRange: { name: "Close Combatant", score: 200, colour: "#F43F5E" },
}
