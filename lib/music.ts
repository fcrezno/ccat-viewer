import { MUSIC } from '@/lib/sfx'

/**
 * WHICH BED PLAYS, AND WHEN.
 *
 * `lib/sfx.ts` is GENERATED from clanker-arena/data/sound.json and names one
 * music file. This list is hand-written and sits beside it, because "a different
 * track per fight" is a decision about the Cradle rather than a fact about the
 * game's sound data — and editing the generated file would be undone the next
 * time it is generated.
 *
 * ── ADDING TRACKS ────────────────────────────────────────────────────────────
 *
 * Drop the mp3 into `public/game/music/` and add its filename below. Nothing
 * else needs changing: a gauntlet already asks for a different track per round
 * and wraps around when it runs out, so two files alternate, five give every
 * round its own, and one behaves exactly as it always has.
 *
 * There is ONE file today (`plucky-enemy.mp3`), so every round currently plays
 * it and the rotation is a no-op. That is the honest state of it — the mechanism
 * is here so the tracks are the only thing missing.
 */
export const TRACKS: string[] = [
  MUSIC.file,
]

/**
 * The bed for a given round of a run, wrapping when the list is shorter than the
 * gauntlet. Round numbers are 1-based, as the player counts them.
 */
export function trackForRound(round: number): string {
  if (TRACKS.length === 0) return MUSIC.file
  const i = Math.max(0, round - 1) % TRACKS.length
  return TRACKS[i]
}
