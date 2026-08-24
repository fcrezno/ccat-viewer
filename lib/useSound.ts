'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MUSIC, MUSIC_DIR, SFX, SFX_DIR } from '@/lib/sfx'

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
    if (started.current || typeof window === 'undefined') return
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

  return { play, startMusic, stopMusic, volume, setVolume, muted, setMuted, prime }
}
