/**
 * One Krita document per effect, sized to a SINGLE FRAME.
 *
 *   node art/impact/make-frame-ora.mjs
 *
 * JP: "just size it for one frame."
 *
 * The sheet documents are 240 wide, so drawing in one meant working across a
 * strip at whatever zoom fitted all five cells. These are 48x48 — the cell
 * itself — and the five frames are LAYERS instead of columns.
 *
 * ── THE LAYER STACK ──────────────────────────────────────────────────────────
 *
 * Top to bottom, as Krita's docker shows it:
 *
 *   GUIDE - HIDE BEFORE EXPORT   centre cross, body circle, margin
 *   FRAME 5  /  ref 5            the drawing layer, and its reference under it
 *   FRAME 4  /  ref 4
 *   FRAME 3  /  ref 3
 *   FRAME 2  /  ref 2
 *   FRAME 1  /  ref 1
 *   BACKGROUND                   the card colour, #12121c
 *
 * FRAME 1 opens visible and the rest are hidden, so the document starts clean.
 * Each `ref` is that frame's rough at 35%, also hidden: turn one on while drawing
 * its frame, off when it is in the way.
 *
 * ── WHY THERE IS A BACKGROUND LAYER NOW ──────────────────────────────────────
 *
 * The sheet documents put white art on a transparent checkerboard, which is
 * close to unreadable — the same fault that made the very first rough impossible
 * to judge until it was rendered on the card colour.
 *
 * It carries no risk here because EXPORT IS NOT MANUAL. pack-frames.mjs reads the
 * layers back out BY NAME and only ever looks at "FRAME n", so the background and
 * the guide cannot reach the game whether they are hidden or not. That is the
 * point of naming them.
 */
import sharp from 'sharp'
import fs from 'node:fs'
import { ora } from './ora.mjs'

const S = 48, FRAMES = 5
const OUT = 'art/impact/frames'
const CARD = { r: 0x12, g: 0x12, b: 0x1c, alpha: 1 }

const SHEETS = [
  ['impact', ['WEAK', 'HIT', 'CRIT']],
  ['attack-physical', ['SLASH', 'CROSS', 'STRIKE', 'PUMMEL', 'PIERCE']],
  ['attack-magic', ['ZOOMIES', 'FORGE', 'COOLANT', 'SIGNAL', 'GLITCH', 'CRYO', 'SCRAP', 'STRAY']],
]

fs.mkdirSync(OUT, { recursive: true })

const empty = () => sharp({
  create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
}).png().toBuffer()

const card = () => sharp({ create: { width: S, height: S, channels: 4, background: CARD } })
  .png().toBuffer()

// Every cell's guide is identical, so one is cut from the first sheet and reused.
const guide = await sharp('art/impact/impact-guide.png')
  .extract({ left: 0, top: 0, width: S, height: S }).png().toBuffer()

let made = 0
for (const [sheet, rows] of SHEETS) {
  const src = 'art/impact/' + sheet + '-rough.png'

  for (const [row, name] of rows.entries()) {
    const layers = [{ name: 'GUIDE - HIDE BEFORE EXPORT', png: guide }]

    /*
     * Built from FRAME 5 down to FRAME 1, because ORA lists the stack top first
     * and the later frames belong above the earlier ones — the same order they
     * play in, read downward.
     */
    for (let f = FRAMES - 1; f >= 0; f--) {
      const ref = await sharp(src)
        .extract({ left: f * S, top: row * S, width: S, height: S }).png().toBuffer()

      layers.push({ name: 'FRAME ' + (f + 1), png: await empty(), visible: f === 0 })
      layers.push({ name: 'ref ' + (f + 1), png: ref, opacity: 0.35, visible: false })
    }

    layers.push({ name: 'BACKGROUND', png: await card() })

    // The thumbnail is frame two on the card colour: the peak, and the frame that
    // says most about what the effect is, so the file browser is readable.
    const peak = await sharp(src)
      .extract({ left: 1 * S, top: row * S, width: S, height: S }).png().toBuffer()
    const merged = await sharp({ create: { width: S, height: S, channels: 4, background: CARD } })
      .composite([{ input: peak }, { input: guide }]).png().toBuffer()

    const file = OUT + '/' + name.toLowerCase() + '.ora'
    fs.writeFileSync(file, ora({ width: S, height: S, layers, merged }))
    made++
  }
}

console.log('wrote ' + made + ' documents in ' + OUT + ' — ' + S + 'x' + S + ', ' + (FRAMES * 2 + 2) + ' layers each')
