'use client'

import { MUSIC, MUSIC_DIR } from '@/lib/sfx'
import { fetchSfx } from '@/lib/sfxBank'

/**
 * EVERYTHING A FIGHT DRAWS OR PLAYS, fetched by the loading screen.
 *
 * JP, 2026-10-06: "make it so the loading screen loads everything for the battle
 * scene as well". Before this the map, VS, the arena and the HP bars each loaded
 * the moment a fight first needed them, so the first fight of a visit arrived in
 * pieces. The opponents' faces are the one thing not here: who you fight is
 * decided when the fight starts.
 *
 * Kept in step with what the components ask for: MapDive (map, VS), FightStage
 * and GameBar (the chrome, the bars, the backdrops), LadderScreen (the yard's
 * items on its field), and lib/sfx (every cue and the music).
 */
const ZONES = ['caves', 'forest', 'mountain', 'temple', 'town']
const BAR_STATES = ['full', 'ghost', 'ok', 'warn', 'bad', ...Array.from({ length: 7 }, (_, i) => `hot${i}`)]
const LADDER_ITEMS = ['pizza', 'donut', 'gameboy', 'banana', 'vinyl', 'chips', 'pineapple', 'cup', 'walnut', 'beer', 'sun', 'moon']

/** Decoded as pictures, so drawing them later costs nothing. */
export const BATTLE_IMAGES = [
  '/game/battlescreen.png', '/game/mapscreen.png', '/game/vs.png', '/game/hud-ko-right.png',
  '/game/bar/kobox.png', '/game/bar/kohole.png', '/game/bar/textbox.png',
  ...['left', 'right'].flatMap(side => BAR_STATES.map(s => `/game/bar/${side}-${s}.png`)),
  ...ZONES.map(z => `/title/${z}.jpg`),
  ...LADDER_ITEMS.map(n => `/yard/items/${n}.png`),
]

/** Fetched whole into the HTTP cache: the arena loops and the music. */
export const BATTLE_FILES = [
  ...ZONES.map(z => `/title/${z}.mp4`),
  MUSIC_DIR + MUSIC.file,
]

const picture = (src: string) => new Promise<void>(resolve => {
  const img = new Image()
  img.onload = () => {
    if (img.decode) img.decode().catch(() => {}).finally(() => resolve())
    else resolve()
  }
  img.onerror = () => resolve()
  img.src = src
})

const file = (src: string) =>
  fetch(src).then(r => (r.ok ? r.blob() : null)).then(() => {}).catch(() => {})

/**
 * Starts every download and resolves when all have finished, failed or not —
 * a missing file must never keep anybody behind the loading screen.
 * `onEach` is called as each one settles, for the progress bar.
 */
export function preloadBattle(onEach: (done: number, total: number) => void): Promise<void> {
  const jobs = [
    ...BATTLE_IMAGES.map(picture),
    ...BATTLE_FILES.map(file),
    ...fetchSfx().map(p => p.then(() => {})),
  ]
  let done = 0
  return Promise.all(jobs.map(j => j.then(() => onEach(++done, jobs.length)))).then(() => {})
}
