/**
 * A printable sticker sheet for NFT.NYC.
 *
 *   node art/stickers/make-stickers.mjs
 *
 * A cat and a code. Nine to a US Letter sheet at 300dpi, ready for full-sheet
 * label paper from any Staples. Ten sheets makes 90, which covers the 88 asked
 * for.
 *
 * ── NO COPY ──────────────────────────────────────────────────────────────────
 *
 * JP: "just use a cat." The first version had a headline and two lines of
 * benefit text, and he was right to cut it. A stranger in Times Square is not
 * reading a sticker, they are deciding in about a second whether to point a phone
 * at it. A cat does that; a sentence does not.
 *
 * ── NINE DIFFERENT CATS ──────────────────────────────────────────────────────
 *
 * Every sticker on the sheet is a different token, spread across the collection
 * rather than taken from the front of it. Somebody who sees two of them on one
 * street has seen two different cats, which is the whole idea of the thing they
 * are being asked to scan.
 *
 * ── WHITE PAPER, BLACK CODE ──────────────────────────────────────────────────
 *
 * The app is #12121c and matching it would be the obvious move. It is also wrong
 * for an office printer: a full-bleed dark background drinks toner, dries slowly,
 * streaks on cheap label stock, and makes the code harder to read. The cat art
 * brings its own colour.
 *
 * ── THE CODE GETS 1.4 INCHES ─────────────────────────────────────────────────
 *
 * The usual failure is a good-looking sticker with a code too small to scan from
 * standing distance. Error correction stays at level Q, matching /api/qr — a
 * quarter of it can be scuffed and it still reads, which is what a sticker on a
 * wall needs.
 */
import sharp from 'sharp'
import qr from 'qrcode-generator'
import fs from 'node:fs'

const DPI = 300
const PAGE_W = Math.round(8.5 * DPI)          // 2550
const PAGE_H = Math.round(11 * DPI)           // 3300

const W = Math.round(2.5 * DPI)               // 750
const H = Math.round(3.5 * DPI)               // 1050
const COLS = 3, ROWS = 3                      // nine a sheet
const GAP = Math.round(0.1 * DPI)

const CAT_W = Math.round(2.33 * DPI)          // 700, the art is 250x199
const CAT_H = Math.round(CAT_W * 199 / 250)   // 557
const QR_SIZE = Math.round(1.4 * DPI)         // 420

const OUT = 'art/stickers'
const URL = 'https://ccat-viewer.vercel.app'
fs.mkdirSync(OUT, { recursive: true })

/* Nine cats spread across the collection, not the first nine. */
const all = fs.readdirSync('public/v2/images').filter(f => /\.png$/i.test(f))
  .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))
const step = Math.floor(all.length / (COLS * ROWS))
const chosen = Array.from({ length: COLS * ROWS }, (_, i) => all[i * step])
console.log('  cats: ' + chosen.join(' '))

function qrPath(data, size) {
  const code = qr(0, 'Q')
  code.addData(data)
  code.make()
  const n = code.getModuleCount()
  const m = 2
  const unit = size / (n + m * 2)
  let d = ''
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (code.isDark(r, c))
        d += `M${((c + m) * unit).toFixed(2)} ${((r + m) * unit).toFixed(2)}` +
             `h${unit.toFixed(2)}v${unit.toFixed(2)}h-${unit.toFixed(2)}z`
  return d
}
const qrD = qrPath(URL, QR_SIZE)

const marginX = Math.round((PAGE_W - (COLS * W + (COLS - 1) * GAP)) / 2)
const marginY = Math.round((PAGE_H - (ROWS * H + (ROWS - 1) * GAP)) / 2)

const parts = []
let marks = ''

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c
    const x = marginX + c * (W + GAP)
    const y = marginY + r * (H + GAP)

    const cat = await sharp('public/v2/images/' + chosen[i])
      .resize(CAT_W, CAT_H, { kernel: 'nearest' })
      .png().toBuffer()

    parts.push({ input: cat, left: x + Math.round((W - CAT_W) / 2), top: y + 26 })

    /*
     * CUT MARKS RATHER THAN A PRINTED BORDER. A rule around each sticker has to
     * be cut exactly on, and any wobble leaves a black edge down one side. Short
     * corner marks give a blade something to line up against and leave nothing
     * behind when the cut is slightly off.
     */
    const t = 26
    for (const [mx, my, dx, dy] of [
      [x, y, 1, 0], [x, y, 0, 1],
      [x + W, y, -1, 0], [x + W, y, 0, 1],
      [x, y + H, 1, 0], [x, y + H, 0, -1],
      [x + W, y + H, -1, 0], [x + W, y + H, 0, -1],
    ]) marks += `<line x1="${mx}" y1="${my}" x2="${mx + dx * t}" y2="${my + dy * t}" stroke="#c8c8c8" stroke-width="2"/>`

    marks += `<g transform="translate(${x + (W - QR_SIZE) / 2}, ${y + 26 + CAT_H + 22})">` +
             `<path d="${qrD}" fill="#000000"/></g>`
  }
}

const overlay = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}">${marks}</svg>`)

await sharp({ create: { width: PAGE_W, height: PAGE_H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
  .composite([...parts, { input: overlay, left: 0, top: 0 }])
  .png().withMetadata({ density: DPI })
  .toFile(OUT + '/sticker-sheet.png')

console.log('wrote ' + OUT + '/sticker-sheet.png')
console.log('  ' + COLS * ROWS + ' a sheet at ' + (W / DPI) + ' x ' + (H / DPI) + ' inch')
console.log('  10 sheets = ' + COLS * ROWS * 10 + ' stickers')
console.log('  QR ' + (QR_SIZE / DPI) + ' inch, level Q')
