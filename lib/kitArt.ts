import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join } from 'path'
import { CELL_H, measure } from '@/lib/font'
import { fit, outlined, type Layer } from '@/lib/catCard'

/**
 * THE MEME KIT'S PICTURES (app/kit, app/api/kit). JP, 2026-10-12: "a meme kit
 * page on the site" — so posting about Clanker Cats takes ten seconds. Drawn in
 * the game's own bitmap font with the countdown's ink outline, on transparency
 * or on the checker every page stands on.
 */

const WHITE = '#f0f0f5'
const GOLD = '#ffd166'
const LOGO = '#e0a72c'
const CHECK_A = '#d3dceb'
const CHECK_B = '#c9d3e4'

const blank = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })

function checker(w: number, h: number) {
  const tile = 64
  let r = ''
  for (let y = 0; y < h; y += tile)
    for (let x = 0; x < w; x += tile)
      if (((x + y) / tile) % 2) r += `<rect x="${x}" y="${y}" width="${tile}" height="${tile}" fill="${CHECK_B}"/>`
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" shape-rendering="crispEdges"><rect width="${w}" height="${h}" fill="${CHECK_A}"/>${r}</svg>`)
}

/** Lines on transparency, stacked and centred: white then gold, as the announcer says them. */
export async function drawWords(lines: readonly string[], colors: readonly string[] = [WHITE, GOLD], room = 1100, max = 6): Promise<Buffer> {
  const scale = Math.min(max, Math.min(...lines.map(l => fit(l, room, max))))
  const pad = 16, gap = 6
  const w = Math.max(...lines.map(l => measure(l))) * scale + pad * 2
  const h = lines.length * CELL_H * scale + (lines.length - 1) * gap + pad * 2
  const layers: Layer[] = []
  for (const [i, l] of lines.entries()) {
    const left = Math.round((w - measure(l) * scale) / 2)
    layers.push(...await outlined(l, scale, colors[i % colors.length], left, pad + i * (CELL_H * scale + gap), Math.max(2, scale)))
  }
  return blank(w, h).composite(layers).png().toBuffer()
}

export const drawLogo = () => drawWords(['CLANKER CATS'], [LOGO])

/**
 * The template: the checker, two cats, the VS between them, and the line as top
 * and bottom text — the shape of every meme people already know how to read.
 */
export async function drawMeme(lines: readonly string[], arts: [Buffer | null, Buffer | null]): Promise<Buffer> {
  const W = 1200, H = 675, CAT = 340, Y = 168
  const layers: Layer[] = []
  const xs = [110, W - 110 - CAT]
  for (const [i, art] of arts.entries()) {
    const frame = await sharp({ create: { width: CAT, height: CAT, channels: 4, background: '#1a1a1a' } }).png().toBuffer()
    layers.push({ input: frame, left: xs[i], top: Y })
    const paper = await sharp({ create: { width: CAT - 16, height: CAT - 16, channels: 4, background: '#e6e0d2' } }).png().toBuffer()
    layers.push({ input: paper, left: xs[i] + 8, top: Y + 8 })
    if (art) {
      try {
        const pic = await sharp(art).resize(CAT - 16, CAT - 16, { fit: 'cover', position: 'top', kernel: 'nearest' }).png().toBuffer()
        layers.push({ input: pic, left: xs[i] + 8, top: Y + 8 })
      } catch { /* leave the paper */ }
    }
  }
  try {
    const vs = await sharp(readFileSync(join(process.cwd(), 'public/game/vs.png'))).trim().toBuffer({ resolveWithObject: true })
    const k = 3
    const big = await sharp(vs.data).resize(vs.info.width * k, vs.info.height * k, { kernel: 'nearest' }).png().toBuffer()
    layers.push({ input: big, left: Math.round((W - vs.info.width * k) / 2), top: Math.round(Y + CAT / 2 - (vs.info.height * k) / 2) })
  } catch { /* no VS is still a meme */ }

  const top = await drawWords([lines[0]], [WHITE], W - 80, 5)
  const tm = await sharp(top).metadata()
  layers.push({ input: top, left: Math.round((W - (tm.width ?? 0)) / 2), top: 12 })
  if (lines[1]) {
    const bottom = await drawWords([lines[1]], [GOLD], W - 80, 5)
    const bm = await sharp(bottom).metadata()
    layers.push({ input: bottom, left: Math.round((W - (bm.width ?? 0)) / 2), top: H - (bm.height ?? 0) - 10 })
  }
  return sharp(checker(W, H)).composite(layers).png().toBuffer()
}
