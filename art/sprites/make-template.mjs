/**
 * The sprite template and its guide, for drawing enemies on a GBC-era grid.
 *
 *   node art/sprites/make-template.mjs
 *
 * Two files, both 56x56 and both TRANSPARENT, so the guide can be laid over
 * the template as its own layer in Krita and switched off before export:
 *
 *   sprite-template.png   empty canvas — draw here
 *   sprite-guide.png      tile grid, centre line, floor line
 *   sprite-palette.png    the four-shade ramp, as swatches
 *   sprite-guide-x8.png   the guide at 8x, legible on screen
 *
 * 56x56 is the Game Boy Color front-sprite size: seven 8x8 tiles square. The
 * grid matters because the hardware drew in tiles, and art laid out on it is
 * what makes the era read — not the palette alone.
 */
import sharp from 'sharp'

const S = 56, TILE = 8, OUT = 'art/sprites'

/** Four shades: the GBC gave a sprite one palette of four entries. */
const RAMP = ['#f8f8f8', '#a8a8a8', '#585858', '#101010']

const svg = (w, h, body) =>
  Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">${body}</svg>`)

// ── the guide ───────────────────────────────────────────────────────────────
let g = ''
for (let i = TILE; i < S; i += TILE) {
  g += `<line x1="${i}" y1="0" x2="${i}" y2="${S}" stroke="#00a0ff" stroke-opacity="0.35" stroke-width="1"/>`
  g += `<line x1="0" y1="${i}" x2="${S}" y2="${i}" stroke="#00a0ff" stroke-opacity="0.35" stroke-width="1"/>`
}
// Centre line: sprites of this era are near-symmetrical about it.
g += `<line x1="28" y1="0" x2="28" y2="${S}" stroke="#ff00a0" stroke-opacity="0.55" stroke-width="1"/>`
// Floor: the creature stands on the last tile boundary rather than the edge,
// which is what stops it looking like it is falling out of the frame.
g += `<line x1="0" y1="48" x2="${S}" y2="48" stroke="#ffb000" stroke-opacity="0.7" stroke-width="1"/>`
g += `<rect x="0" y="0" width="${S}" height="${S}" fill="none" stroke="#00a0ff" stroke-opacity="0.6" stroke-width="1"/>`

await sharp(svg(S, S, g)).png().toFile(`${OUT}/sprite-guide.png`)
await sharp(svg(S, S, g)).resize(S * 8, S * 8, { kernel: 'nearest' }).png().toFile(`${OUT}/sprite-guide-x8.png`)

// ── the empty canvas ────────────────────────────────────────────────────────
await sharp({ create: { width: S, height: S, channels: 4,
  background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toFile(`${OUT}/sprite-template.png`)

// ── the ramp, as swatches ───────────────────────────────────────────────────
const SW = 64
await sharp(svg(SW * RAMP.length, SW,
  RAMP.map((c, i) => `<rect x="${i * SW}" y="0" width="${SW}" height="${SW}" fill="${c}"/>`).join('')))
  .png().toFile(`${OUT}/sprite-palette.png`)

// ── a Krita-loadable palette ────────────────────────────────────────────────
const gpl = ['GIMP Palette', 'Name: GBC 4-shade', 'Columns: 4', '#',
  ...RAMP.map((c, i) => {
    const [r, gr, b] = [1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16))
    return `${String(r).padStart(3)} ${String(gr).padStart(3)} ${String(b).padStart(3)}\tshade ${i}`
  })].join('\n') + '\n'
;(await import('fs')).writeFileSync(`${OUT}/gbc-4shade.gpl`, gpl)

console.log(`${S}x${S} (7x7 tiles of ${TILE})  ramp ${RAMP.join(' ')}`)
console.log('wrote sprite-template.png sprite-guide.png sprite-guide-x8.png sprite-palette.png gbc-4shade.gpl')
