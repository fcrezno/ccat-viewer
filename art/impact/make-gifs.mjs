/**
 * Play the effect sheets, as looping GIFs.
 *
 *   node art/impact/make-gifs.mjs
 *
 * A contact sheet shows what was drawn. It cannot show whether the thing WORKS,
 * because an impact effect is 200 milliseconds long and every judgement about it
 * — does it read, is it too slow, does the break land — is a judgement about
 * motion. So this plays them.
 *
 * ── AT THE REAL SPEED, WITH A PAUSE ──────────────────────────────────────────
 *
 * 40ms a frame, which is 0.2s across five frames: exactly what the game will do
 * at speed x1. A slowed-down preview is a comfortable lie — it makes every
 * effect look readable, including ones that will be a smear in the game.
 *
 * The loop then HOLDS on empty for half a second. Without the hold, five frames
 * on repeat is a strobe and the eye never gets to see the start; with it, each
 * play arrives fresh, the way it will in a fight where blows are seconds apart.
 *
 * ── ON THE CARD COLOUR ───────────────────────────────────────────────────────
 *
 * White on transparent, so on any pale background it is invisible. #12121c is
 * the card the fight actually draws on.
 */
import sharp from 'sharp'
import { animatedGif } from './gif.mjs'
import fs from 'node:fs'

const S = 48, FRAMES = 5, OUT = 'art/impact'
const SCALE = 4
/** The game's own frame time at x1: 0.2s across five frames. */
const MS = 40
/** Long enough for the eye to reset between plays. */
const HOLD = 520
const CARD = { r: 0x12, g: 0x12, b: 0x1c, alpha: 1 }
const LAB = 84

const SHEETS = [
  ['impact-rough', ['WEAK', 'HIT', 'CRIT']],
  ['attack-physical-rough', ['SLASH', 'CROSS', 'STRIKE', 'PUMMEL', 'PIERCE']],
  ['attack-magic-rough', ['ZOOMIES', 'FORGE', 'COOLANT', 'SIGNAL', 'GLITCH', 'CRYO', 'SCRAP', 'STRAY']],
]

for (const [name, labels] of SHEETS) {
  const rows = labels.length
  const cellW = S * SCALE, stripH = S * rows * SCALE
  const width = LAB + cellW, height = stripH

  // The row names, drawn once and composited onto every frame.
  const key = Buffer.from(
    '<svg width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg">' +
    labels.map((l, i) =>
      '<text x="8" y="' + (i * S * SCALE + S * SCALE / 2 + 5) + '" fill="#7a7a95"' +
      ' font-family="monospace" font-size="14">' + l + '</text>' +
      '<line x1="0" y1="' + (i * S * SCALE) + '" x2="' + width + '" y2="' + (i * S * SCALE) +
      '" stroke="#21212f" stroke-width="1"/>').join('') +
    '</svg>')

  const src = sharp(OUT + '/' + name + '.png')
  const pages = []

  for (let f = 0; f < FRAMES; f++) {
    /*
     * One GIF frame is a COLUMN of the sheet: every row at the same moment. That
     * is what makes the set comparable — five effects side by side, all at frame
     * three, is the only way to see that one of them peaks too late.
     */
    const column = await src.clone().extract({ left: f * S, top: 0, width: S, height: S * rows })
      .resize(cellW, stripH, { kernel: 'nearest' }).png().toBuffer()

    pages.push(await sharp({ create: { width, height, channels: 4, background: CARD } })
      .composite([{ input: key, left: 0, top: 0 }, { input: column, left: LAB, top: 0 }])
      .raw().toBuffer())
  }

  // The hold: the card, empty, with the labels still on it.
  pages.push(await sharp({ create: { width, height, channels: 4, background: CARD } })
    .composite([{ input: key, left: 0, top: 0 }]).raw().toBuffer())

  /*
   * SNAP THE COLOURS BEFORE ENCODING.
   *
   * The art is exactly three colours, but the row labels are anti-aliased text
   * and one label alone introduces 110 shades between its grey and the card.
   * A GIF palette holds 256, so a longer sheet could quietly walk into the
   * encoder's limit and fail at build time.
   *
   * Rounding each channel to the nearest 8 collapses that ramp to a handful and
   * is invisible at this size — the text is a label on a contact sheet, not art.
   */
  for (const page of pages) {
    for (let i = 0; i < page.length; i += 4) {
      page[i] = Math.min(255, Math.round(page[i] / 8) * 8)
      page[i + 1] = Math.min(255, Math.round(page[i + 1] / 8) * 8)
      page[i + 2] = Math.min(255, Math.round(page[i + 2] / 8) * 8)
    }
  }

  const file = OUT + '/' + name.replace('-rough', '') + '.gif'
  fs.writeFileSync(file, animatedGif({
    width, height, frames: pages, loop: 0,
    delays: [...Array(FRAMES).fill(MS), HOLD],
  }))

  const back = await sharp(fs.readFileSync(file), { pages: -1 }).metadata()
  console.log('wrote ' + file + ' — ' + rows + ' rows, ' + back.pages + ' frames at ' + MS + 'ms')
}
