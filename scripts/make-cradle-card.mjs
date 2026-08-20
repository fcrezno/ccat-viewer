/**
 * The Cat's Cradle embed card — public/cradle.png, 1200x800.
 *
 *   node scripts/make-cradle-card.mjs
 *
 * A Farcaster embed image must be 3:2. This one is drawn rather than screenshotted
 * so it stays sharp and can be regenerated when the app changes.
 *
 * THE TITLE IS THE GAME'S OWN BITMAP FONT, not an approximation of it. font.png is
 * a 256x144 sheet of 16x24 cells with per-glyph widths measured off the art, and
 * each letter is cut out and placed by those numbers — the same table the game and
 * the web app use.
 *
 * RECOLOURING A BITMAP FONT: the sheet is near-black ink on transparency, so a
 * tint (which multiplies) cannot lighten it. The glyph's ALPHA is taken as a
 * stencil instead and a flat colour is poured through it.
 *
 * The cats are composed from the drop's own layer art, so the card shows cats that
 * belong to nobody rather than putting somebody's token on a marketing image.
 */
import sharp from 'sharp'
import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const W = 1200, H = 800
const BG = '#0b0b13'
const PAPER = '#f2eee3'

const FONT = 'public/game/font.png'
const META = JSON.parse(readFileSync('lib/font.ts', 'utf8').match(/METRICS[^=]*=\s*(\[[\s\S]*?\n\])/)[1]
  .replace(/\[\s*(\d+),\s*(\d+)\s*\],?/g, '[$1,$2],').replace(/,\s*\]$/, ']'))

const CELL_W = 16, CELL_H = 24, COLS = 16, FIRST = 32, TRACKING = 1

const glyph = ch => META[ch.charCodeAt(0) - FIRST] ?? META[0]
const cellOf = ch => {
  const i = Math.max(0, ch.charCodeAt(0) - FIRST)
  return { x: (i % COLS) * CELL_W, y: Math.floor(i / COLS) * CELL_H }
}
const measure = s => [...s].reduce((n, c) => n + glyph(c)[1] + TRACKING, 0) - TRACKING

/** One line of the game's font, as an RGBA buffer of the given colour. */
async function text(str, scale, colour) {
  const w = measure(str) * scale
  const h = CELL_H * scale
  const parts = []
  let pen = 0

  for (const ch of str) {
    const [left, gw] = glyph(ch)
    const c = cellOf(ch)
    if (gw > 0 && ch !== ' ') {
      // Cut the glyph, scale it with nearest so the pixels stay square, then use
      // its alpha as a stencil for a flat colour.
      const cut = await sharp(FONT)
        .extract({ left: c.x + left, top: c.y, width: gw, height: CELL_H })
        .resize(gw * scale, CELL_H * scale, { kernel: 'nearest' })
        .ensureAlpha()
        .toBuffer()

      const alpha = await sharp(cut).extractChannel(3).toBuffer()
      const solid = await sharp({
        create: { width: gw * scale, height: CELL_H * scale, channels: 3, background: colour },
      }).png().toBuffer()
      const inked = await sharp(solid).joinChannel(alpha).png().toBuffer()

      parts.push({ input: inked, left: pen, top: 0 })
    }
    pen += (gw + TRACKING) * scale
  }

  return {
    buf: await sharp({ create: { width: Math.max(1, w), height: h, channels: 4, background: '#00000000' } })
      .composite(parts).png().toBuffer(),
    width: w, height: h,
  }
}

/** A cat that belongs to nobody, composed from the drop's layers. */
async function cat(seed) {
  const pick = (dir, n) => {
    const files = readdirSync(join('layers', dir)).filter(f => f.endsWith('.png'))
    return join('layers', dir, files[n % files.length])
  }
  const base = readFileSync(pick('Background', seed * 7))
  const rest = [pick('Body', seed * 13), pick('Face', seed * 29)].map(p => ({ input: readFileSync(p) }))
  return sharp(base).composite(rest).png().toBuffer()
}

const run = async () => {
  const layers = []

  // Three cats across the lower half, framed the way the app frames them.
  const CW = 300, CH = 239
  for (let i = 0; i < 3; i++) {
    const art = await sharp(await cat(i + 3)).resize(CW, CH, { kernel: 'nearest' }).toBuffer()
    const framed = await sharp({
      create: { width: CW + 8, height: CH + 8, channels: 4, background: i === 1 ? '#ffd166' : '#21212f' },
    }).composite([{ input: art, left: 4, top: 4 }]).png().toBuffer()
    layers.push({ input: framed, left: 60 + i * 370, top: 470 })
  }

  const title = await text("CAT'S CRADLE", 7, '#f0f0f5')
  layers.push({ input: title.buf, left: Math.round((W - title.width) / 2), top: 120 })

  const sub = await text('A PREVIEW OF CLANKER CATS', 3, '#8b5cf6')
  layers.push({ input: sub.buf, left: Math.round((W - sub.width) / 2), top: 300 })

  /*
   * THE SLOGAN, in his own words and his own casing.
   *
   * Lowercase on purpose — it is set that way on the game's title screen, and the
   * line reads as an aside rather than a shout, which is the point of it.
   */
  const tag = await text('playing with bots has never been this fun.', 2, '#7a7a95')
  layers.push({ input: tag.buf, left: Math.round((W - tag.width) / 2), top: 380 })

  await sharp({ create: { width: W, height: H, channels: 4, background: BG } })
    .composite(layers)
    .png()
    .toFile('public/cradle.png')

  const m = await sharp('public/cradle.png').metadata()
  console.log(`public/cradle.png — ${m.width}x${m.height}`)
}

run()
