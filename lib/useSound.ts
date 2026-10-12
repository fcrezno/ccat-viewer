'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MUSIC, MUSIC_DIR, SFX, SFX_DIR } from '@/lib/sfx'
import { playSfx, playUrl, unlockSfx } from '@/lib/sfxBank'

/**
 * SOUND FOR THE CRADLE.
 *
 * The cues and their gains come from the game's own sound.json. A LAYERED cue
 * picks one file from each pool and plays them together — the game's note says
 * why: "three of each is nine hits rather than three", so a landed blow does not
 * wear out after a few turns.
 *
 * ── WHY IT IS BUILT THIS WAY ─────────────────────────────────────────────────
 *
 * A browser will not let audio start before the person has interacted with the
 * page, so nothing is loaded or played until the first fight is started by a tap.
 * That is also when the music begins — attempting it on mount gets the tab
 * blocked and, on iOS, sometimes leaves audio wedged for the whole session.
 *
 * THE CUES PLAY THROUGH WEB AUDIO (lib/sfxBank): decoded ahead, started on the
 * next audio block, at an exact gain — JP, 2026-10-06: "sync the sound effects
 * better". The pools below are only the fallback for a file not decoded yet.
 *
 * Each cue keeps a small POOL of elements. One `Audio` per cue cannot overlap
 * with itself, so two hits close together would cut the first one off — the
 * second call restarts the same element. Rotating through a few copies lets them
 * ring over each other the way they do in the game.
 *
 * Volume and mute are remembered, because a game that starts loud every time
 * gets muted permanently.
 */

const STORE = 'cradle.sound.v1'
const POOL = 3

type Saved = { volume: number; muted: boolean }
/** The announcer's voice against the cues: present, but sitting in the mix like a fighting-game intro (JP: "a bit too loud"). */
const VOICE_GAIN = 0.7

function load(): Saved {
  if (typeof window === 'undefined') return { volume: 0.7, muted: false }
  try {
    const raw = window.localStorage.getItem(STORE)
    if (!raw) return { volume: 0.7, muted: false }
    const v = JSON.parse(raw) as Partial<Saved>
    return {
      volume: typeof v.volume === 'number' ? Math.min(1, Math.max(0, v.volume)) : 0.7,
      muted: !!v.muted,
    }
  } catch { return { volume: 0.7, muted: false } }
}

export function useSound() {
  const [volume, setVolumeState] = useState(0.7)
  const [muted, setMutedState] = useState(false)

  const pools = useRef<Record<string, HTMLAudioElement[]>>({})
  const turn = useRef<Record<string, number>>({})
  const music = useRef<HTMLAudioElement | null>(null)
  /** Which track the one music element is currently pointed at. */
  const current = useRef<string | null>(null)
  const started = useRef(false)

  // Read the saved settings on the client only — localStorage does not exist
  // during the server render and reading it in useState would throw.
  useEffect(() => {
    const s = load()
    setVolumeState(s.volume)
    setMutedState(s.muted)
  }, [])

  const save = (v: number, m: boolean) => {
    try { window.localStorage.setItem(STORE, JSON.stringify({ volume: v, muted: m })) } catch {}
  }

  const setVolume = useCallback((v: number) => {
    setVolumeState(v)
    save(v, muted)
    if (music.current) music.current.volume = MUSIC.gain * v * (muted ? 0 : 1)
  }, [muted])

  const setMuted = useCallback((m: boolean) => {
    setMutedState(m)
    save(volume, m)
    if (music.current) music.current.volume = MUSIC.gain * volume * (m ? 0 : 1)
  }, [volume])

  /** Build the pools once, on the first gesture. */
  const prime = useCallback(() => {
    if (typeof window === 'undefined') return
    // Every gesture, not just the first: a context the browser suspended (a tab
    // in the background, iOS after a call) is resumed by the next tap.
    unlockSfx()
    if (started.current) return
    started.current = true

    for (const [name, cue] of Object.entries(SFX)) {
      const files = cue.layers.flat()
      pools.current[name] = files.flatMap(f =>
        Array.from({ length: POOL }, () => {
          const a = new Audio(SFX_DIR + f)
          a.preload = 'auto'
          return a
        }))
      turn.current[name] = 0
    }
  }, [])

  const play = useCallback((name: string) => {
    if (muted || !started.current) return
    const cue = SFX[name]
    const pool = pools.current[name]
    if (!cue || !pool) return

    // One from each pool, together — the game's two-layer stack.
    for (const layer of cue.layers) {
      const file = layer[Math.floor(Math.random() * layer.length)]
      if (playSfx(file, Math.min(1, cue.gain * volume))) continue
      const candidates = pool.filter(a => a.src.endsWith(file))
      if (!candidates.length) continue
      const i = (turn.current[name] = (turn.current[name] + 1) % candidates.length)
      const a = candidates[i]
      try {
        a.currentTime = 0
        a.volume = Math.min(1, cue.gain * volume)
        void a.play()
      } catch { /* a blocked or still-loading cue is not worth a crash */ }
    }
  }, [muted, volume])

  /**
   * THE ANNOUNCER SPEAKS (lib/announcers): a voice file at the player's volume,
   * with the music dipped under it for the length of the line so the words sit
   * on top, then brought back.
   */
  const duck = useRef<ReturnType<typeof setTimeout> | null>(null)
  const say = useCallback((url: string, holdMs = 1300) => {
    if (muted || !started.current) return
    if (!playUrl(url, Math.min(1, VOICE_GAIN * volume))) {
      // No running Web Audio yet (or at all): a plain element, a little late but heard.
      try { const el = new Audio(url); el.volume = Math.min(1, VOICE_GAIN * volume); void el.play().catch(() => {}) } catch { return }
    }
    const m = music.current
    if (!m) return
    const full = MUSIC.gain * volume
    m.volume = full * 0.6
    if (duck.current) clearTimeout(duck.current)
    duck.current = setTimeout(() => { if (music.current) music.current.volume = full * (muted ? 0 : 1) }, holdMs)
  }, [muted, volume])

  /**
   * Start the bed, optionally on a named track.
   *
   * Asking for the track that is ALREADY playing does not restart it — that is
   * what lets a gauntlet call this on every round without the music jumping back
   * to the top each time. Asking for a different one swaps the source and starts
   * it from the beginning, which is the point of a per-fight track.
   */
  const startMusic = useCallback((track?: string) => {
    prime()
    if (typeof window === 'undefined') return

    const want = track ?? MUSIC.file
    const src = MUSIC_DIR + want

    if (!music.current) {
      const a = new Audio(src)
      a.loop = MUSIC.loop
      a.preload = 'auto'
      music.current = a
    } else if (current.current !== want) {
      music.current.pause()
      music.current.src = src
      music.current.currentTime = 0
    }
    current.current = want

    music.current.volume = MUSIC.gain * volume * (muted ? 0 : 1)
    void music.current.play().catch(() => {})
  }, [prime, volume, muted])

  const stopMusic = useCallback(() => {
    music.current?.pause()
  }, [])

  // Leaving the page with music still going is rude.
  useEffect(() => () => { music.current?.pause() }, [])

  return { play, say, startMusic, stopMusic, volume, setVolume, muted, setMuted, prime }
}
