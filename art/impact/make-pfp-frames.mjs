/**
 * The effect templates at PFP size: 250x200, one document per effect.
 *
 *   node art/impact/make-pfp-frames.mjs
 *
 * JP: "why dont we make them all 250x200 ... its a rounder number."
 *
 * ── WHY THIS IS THE RIGHT SIZE ───────────────────────────────────────────────
 *
 * A cat is built from layer art at 250x199 and minted at 1000x796 — exactly four
 * times, no rounding. In a fight the card is fluid and lands at 132x105 on a
 * 375px phone, so the cat runs at 0.53 of its native size.
 *
 * The 48x48 templates had a real fault because of that: the cat was being
 * squeezed to about half size while the effect was not, so the effect's pixels
 * came out roughly twice the size of the cat's. Drawn at 250 wide, both are
 * squeezed by the same amount and the two finally share a pixel grid.
 *
 * 200 rather than 199 is JP's call and it costs nothing. The one row of
 * difference is half a pixel once the card scales, 200 is already the project's
 * other sprite height (public/sprites/enemies, splash.png), and an impact effect
 * has transparent edges, so an extra row at the bottom cannot show.
 *
 * ── THE CAT IS IN THE DOCUMENT ───────────────────────────────────────────────
 *
 * The 48x48 guide drew a circle labelled "the cat's body", and measuring proved
 * it was a lie — the cat is bigger than that whole cell, so "break out of the
 * body" was advice that could not be followed.
 *
 * At this size the guide does not have to describe the cat, because THE CAT CAN
 * BE IN THE FILE. A real one sits on its own layer at 40%, so the effect is drawn
 * over the thing it hits and the question answers itself.
 *
 * ── THE ROUGHS ARE PLACEHOLDERS AND LOOK LIKE IT ─────────────────────────────
 *
 * The reference frames are the 48px roughs enlarged four times, so they are
 * visibly chunky against a 250-wide canvas. That is deliberate: they carry the
 * SHAPE and the timing — grow, peak, break — without pretending to be art at this
 * resolution. Redrawing them properly at 250x200 is the job, and it is JP's.
 */
import sharp from 'sharp'
import fs from 'node:fs'
import { ora } from './ora.mjs'

const W = 250, H = 200
const SRC = 48, FRAMES = 5, UP = 4
const OUT = 'art/impact/pfp'
const CARD = { r: 0x12, g: 0x12, b: 0x1c, alpha: 1 }
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }

const SHEETS = [
  ['impact', ['WEAK', 'HIT', 'CRIT']],
  ['attack-physical', ['SLASH', 'CROSS', 'STRIKE', 'PUMMEL', 'PIERCE']],
  ['attack-magic', ['ZOOMIES', 'FORGE', 'COOLANT', 'SIGNAL', 'GLITCH', 'CRYO', 'SCRAP', 'STRAY']],
]

fs.mkdirSync(OUT, { recursive: true })

const blank = (bg = CLEAR) =>
  sharp({ create: { width: W, height: H, channels: 4, background: bg } }).png().toBuffer()

/*
 * A REAL CAT, AT EXACTLY A QUARTER OF THE MINTED IMAGE.
 *
 * 1000x796 divides by four with nothing left over, so this is a clean reduction
 * rather than a resample that invents colours. It lands 199 tall in a 200 tall
 * document and sits at the top; the spare row is at the bottom, where an effect's
 * transparent edge is.
 */
const catFile = (() => {
  const all = fs.readdirSync('public/v2/images').filter(f => /\.png$/i.test(f)).sort()
  return 'public/v2/images/' + all[Math.floor(all.length / 2)]
})()

const cat = await sharp({ create: { width: W, height: H, channels: 4, background: CLEAR } })
  .composite([{ input: await sharp(catFile).resize(250, 199, { kernel: 'nearest' }).png().toBuffer(), left: 0, top: 0 }])
  .png().toBuffer()

// ── the guide ───────────────────────────────────────────────────────────────
/*
 * No body circle any more — the cat layer does that job properly. What is left is
 * the frame edge and the centre, which are the things a drawing still needs and
 * which the art itself cannot show.
 *
 * Every rect is inset half a pixel. A stroke straddles its own path, so a border
 * on the boundary loses its outer half to clipping — which is exactly how the
 * 48px guide shipped with only two of its four sides.
 */
const guide = await sharp(Buffer.from(
  '<svg width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">' +
  '<rect x="0.5" y="0.5" width="' + (W - 1) + '" height="' + (H - 1) + '" fill="none" stroke="#00a0ff" stroke-opacity="0.55" stroke-width="1"/>' +
  // The cat's own bottom edge, since the document is one row taller than it.
  '<line x1="0" y1="198.5" x2="' + W + '" y2="198.5" stroke="#00a0ff" stroke-opacity="0.3" stroke-width="1"/>' +
  '<line x1="' + (W / 2 - 0.5) + '" y1="0" x2="' + (W / 2 - 0.5) + '" y2="' + H + '" stroke="#ff00a0" stroke-opacity="0.4" stroke-width="1"/>' +
  '<line x1="0" y1="' + (H / 2 - 0.5) + '" x2="' + W + '" y2="' + (H / 2 - 0.5) + '" stroke="#ff00a0" stroke-opacity="0.4" stroke-width="1"/>' +
  '</svg>')).png().toBuffer()

/*
 * The guide is written out as well, so pack-frames can tell a pristine one from a
 * drawn-on one without rebuilding it from a second copy of this code. Two copies
 * of a drawing routine drift, and the drift would show up as a false warning.
 */
fs.writeFileSync(OUT + '/_guide.png', guide)

let made = 0
for (const [sheet, rows] of SHEETS) {
  const src = 'art/impact/' + sheet + '-rough.png'

  for (const [row, name] of rows.entries()) {
    const layers = [{ name: 'GUIDE - HIDE BEFORE EXPORT', png: guide }]

    for (let f = FRAMES - 1; f >= 0; f--) {
      const cell = await sharp(src)
        .extract({ left: f * SRC, top: row * SRC, width: SRC, height: SRC })
        .resize(SRC * UP, SRC * UP, { kernel: 'nearest' }).png().toBuffer()

      const ref = await sharp({ create: { width: W, height: H, channels: 4, background: CLEAR } })
        .composite([{ input: cell, left: Math.round((W - SRC * UP) / 2), top: Math.round((H - SRC * UP) / 2) }])
        .png().toBuffer()

      layers.push({ name: 'FRAME ' + (f + 1), png: await blank(), visible: f === 0 })
      layers.push({ name: 'ref ' + (f + 1), png: ref, opacity: 0.35, visible: false })
    }

    layers.push({ name: 'CAT - REFERENCE', png: cat, opacity: 0.4 })
    layers.push({ name: 'BACKGROUND', png: await blank(CARD) })

    const merged = await sharp({ create: { width: W, height: H, channels: 4, background: CARD } })
      .composite([{ input: cat }, { input: guide }]).png().toBuffer()

    fs.writeFileSync(OUT + '/' + name.toLowerCase() + '.ora',
      ora({ width: W, height: H, layers, merged }))
    made++
  }
}

console.log('wrote ' + made + ' documents in ' + OUT + ' — ' + W + 'x' + H + ', ' + (FRAMES * 2 + 3) + ' layers each')
console.log('cat reference taken from ' + catFile)
