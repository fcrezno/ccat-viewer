// GENERATED from clanker-arena/data/sound.json — do not edit by hand.
//
// The gains are the owner's and are the ONLY balance control. The files are
// peak-normalised to -14 dB at source; do not add a loudness pass on top.
//
// Everything is transcoded to mp3 for the web — a codec change only, no
// levelling — because the wavs came to 1.8MB.

export type Cue = {
  /** One file is picked from EACH pool and played together. */
  layers: string[][]
  gain: number
}

export const SFX: Record<string, Cue> = {
  // an ordinary landed blow
  hit: { layers: [["impact1.mp3","impact2.mp3","impact3.mp3","hit-jp.mp3"],["bump.mp3","hit_down.mp3","jab.mp3"]], gain: 1.2 },
  // a critical
  crit: { layers: [["metal14.mp3","metal15.mp3","mamadoll.mp3"],["blast.mp3","slam.mp3","xslice.mp3"]], gain: 1.35 },
  // a cat goes down
  ko: { layers: [["slam.mp3"]], gain: 1.35 },
  // a swing at nothing
  miss: { layers: [["scratch.mp3"]], gain: 0.8 },
  // it landed, badly
  weak: { layers: [["bump.mp3"]], gain: 0.95 },
  // home turf, and score rows landing
  perk: { layers: [["confirm.mp3"]], gain: 0.95 },
  // the typing blip
  type: { layers: [["typing.mp3"]], gain: 0.55 },
  // sustained; trimmed to the count
  score: { layers: [["points.mp3"]], gain: 1 },
  // the rankings, and the camera arriving
  climb: { layers: [["enter.mp3"]], gain: 0.8 },
  // the 3, 2 and 1 of the countdown, on the SET PIECE clip rather than the fight — `mapscreen
  count: { layers: [["enter.mp3"]], gain: 0.9 },
  // FIGHT!, the fourth beat of the countdown
  go: { layers: [["levelup_s.mp3"]], gain: 1 },
}

/*
 * THE FIGHT BED.
 *
 * `plucky-enemy` is the main game's default fight music and is never actually
 * heard there — all five zones override it with their own track. So the preview
 * gets the one bed the game wrote and never plays.
 */
export const MUSIC = {
  file: "plucky-enemy.mp3",
  gain: 0.28,
  loop: true,
}

export const SFX_DIR = '/game/sfx/'
export const MUSIC_DIR = '/game/music/'
