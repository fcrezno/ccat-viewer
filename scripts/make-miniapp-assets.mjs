/**
 * Generates the Farcaster Mini App assets at the sizes the spec requires.
 *
 *   icon.png    1024x1024, no alpha   (app directory listing)
 *   splash.png  200x200               (shown while the app boots)
 *   image.png   1200x800, 3:2         (the cast embed)
 *   hero.png    1200x630, 1.91:1      (app store hero)
 *
 * Built from the real layers so the branding is the actual art, not a mockup.
 * Run after prep-layers.mjs:  node scripts/make-miniapp-assets.mjs
 */
import sharp from 'sharp'
import { readdirSync, existsSync } from 'fs'
import { join } from 'path'

const LAYERS = 'layers'
const OUT    = 'public'
const INK    = { r: 10, g: 10, b: 20, alpha: 1 }

const pick = (dir, name) => {
  const f = readdirSync(join(LAYERS, dir)).find(f => f.split('#')[0] === name)
  if (!f) throw new Error(`layer not found: ${dir}/${name}`)
  return join(LAYERS, dir, f)
}

/** Flatten one cat: background + body + face. */
const cat = (bg, body, face) =>
  sharp(pick('Background', bg))
    .composite([{ input: pick('Body', body) }, { input: pick('Face', face) }])
    .png().toBuffer()

/** Dominant colour of a flat background layer, for seamless padding. */
async function bgColour(name) {
  const { data } = await sharp(pick('Background', name)).resize(1, 1).raw().toBuffer({ resolveWithObject: true })
  return { r: data[0], g: data[1], b: data[2], alpha: 1 }
}

if (!existsSync(LAYERS)) {
  console.error('❌ layers/ not found — run prep-layers.mjs first.')
  process.exit(1)
}

// ── icon: one cat, padded to square in its own background colour ────────────
const ICON_BG = 'Purple'
const iconCat = await cat(ICON_BG, 'King of the jungle', 'uwu')
const pad     = await bgColour(ICON_BG)

await sharp(iconCat)
  .resize(1024, 815, { kernel: 'nearest' })
  .extend({ top: 104, bottom: 105, left: 0, right: 0, background: pad })
  .flatten({ background: pad })          // strip alpha — the spec disallows it
  .png()
  .toFile(join(OUT, 'icon.png'))
console.log('icon.png    1024x1024  (no alpha)')

// ── splash: same cat, small ─────────────────────────────────────────────────
await sharp(await sharp(iconCat).resize(200, 159, { kernel: 'nearest' }).toBuffer())
  .extend({ top: 20, bottom: 21, left: 0, right: 0, background: pad })
  .flatten({ background: pad })
  .png()
  .toFile(join(OUT, 'splash.png'))
console.log('splash.png  200x200')

// ── embed: a row of cats over the mint headline, 3:2 ────────────────────────
const ROW = [
  ['yellow',        'crimson',            'huh'],
  ['Beach Classic', 'Tom',                'hehe'],
  ['teal',          'Gleep',              'Aliem'],
  ['navy',          'White cat',          'silly'],
  ['orange',        'King of the jungle', 'Korin'],
]

async function strip(width, cellW) {
  const cells = []
  for (const [bg, body, face] of ROW) {
    const h = Math.round(cellW * 199 / 250)
    cells.push(await sharp(await cat(bg, body, face)).resize(cellW, h, { kernel: 'nearest' }).png().toBuffer())
  }
  return cells
}

const text = (w, h, title, sub, kicker) => Buffer.from(
  `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
     <style>
       .t{font-family:'Segoe UI',Roboto,sans-serif;font-weight:800;fill:#ffffff}
       .s{font-family:'Consolas','Courier New',monospace;fill:#b9a6ea}
       .k{font-family:'Consolas','Courier New',monospace;fill:#7c3aed;letter-spacing:6px}
     </style>
     <text class="k" x="50%" y="${h * 0.30}" text-anchor="middle" font-size="${h * 0.075}">${kicker}</text>
     <text class="t" x="50%" y="${h * 0.60}" text-anchor="middle" font-size="${h * 0.235}">${title}</text>
     <text class="s" x="50%" y="${h * 0.85}" text-anchor="middle" font-size="${h * 0.095}">${sub}</text>
   </svg>`)

// embed 1200x800
{
  const W = 1200, H = 800, cellW = 240
  const cells = await strip(W, cellW)
  const cellH = Math.round(cellW * 199 / 250)
  const band  = await sharp({ create: { width: W, height: H, channels: 4, background: INK } })
    .composite([
      ...cells.map((input, i) => ({ input, left: i * cellW, top: 0 })),
      /*
       * The subtitle is the offer, so it has to move when the offer does — it
       * said "one per Farcaster ID" for a while after holders could take a
       * second, and it is the largest thing in a cast embed.
       *
       * "Farcaster" is dropped to keep one line. The sub is monospace at
       * H * 0.095 ≈ 58px, whose advance is about 0.55em, so roughly 37
       * characters span the 1200px card; the full wording ran to 42 and would
       * have overhung both edges.
       */
      { input: text(W, H - cellH, 'FREE MINT', 'one per ID, one more for holders', 'CLANKER CATS V2'), left: 0, top: cellH },
    ])
    .png().toBuffer()
  await sharp(band).toFile(join(OUT, 'image.png'))
  console.log('image.png   1200x800   (3:2 embed)')
}

// hero 1200x630
{
  const W = 1200, H = 630, cellW = 240
  const cells = await strip(W, cellW)
  const cellH = Math.round(cellW * 199 / 250)
  await sharp({ create: { width: W, height: H, channels: 4, background: INK } })
    .composite([
      ...cells.map((input, i) => ({ input, left: i * cellW, top: 0 })),
      { input: text(W, H - cellH, '1111 CATS', 'free on Base', 'CLANKER CATS V2'), left: 0, top: cellH },
    ])
    .png().toFile(join(OUT, 'hero.png'))
  console.log('hero.png    1200x630  (1.91:1)')
}

console.log('\n✅ assets written to public/')
