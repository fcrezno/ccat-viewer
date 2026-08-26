/**
 * The mode-icon template, its guide, and a rough of the set.
 *
 *   node art/icons/make-icons.mjs
 *
 * A companion to art/sprites/make-template.mjs, at UI scale instead of creature
 * scale. Same rules: everything TRANSPARENT, the guide is its own file so it can
 * be a layer in Krita and switched off before export.
 *
 *   icons-template.png    three empty cells — draw here
 *   icons-guide.png       cell borders, centre lines, the 1px margin
 *   icons-guide-x8.png    the guide at 8x, legible on screen
 *   icons-rough.png       a rough of the three, to accept or beat
 *   icons-rough-x8.png    the rough at 8x
 *   icons-context.png     the rough on both button colours, at 2x and 3x
 *
 * ── WHY 16x16 ────────────────────────────────────────────────────────────────
 *
 * Two 8x8 tiles square, so it stays on the same grid the sprites use. The label
 * beside it is 14px, so the icon is shown at 2x or 3x with image-rendering
 * pixelated — the same trick BitmapText already uses. INTEGER SCALES ONLY. A
 * fractional scale resamples and the pixel art turns to mush.
 *
 * ── WHY ONLY TWO SHADES ──────────────────────────────────────────────────────
 *
 * A mode icon sits on the purple button (#8b5cf6) AND on the dark card
 * (#12121c). Shades 2 and 3 of the GBC ramp are darker than the card, so an icon
 * drawn in them vanishes exactly where it is needed. The set is therefore drawn
 * in shade 0, with shade 1 for interior detail only. The 1px margin keeps it off
 * the button's edge.
 */
import sharp from 'sharp'
import fs from 'node:fs'

const CELL = 16, GAP = 8, N = 3, TILE = 8
const W = CELL * N + GAP * (N - 1), H = CELL
const OUT = 'art/icons'

/** Only the two shades that survive on a dark card. */
const INK = { '#': '#f8f8f8', '+': '#a8a8a8' }

const svg = (w, h, body, bg = '') =>
  Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">${bg}${body}</svg>`)

const cellX = i => i * (CELL + GAP)

// ── the guide ───────────────────────────────────────────────────────────────
let g = ''
for (let i = 0; i < N; i++) {
  const x = cellX(i)
  // The cell itself.
  g += `<rect x="${x}" y="0" width="${CELL}" height="${CELL}" fill="none" stroke="#00a0ff" stroke-opacity="0.6" stroke-width="1"/>`
  // The 8px tile line, so the icon stays on the sprite grid.
  g += `<line x1="${x + TILE}" y1="0" x2="${x + TILE}" y2="${CELL}" stroke="#00a0ff" stroke-opacity="0.3" stroke-width="1"/>`
  g += `<line x1="${x}" y1="${TILE}" x2="${x + CELL}" y2="${TILE}" stroke="#00a0ff" stroke-opacity="0.3" stroke-width="1"/>`
  // The margin: art must not touch the edge or it collides with the button.
  g += `<rect x="${x + 1}" y="1" width="${CELL - 2}" height="${CELL - 2}" fill="none" stroke="#ffb000" stroke-opacity="0.7" stroke-width="1"/>`
}
await sharp(svg(W, H, g)).png().toFile(`${OUT}/icons-guide.png`)
await sharp(svg(W, H, g)).resize(W * 8, H * 8, { kernel: 'nearest' }).png().toFile(`${OUT}/icons-guide-x8.png`)

// ── the empty canvas ────────────────────────────────────────────────────────
await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .png().toFile(`${OUT}/icons-template.png`)

// ── the rough ───────────────────────────────────────────────────────────────
/* One paw and two speed lines. The paw is the unit; the count is the mode. */
const QUICK = [
  '................',
  '................',
  '................',
  '....##.##.##.##.',
  '+++.##.##.##.##.',
  '....##.##.##.##.',
  '................',
  '................',
  '.....#########..',
  '....###########.',
  '+++.###########.',
  '....###########.',
  '.....#########..',
  '......#######...',
  '................',
  '................',
]
/* Five bars, widest at the bottom: the tower is climbed bottom to top. */
const GAUNTLET = [
  '................',
  '......####......',
  '......####......',
  '................',
  '.....######.....',
  '.....######.....',
  '................',
  '....########....',
  '....########....',
  '................',
  '...##########...',
  '...##########...',
  '................',
  '..############..',
  '..############..',
  '................',
]
/*
 * Two paw prints, set diagonally. Two prints means two players.
 *
 * Twice redrawn. Two cat heads gave 1px ears that read as notches and bodies
 * that read as buckets. Two paws SIDE BY SIDE put all four toes on one line, so
 * they merged into a single row and the pair read as one paw with two pads.
 * Offsetting them breaks that line, and two stamps at an angle is the oldest
 * way there is to say "two of these happened".
 */
const FRIEND = [
  '................',
  '.##..##.........',
  '.##..##.........',
  '................',
  '..####..........',
  '.######.........',
  '.######...##.##.',
  '.######...##.##.',
  '..####..........',
  '................',
  '..........####..',
  '.........######.',
  '.........######.',
  '.........######.',
  '..........####..',
  '................',
]

const ICONS = [QUICK, GAUNTLET, FRIEND]
for (const [n, rows] of ICONS.entries()) {
  if (rows.length !== CELL) throw new Error(`icon ${n}: ${rows.length} rows, want ${CELL}`)
  for (const [y, r] of rows.entries())
    if (r.length !== CELL) throw new Error(`icon ${n} row ${y}: ${r.length} wide, want ${CELL}`)
}

const paint = (rows, ox) => {
  let out = ''
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const fill = INK[ch]
    if (fill) out += `<rect x="${ox + x}" y="${y}" width="1" height="1" fill="${fill}"/>`
  }))
  return out
}

const rough = ICONS.map((ic, i) => paint(ic, cellX(i))).join('')
await sharp(svg(W, H, rough)).png().toFile(`${OUT}/icons-rough.png`)
await sharp(svg(W, H, rough)).resize(W * 8, H * 8, { kernel: 'nearest' }).png().toFile(`${OUT}/icons-rough-x8.png`)

// ── on the real backgrounds ─────────────────────────────────────────────────
/*
 * The only test that matters: can it be read where it is used? Two rows, the
 * purple button and the dark card, each at 2x and 3x.
 */
const PAD = 12
const rowH = CELL * 3 + PAD * 2
const cw = W * 2 + W * 3 + PAD * 3
let ctx = ''
;[['#8b5cf6', 0], ['#12121c', 1]].forEach(([bg, r]) => {
  const y0 = r * rowH
  ctx += `<rect x="0" y="${y0}" width="${cw}" height="${rowH}" fill="${bg}"/>`
})
await sharp(svg(cw, rowH * 2, ctx)).png().toFile(`${OUT}/icons-context-bg.png`)

const layer = async (scale, left, top) =>
  ({ input: await sharp(svg(W, H, rough)).resize(W * scale, H * scale, { kernel: 'nearest' }).png().toBuffer(), left, top })

await sharp(`${OUT}/icons-context-bg.png`).composite([
  await layer(2, PAD, PAD + 8),
  await layer(3, PAD * 2 + W * 2, PAD),
  await layer(2, PAD, rowH + PAD + 8),
  await layer(3, PAD * 2 + W * 2, rowH + PAD),
]).png().toFile(`${OUT}/icons-context.png`)

// The background was only scaffolding for the composite above.
fs.unlinkSync(`${OUT}/icons-context-bg.png`)

console.log(`wrote ${OUT}: template ${W}x${H}, guide, rough, context`)
