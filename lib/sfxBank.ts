'use client'

import { SFX, SFX_DIR } from '@/lib/sfx'

/**
 * THE SOUND EFFECTS, DECODED AHEAD AND PLAYED THROUGH WEB AUDIO.
 *
 * JP, 2026-10-06: "sync the sound effects better". Every cue used to be an
 * <audio> element: `play()` on one is asynchronous and starts when the browser
 * gets round to it — tens of milliseconds at best, and the first use of a file
 * waited on its download and decode, so a hit could land audibly after the blow.
 * iOS also ignores an <audio>'s `volume`, so the gains did nothing on an iPhone.
 *
 * Here each file is FETCHED once — by the loading screen, so it is in hand before
 * any fight (lib/battleAssets) — DECODED once the first tap has made an
 * AudioContext allowed to run, and then started with `source.start()`, which
 * begins on the next audio block (a few milliseconds) at an exact gain.
 *
 * A module, not a hook: the loading screen and the fight share one bank.
 */

/** Every file any cue can pick, once each. */
export const SFX_FILES = [...new Set(Object.values(SFX).flatMap(c => c.layers.flat()))]

const raw = new Map<string, Promise<ArrayBuffer | null>>()
const decoded = new Map<string, AudioBuffer>()
let ctx: AudioContext | null = null

/** Starts (or joins) the downloads. Safe before any gesture: it only fetches. */
export function fetchSfx(): Promise<ArrayBuffer | null>[] {
  for (const f of SFX_FILES) {
    if (!raw.has(f)) {
      raw.set(f, fetch(SFX_DIR + f).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null))
    }
  }
  return [...raw.values()]
}

/**
 * On a tap: the context, running, and every file decoded into it. A browser lets
 * an AudioContext run only from a gesture, which is why this is not done on load.
 */
export function unlockSfx() {
  if (typeof window === 'undefined') return
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!C) return
    ctx = new C()
  }
  void ctx.resume().catch(() => {})
  fetchSfx()
  const c = ctx
  for (const [f, p] of raw) {
    if (decoded.has(f)) continue
    void p.then(buf => {
      if (!buf || decoded.has(f)) return
      // decodeAudioData takes the buffer over, so it gets a copy.
      return c.decodeAudioData(buf.slice(0)).then(b => { decoded.set(f, b) })
    }).catch(() => {})
  }
}

/** Plays one file now at `gain`. False when it cannot yet, so the caller can fall back. */
export function playSfx(file: string, gain: number): boolean {
  const b = decoded.get(file)
  if (!ctx || !b || ctx.state !== 'running') return false
  const src = ctx.createBufferSource()
  src.buffer = b
  const g = ctx.createGain()
  g.gain.value = gain
  src.connect(g).connect(ctx.destination)
  src.start()
  return true
}
