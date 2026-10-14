/**
 * THE CLASSIC LOOK for the meme ads (scripts/make-memeads.mjs, make-borkads.mjs).
 * JP, 2026-10-14: "make it real classic like" (the ads and the columns), "add some
 * cheap gif animations to the ads as well".
 *
 *   - real GIFs again: a small palette and an ordered dither, the 1998 grain
 *   - grey Windows 95 bevel buttons in place of the 2004 glossy pills
 *   - 8 frames of cheap animation on every ad: a chasing-lights marquee or a
 *     rainbow-cycling frame round the edge, twinkling sparkles, a spinning star
 *   - the ads' own blink (button, badge) changes every 4 frames
 */
import { spawnSync } from 'child_process'
import { join } from 'path'

export const FFMPEG = 'C:/Users/JPDom/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe'
export const FRAMES = 8, FPS = 6
/** The ads' own on/off blink, from the animation frame: about 0.7 s each way. */
export const blinkOf = f => Math.floor(f / 4) % 2

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A Windows 95 push button: silver face, white top-left edge, dark bottom-right. `lit` pushes it in. */
export function bevel(x, y, w, h, label, { size = 14, lit = false, font = 'Arial', ink = '#000000' } = {}) {
  const hi = lit ? '#404040' : '#ffffff', lo = lit ? '#ffffff' : '#404040', mid = lit ? '#c0c0c0' : '#808080'
  const d = lit ? 1 : 0
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#c0c0c0"/>
    <path d="M${x} ${y + h} V${y} H${x + w}" fill="none" stroke="${hi}" stroke-width="2"/>
    <path d="M${x + w} ${y} V${y + h} H${x}" fill="none" stroke="${lo}" stroke-width="2"/>
    <path d="M${x + w - 2} ${y + 2} V${y + h - 2} H${x + 2}" fill="none" stroke="${mid}" stroke-width="1"/>
    <text x="${x + w / 2 + d}" y="${y + h / 2 + size * 0.36 + d}" text-anchor="middle" font-family="${font}" font-weight="bold" font-size="${size}" fill="${lit ? '#c00000' : ink}">${esc(label)}</text>`
}

const NO_STAR = new Set(['anger', 'lostcrown', 'mail', 'buddy', 'virus', 'beforeyougo', 'callnow', 'tenten', 'trick', 'doom'])
const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
const RAINBOW = ['#ff0000', '#ff8000', '#ffff00', '#00e000', '#00c0ff', '#0040ff', '#a000ff', '#ff00c0']

/** A four-point sparkle, size by frame. */
const sparkle = (x, y, s) => s <= 0 ? '' :
  `<path d="M${x} ${y - s} L${x + s * 0.25} ${y - s * 0.25} L${x + s} ${y} L${x + s * 0.25} ${y + s * 0.25} L${x} ${y + s} L${x - s * 0.25} ${y + s * 0.25} L${x - s} ${y} L${x - s * 0.25} ${y - s * 0.25} Z" fill="#ffffff" stroke="#ffe600" stroke-width="1"/>`

/**
 * The cheap animation over an ad of w x h (its own units), frame f of FRAMES.
 * Which border and where the sparkles fall come from the ad's name, so each ad
 * keeps its own look from build to build.
 */
export function decorate(name, w, h, f) {
  const k = hash(name), out = []
  const small = Math.min(w, h) < 100
  if (k % 2 === 0) {
    // Chasing lights: a bulb every 10 units round the edge, every third one lit, moving.
    const step = small ? 9 : 10, r = small ? 1.6 : 2.3, pts = []
    for (let x = 3; x < w - 2; x += step) pts.push([x, 3])
    for (let y = 3; y < h - 2; y += step) pts.push([w - 3, y])
    for (let x = w - 3; x > 2; x -= step) pts.push([x, h - 3])
    for (let y = h - 3; y > 2; y -= step) pts.push([3, y])
    out.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="#000" stroke-width="${small ? 5 : 7}"/>`)
    pts.forEach(([x, y], i) => out.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${(i + f) % 3 === 0 ? '#fff200' : '#ff2020'}"/>`))
  } else {
    // A frame that cycles the rainbow.
    for (let i = 0; i < 3; i++) out.push(`<rect x="${i * 1.5 + 0.75}" y="${i * 1.5 + 0.75}" width="${w - i * 3 - 1.5}" height="${h - i * 3 - 1.5}" fill="none" stroke="${RAINBOW[(f + i * 2) % 8]}" stroke-width="1.6"/>`)
  }
  // Sparkles that twinkle out of step with each other, kept off the middle of the ad.
  const n = small ? 2 : w > 300 ? 4 : 5
  for (let i = 0; i < n; i++) {
    const hx = hash(name + i)
    const x = 10 + (hx % (w - 20)), y = 10 + ((hx >> 8) % (h - 20))
    const edgeish = x < w * 0.22 || x > w * 0.78 || y < h * 0.18 || y > h * 0.82
    if (!edgeish) continue
    out.push(sparkle(x, y, [0, 3, 6, 3][(f + i) % 4] * (small ? 0.7 : 1)))
  }
  // A star that spins (squeezed side to side), in a top corner; not on the ads whose
  // top-left corner is a window title or small print it would cover.
  if (!small && !NO_STAR.has(name)) {
    const cx = k % 4 < 2 ? 15 : w - 15, cy = 15, sx = Math.abs(Math.cos(f * Math.PI / 4)) + 0.08
    out.push(`<g transform="translate(${cx} ${cy}) scale(${sx.toFixed(2)} 1)"><path d="M0 -9 L2.6 -2.8 L9 -2.8 L3.8 1.2 L5.8 8 L0 4 L-5.8 8 L-3.8 1.2 L-9 -2.8 L-2.6 -2.8 Z" fill="#ffd200" stroke="#000" stroke-width="1"/></g>`)
  }
  return out.join('')
}

/** Frames f000.png.. in `dir` -> a looping GIF with the old small palette and ordered dither. */
export function encodeGif(dir, out) {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-y', '-framerate', String(FPS), '-i', join(dir, 'f%03d.png'),
    '-filter_complex', '[0]split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
    '-loop', '0', out], { stdio: 'inherit' })
  if (r.status) throw new Error('ffmpeg failed for ' + out)
}
