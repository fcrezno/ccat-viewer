/**
 * Turn `public/game/font.png` into a real webfont.
 *
 *   node scripts/make-webfont.mjs
 *   → public/fonts/CradleFont.otf
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 *
 * JP: "all the fonts should be uniform. make it the same as the battle log font."
 *
 * The battle log font is not a font. It is a 256x144 sheet of 16x24 cells that
 * `components/BitmapText.tsx` draws one glyph at a time, each as a span with the
 * sheet as a CSS mask. That works beautifully for a log and cannot be applied to
 * a heading, a button or a paragraph — every glyph is its own box, so any text
 * using it is a flex row of boxes rather than text.
 *
 * The app's other font, `MyFont-Regular.ttf`, IS a real font, which is why every
 * heading and button already uses it. So the two hand-drawn fonts have never been
 * the same thing, and no amount of CSS was going to make them one.
 *
 * This makes the sheet into the same KIND of thing as MyFont, so it can go in a
 * font stack and the whole app can wear it.
 *
 * ── THE GEOMETRY, READ OUT OF THE SHEET RATHER THAN ASSUMED ──────────────────
 *
 * Sampled before writing any of this:
 *
 *   'A'  metrics [2,12]  ink cols 2..13   ink rows 6..18
 *   'H'  metrics [3,11]  ink cols 3..13   ink rows 4..17
 *   'p'  metrics [4, 8]  ink cols 4..11   ink rows 8..23
 *   '_'  metrics [2,12]                   ink rows 19..20
 *
 * So `METRICS[i][0]` is exactly where a glyph's ink starts — it is the left
 * bearing, not a guess — and ink never runs past `left + width - 1`.
 *
 * THE BASELINE IS BETWEEN ROW 18 AND ROW 19. 'A', 'x' and '.' all bottom out on
 * 18; '_' starts at 19; 'p' reaches 23. That puts five pixels below the line,
 * which is the descender.
 *
 * ── THE 1px BASELINE DRIFT IS CARRIED THROUGH ────────────────────────────────
 *
 * font.png has a deliberate 1px drift and the standing rule is that it is never
 * tidied. Nothing here rounds, snaps or corrects anything: every lit pixel
 * becomes a rectangle exactly where it is. If a glyph sits a pixel high on the
 * sheet it sits a pixel high in the font.
 *
 * ── WHAT IT CANNOT DRAW ──────────────────────────────────────────────────────
 *
 * The sheet is ASCII 32..127 and nothing else. Measured against the running app,
 * the characters it cannot draw are: · — ’ → ↑ ♪ ☼ and two emoji. Nine, all
 * punctuation or icons. They fall through to the next font in the stack, which
 * is what a font stack is for.
 */
import sharp from 'sharp'
import fs from 'node:fs'
import opentype from 'opentype.js'

const SHEET = 'public/game/font.png'
const OUT = 'public/fonts/CradleFont.otf'

const CELL_W = 16, CELL_H = 24, COLS = 16, FIRST = 32, TRACKING = 1

/** Where the baseline sits in the cell, measured — see the header. */
const BASELINE_ROW = 19

/** Font units per sheet pixel. 24 rows x 50 = 1200 per em. */
const U = 50
const EM = CELL_H * U

/** METRICS lives in lib/font.ts and is the one source of truth for widths. */
const src = fs.readFileSync('lib/font.ts', 'utf8')
const METRICS = [...src.match(/METRICS[\s\S]*?\n\]/)[0].matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*\]/g)]
  .map(m => [Number(m[1]), Number(m[2])])

const { data, info } = await sharp(SHEET).raw().toBuffer({ resolveWithObject: true })
const lit = (x, y) => data[(y * info.width + x) * info.channels + 3] > 127

/**
 * Every lit pixel of one glyph, as as few rectangles as possible.
 *
 * Per-row runs first, then a run is grown DOWNWARD while the row below has an
 * identical one. Hundreds of one-pixel squares would draw the same shape, but
 * they meet along thousands of shared edges and some rasterisers show that as
 * seams. Merging costs nothing and removes the question.
 */
function rects(idx) {
  const [left, width] = METRICS[idx]
  const cx = (idx % COLS) * CELL_W
  const cy = Math.floor(idx / COLS) * CELL_H

  /* runs[y] = [[x0, x1], …] in sheet columns, clipped to the glyph's own width. */
  const runs = []
  for (let y = 0; y < CELL_H; y++) {
    const row = []
    let start = null
    for (let x = left; x < left + width; x++) {
      if (lit(cx + x, cy + y)) { if (start === null) start = x }
      else if (start !== null) { row.push([start, x - 1]); start = null }
    }
    if (start !== null) row.push([start, left + width - 1])
    runs.push(row)
  }

  const out = []
  const used = runs.map(r => r.map(() => false))
  for (let y = 0; y < CELL_H; y++) {
    for (let i = 0; i < runs[y].length; i++) {
      if (used[y][i]) continue
      const [x0, x1] = runs[y][i]
      let y1 = y
      /* Grow down while the row below carries the same run. */
      for (let ny = y + 1; ny < CELL_H; ny++) {
        const j = runs[ny].findIndex((r, k) => !used[ny][k] && r[0] === x0 && r[1] === x1)
        if (j < 0) break
        used[ny][j] = true
        y1 = ny
      }
      out.push({ x0, x1, y0: y, y1 })
    }
  }
  return { left, width, out }
}

const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 0, path: new opentype.Path() })]

let drawn = 0, boxes = 0
for (let idx = 0; idx < METRICS.length; idx++) {
  const code = FIRST + idx
  const { left, width, out } = rects(idx)

  const path = new opentype.Path()
  for (const r of out) {
    /* Sheet pixels → font units. x is relative to the glyph's own left bearing. */
    const ax = (r.x0 - left) * U
    const bx = (r.x1 + 1 - left) * U
    /* y grows UP from the baseline, so a row's top edge is the smaller row index. */
    const top = (BASELINE_ROW - r.y0) * U
    const bot = (BASELINE_ROW - (r.y1 + 1)) * U
    path.moveTo(ax, bot)
    path.lineTo(bx, bot)
    path.lineTo(bx, top)
    path.lineTo(ax, top)
    path.close()
    boxes++
  }
  if (out.length) drawn++

  glyphs.push(new opentype.Glyph({
    name: 'uni' + code.toString(16).toUpperCase().padStart(4, '0'),
    unicode: code,
    /* The game puts TRACKING between glyphs; a font puts it in the advance. */
    advanceWidth: (width + TRACKING) * U,
    path,
  }))
}

const font = new opentype.Font({
  familyName: 'CradleFont',
  styleName: 'Regular',
  unitsPerEm: EM,
  ascender: BASELINE_ROW * U,
  descender: -(CELL_H - BASELINE_ROW) * U,
  glyphs,
})

fs.mkdirSync('public/fonts', { recursive: true })
fs.writeFileSync(OUT, Buffer.from(font.toArrayBuffer()))

console.log(`\n  ${OUT}`)
console.log(`  ${glyphs.length - 1} glyphs (${drawn} with ink), ${boxes} rectangles`)
console.log(`  em ${EM}  ascender ${BASELINE_ROW * U}  descender ${-(CELL_H - BASELINE_ROW) * U}`)
console.log(`  ${(fs.statSync(OUT).size / 1024).toFixed(1)} kB\n`)
