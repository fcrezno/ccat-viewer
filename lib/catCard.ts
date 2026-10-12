import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join } from 'path'
import { CELL_H, SHEET_W, TRACKING, cell, glyph, measure } from '@/lib/font'

/**
 * THE CAT CARD — a shareable picture of a cat after a fight.
 *
 * JP, 2026-10-12: "a shareable cat card after each fight, like Bundle Pepe's
 * /cards idea from the Space, but with your cat's real record. It fits SHARE ON X."
 *
 * 1200x630, the size X and Discord show as a large card. Drawn here rather than
 * screenshotted: the paper-blue checker every page stands on, a trading-card
 * frame round the cat, and every word in the game's OWN bitmap font (font.png,
 * the measured widths in lib/font) — the same stencil trick as
 * scripts/make-cradle-card.mjs: a glyph's alpha is the stencil, a flat colour is
 * poured through it, and it is scaled up by whole steps with no smoothing.
 */

export const CARD_W = 1200
export const CARD_H = 630

const INK = '#1a1a1a'
const GOLD = '#e0a72c'
const NAVY = '#000080'
const CHECK_A = '#d3dceb'
const CHECK_B = '#c9d3e4'

export type CardInput = {
  name: string
  type?: string
  wins?: number
  losses?: number
  /** "BEAT OLIVE IN THE TOWN", already worded. */
  line?: string
  won?: boolean
  /** 0..1 each, or absent for a cat whose numbers are not known here. */
  stats?: { hp: number; atk: number; def: number; spd: number }
  /** The cat's picture, already fetched. */
  art?: Buffer | null
}

let sheet: { data: Buffer; width: number } | null = null
async function fontSheet() {
  if (!sheet) {
    const { data, info } = await sharp(readFileSync(join(process.cwd(), 'public/game/font.png')))
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    sheet = { data, width: info.width }
  }
  return sheet
}

const hex = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))

/** One line of the bitmap font, in `color`, scaled by a whole number. */
export async function text(s: string, scale: number, color: string) {
  const f = await fontSheet()
  const w = Math.max(1, measure(s)), h = CELL_H
  const out = Buffer.alloc(w * h * 4)
  const [r, g, b] = hex(color)
  let pen = 0
  for (const ch of s) {
    const [left, width] = glyph(ch)
    const { x: cx, y: cy } = cell(ch)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < width; x++) {
        const a = f.data[((cy + y) * (f.width || SHEET_W) + cx + left + x) * 4 + 3]
        if (!a) continue
        const o = (y * w + pen + x) * 4
        out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a
      }
    }
    pen += width + TRACKING
  }
  const input = await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .resize(w * scale, h * scale, { kernel: 'nearest' }).png().toBuffer()
  return { input, w: w * scale, h: h * scale }
}

/** The biggest whole scale, up to `max`, at which `s` fits in `room`. */
export const fit = (s: string, room: number, max: number) => Math.max(1, Math.min(max, Math.floor(room / Math.max(1, measure(s)))))

export type Layer = { input: Buffer; left: number; top: number }

/** Text with a hard ink outline round its own shape: the countdown's look. */
export async function outlined(s: string, scale: number, color: string, left: number, top: number, edge = 3): Promise<Layer[]> {
  const ink = await text(s, scale, INK)
  const face = await text(s, scale, color)
  const ring: Layer[] = []
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]])
    ring.push({ input: ink.input, left: left + dx * edge, top: top + dy * edge })
  ring.push({ input: ink.input, left: left + edge + 1, top: top + edge + 1 })
  return [...ring, { input: face.input, left, top }]
}

export async function drawCard(c: CardInput): Promise<Buffer> {
  const layers: Layer[] = []
  const put = async (s: string, scale: number, color: string, left: number, top: number) => {
    const t = await text(s, scale, color)
    layers.push({ input: t.input, left, top })
    return t
  }

  // ── THE CARD, LEFT: a trading-card frame round the cat ──
  const FX = 56, FY = 36, FW = 430, FH = 558
  const ART = 382, AX = FX + 24, AY = FY + 24
  if (c.art) {
    try {
      const art = await sharp(c.art).resize(ART - 8, ART - 8, { fit: 'cover', position: 'top', kernel: 'nearest' }).png().toBuffer()
      layers.push({ input: art, left: AX + 4, top: AY + 4 })
    } catch { /* a picture that will not decode leaves the paper blank */ }
  }
  const name = c.name.toUpperCase()
  const ns = fit(name, FW - 40, 3)
  const nt = await text(name, ns, INK)
  layers.push({ input: nt.input, left: FX + Math.round((FW - nt.w) / 2), top: AY + ART + 10 })
  if (c.type) {
    const tt = await text(c.type, 2, NAVY)
    layers.push({ input: tt.input, left: FX + Math.round((FW - tt.w) / 2), top: AY + ART + 10 + nt.h + 2 })
  }

  // ── THE RIGHT: title, record, the last fight, the numbers ──
  const RX = 536, RW = CARD_W - RX - 48
  layers.push(...await outlined('CLANKER CATS', 4, GOLD, RX, 40))

  if (c.wins !== undefined || c.losses !== undefined) {
    await put('RECORD', 2, NAVY, RX, 156)
    const rec = `${c.wins ?? 0}W - ${c.losses ?? 0}L`
    await put(rec, fit(rec, RW, 4), INK, RX, 200)
  } else if (c.line) {
    // No record kept for this cat (a guest): the last fight takes the big line.
    await put('LAST FIGHT', 2, NAVY, RX, 156)
    await put(c.won ? 'WON!' : 'LOST', 4, c.won ? '#2f8f3a' : '#c0392b', RX, 200)
  }

  if (c.line) {
    const line = c.line.toUpperCase()
    await put(line, fit(line, RW, 2), c.won ? '#2f8f3a' : '#c0392b', RX, 312)
  }

  const bars: { svg: string }[] = []
  if (c.stats) {
    const rows: [string, number][] = [['HP', c.stats.hp], ['ATK', c.stats.atk], ['DEF', c.stats.def], ['SPD', c.stats.spd]]
    let y = 368
    for (const [label, v] of rows) {
      await put(label, 2, INK, RX, y)
      const bx = RX + 110, bw = RW - 110, bh = 24
      const fill = Math.round((bw - 8) * Math.max(0.04, Math.min(1, v)))
      bars.push({ svg: `<rect x="${bx}" y="${y + 12}" width="${bw}" height="${bh}" fill="#ffffff" stroke="${INK}" stroke-width="3"/><rect x="${bx + 4}" y="${y + 16}" width="${fill}" height="${bh - 8}" fill="${NAVY}"/>` })
      y += 40
    }
  }

  // A cat with no numbers here (a demo) gets the pitch in their place.
  if (!c.stats) {
    await put('PICK A CAT. FIGHT.', 2, INK, RX, 400)
    await put('NO WALLET. NO DOWNLOAD.', 2, INK, RX, 448)
  }

  const foot = 'PLAY FREE: CLANKERCATS.COM'
  const ft = await text(foot, 2, NAVY)
  layers.push({ input: ft.input, left: RX, top: CARD_H - 36 - ft.h })

  // ── UNDER IT ALL: the checker, the frame, the bars ──
  const tile = 64
  let checks = ''
  for (let y = 0; y < CARD_H; y += tile)
    for (let x = 0; x < CARD_W; x += tile)
      if (((x + y) / tile) % 2) checks += `<rect x="${x}" y="${y}" width="${tile}" height="${tile}" fill="${CHECK_B}"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" shape-rendering="crispEdges">
    <rect width="${CARD_W}" height="${CARD_H}" fill="${CHECK_A}"/>${checks}
    <rect x="${FX + 8}" y="${FY + 10}" width="${FW}" height="${FH}" fill="rgba(10,10,30,0.35)"/>
    <rect x="${FX}" y="${FY}" width="${FW}" height="${FH}" fill="${GOLD}" stroke="${INK}" stroke-width="4"/>
    <rect x="${FX + 14}" y="${FY + 14}" width="${FW - 28}" height="${FH - 28}" fill="#fdfdf8" stroke="${INK}" stroke-width="3"/>
    <rect x="${AX}" y="${AY}" width="${ART}" height="${ART}" fill="#e6e0d2" stroke="${INK}" stroke-width="8"/>
    <rect x="${RX - 24}" y="140" width="${RW + 40}" height="${CARD_H - 140 - 24}" fill="#c0c0c0" stroke="${INK}" stroke-width="3"/>
    <rect x="${RX - 20}" y="144" width="${RW + 32}" height="${CARD_H - 148 - 24}" fill="none" stroke="#ffffff" stroke-width="2"/>
    ${bars.map(b => b.svg).join('')}
  </svg>`

  return sharp(Buffer.from(svg)).composite(layers).png().toBuffer()
}
