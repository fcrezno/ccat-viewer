/**
 * BABBLE — cat voices from a real meow (JP, 2026-10-19: UnitOfTime's "I Gave My NPCs
 * Voices Without Recording Anything", "use the video ... but use cat recorded sounds").
 * The video's method: every letter plays a short slice of a recording, pitched by the
 * letter, so the same words always "sound" the same. Here the recording is JP's
 * MEOW.WAV (public/game/sfx/meow.mp3), and each slice starts on one of its meows
 * (MEOWS: where each one begins, from ffmpeg silencedetect at -30 dB), never on silence.
 * `pitch` sets the voice: rats high and quick, the announcer low.
 */
const MEOWS = [0, 1.026, 1.641, 2.178, 4.008, 8.201, 8.794, 9.629, 9.869, 12.064, 12.701, 16.076, 16.735, 19.572, 20.707,
  22.12, 23.929, 24.496, 24.812, 26.681, 27.015, 29.247, 31.399, 35.43, 37.564]
const SLICE = 0.09

let ac: AudioContext | null = null
let meow: AudioBuffer | null = null
let loading: Promise<void> | null = null

function load() {
  ac ??= new AudioContext()
  loading ??= fetch('/game/sfx/meow.mp3').then(r => r.arrayBuffer()).then(b => ac!.decodeAudioData(b)).then(buf => { meow = buf }).catch(() => {})
  return loading
}

export function babble(text: string, { pitch = 1, speed = 1, vol = 0.5 } = {}) {
  try {
    load()
    if (!ac || !meow) { void loading?.then(() => babble(text, { pitch, speed, vol })); return }
    if (ac.state === 'suspended') void ac.resume()
    let t = ac.currentTime + 0.02
    for (const ch of text.toLowerCase()) {
      if (!/[a-z0-9]/.test(ch)) { t += (ch === ' ' ? 0.05 : 0.09) / speed; continue }
      const code = ch.charCodeAt(0)
      const src = ac.createBufferSource(), g = ac.createGain()
      src.buffer = meow
      // The letter picks the meow and the pitch, so a word always says the same.
      src.playbackRate.value = pitch * (0.85 + ((code * 7) % 26) / 26 * 0.6)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(vol, t + 0.008)
      g.gain.linearRampToValueAtTime(0, t + SLICE / speed)
      src.connect(g).connect(ac.destination)
      src.start(t, MEOWS[code % MEOWS.length] + 0.03, SLICE)
      t += 0.06 / speed
    }
  } catch { /* no audio here: the game goes on silent */ }
}
