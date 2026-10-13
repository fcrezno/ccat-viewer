/**
 * OLD-WEB GIF BANNERS for the Mosh tokens (and a house ad for Clanker Cats).
 *
 *   node scripts/make-banners.mjs [SYM ...]   -> public/flyers/<sym>.gif          468x60, the loop
 *                                                public/flyers/<sym>-story.gif    468x60, the little film
 *                                                public/flyers/<sym>-btn.gif      the micro button (88x31)
 *                                                public/flyers/<sym>-250.gif      the square pop-up
 *                                                public/flyers/<sym>-125.gif      the square button
 *
 * JP, 2026-10-12: "now i want to start making gif banners representing other
 * mosh tokens", after magneticdogz.neocities.org's old web banners — flashing
 * words, sparkles, CLICK HERE!, a bevelled frame — then the Web Design Museum's
 * "Web Banners in the 90s" ("use these as well"): the story banner (AT&T's
 * "Have you ever clicked your mouse right HERE? YOU WILL.") and the 88x31 micro
 * button ("Netscape Now!", "Made with Macintosh").
 *
 * Words are in the game's own bitmap font (font.png and the measured widths in
 * lib/font.ts), poured through the glyph's alpha the way make-cradle-card.mjs
 * does it — except on the 88x31, where the type is tiny Verdana, as it was.
 * Logos are each token's own. Frames are drawn with sharp and joined into a GIF
 * by ffmpeg, one palette for the whole loop.
 */
import sharp from 'sharp'
import { readFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'

const FFMPEG = 'C:/Users/JPDom/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe'
const OUT = 'public/flyers'
const W = 468, H = 60, FPS = 10, FRAMES = 48

const TOKENS = [
  { sym: 'BUN', name: 'BUNDLE CAT', logo: 'https://cdn.dexscreener.com/cms/images/Qg8DtP-7cTLYq_Vb?width=800&height=800&quality=95&format=auto',
    lines: ['THE MOSH OG', 'ON ROBINHOOD CHAIN', 'PERMANENT AI MARKET MAKING'],
    story: ['FAIR LAUNCH?', 'AI MARKET MAKERS?', 'BUNDLE CAT.'] },
  { sym: 'BPEPE', name: 'BUNDLE PEPE', logo: 'https://cdn.dexscreener.com/cms/images/MfVMh7A5FAkzsvlN?width=800&height=800&quality=95&format=auto',
    lines: ['FEELS GOOD MAN', 'COMMUNITY BURNS DAILY', 'ON ROBINHOOD CHAIN'],
    story: ['FEELING BAD?', 'FEELS GOOD MAN.'] },
  // ALF is orange; his logo's green backdrop would make the stripes green.
  { sym: 'ALF', name: 'AGENTIC LIQUID FUND', color: [214, 120, 40], logo: 'https://cdn.dexscreener.com/cms/images/DgDEFaqAW5i5dN0j?width=800&height=800&quality=95&format=auto',
    lines: ['AGENTS AT WORK', 'ON ROBINHOOD CHAIN', 'LAUNCHED ON MOSH'],
    story: ['WHO RUNS THE FUND?', 'THE AGENTS DO.'] },
  // JP, 2026-10-12: "do one for king bork as well". A game on Robinhood Chain (BORK
  // 0x34b662ad45328a308300978dfbe8328066f3824c); the lines are the site's own words.
  { sym: 'BORK', name: 'KING BORK', site: 'KINGBORK.FUN', color: [176, 32, 44], logo: 'https://kingbork.fun/assets/king-bork-icon.png',
    lines: ['PICK A DISH', 'DODGE THE POISON', 'KNOW WHEN TO BANK'],
    story: ['A LITTLE GREED.', 'A LOT OF SNACKS.'] },
  // THE HOUSE AD — Clanker Cats itself, after AT&T's first banner (1994).
  { sym: 'CLKCAT', name: 'CLANKER CATS', ticker: 'CLANKER CATS', site: 'CLANKERCATS.COM', color: [0, 0, 128], button: 'PLAY FREE',
    logo: 'https://clankercats.com/api/cat-art?seed=52592', microTop: 'CLANKER', micro: 'PLAY!',
    lines: ['A BROWSER GAME', 'NO WALLET NEEDED', 'PICK A CAT. FIGHT.'],
    story: ['HAVE YOU EVER CLANKED A CAT?', 'YOU WILL.'] },
]

// ── the bitmap font ──────────────────────────────────────────────────────────
const META = JSON.parse(readFileSync('lib/font.ts', 'utf8').match(/METRICS[^=]*=\s*(\[[\s\S]*?\n\])/)[1]
  .replace(/\[\s*(\d+),\s*(\d+)\s*\],?/g, '[$1,$2],').replace(/,\s*\]$/, ']'))
const CELL_W = 16, CELL_H = 24, COLS = 16, FIRST = 32, TRACKING = 1
const glyph = ch => META[ch.charCodeAt(0) - FIRST] ?? META[0]
const measure = s => [...s].reduce((n, c) => n + glyph(c)[1] + TRACKING, 0) - TRACKING
const sheet = await sharp('public/game/font.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true })

async function text(s, scale, color) {
  const w = Math.max(1, measure(s)), h = CELL_H
  const out = Buffer.alloc(w * h * 4)
  const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16))
  let pen = 0
  for (const ch of s) {
    const [left, width] = glyph(ch)
    const i = Math.max(0, ch.charCodeAt(0) - FIRST)
    const cx = (i % COLS) * CELL_W, cy = Math.floor(i / COLS) * CELL_H
    for (let y = 0; y < h; y++) for (let x = 0; x < width; x++) {
      const a = sheet.data[((cy + y) * sheet.info.width + cx + left + x) * 4 + 3]
      if (!a) continue
      const o = (y * w + pen + x) * 4
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a
    }
    pen += width + TRACKING
  }
  const input = await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .resize(Math.round(w * scale), Math.round(h * scale), { kernel: 'nearest' }).png().toBuffer()
  return { input, w: Math.round(w * scale), h: Math.round(h * scale) }
}
/** Text with a 1px ink outline: readable on any stripe. */
async function inked(s, scale, color, left, top) {
  const ink = await text(s, scale, '#101018'), face = await text(s, scale, color)
  const layers = []
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) layers.push({ input: ink.input, left: left + dx, top: top + dy })
  layers.push({ input: face.input, left, top })
  return { layers, w: face.w, h: face.h }
}
/** The biggest quarter-step scale, up to `max`, at which `s` fits in `room`. */
const fit = (s, room, max) => Math.max(0.5, Math.min(max, Math.floor((room / measure(s)) * 4) / 4))

// ── shared ───────────────────────────────────────────────────────────────────
const hex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
const ease = t => 1 - (1 - t) ** 3
const tickerOf = tok => tok.ticker ?? '$' + tok.sym
const SPARKS = Array.from({ length: 9 }, (_, i) => [(i * 97 + 60) % (W - 80) + 70, (i * 37) % 46 + 6, i * 5])

async function logoOf(tok, size) {
  const raw = Buffer.from(await (await fetch(tok.logo)).arrayBuffer())
  const { dominant } = await sharp(raw).stats()
  return {
    png: await sharp(raw).resize(size, size, { fit: 'cover', position: 'top' }).png().toBuffer(),
    base: tok.color ?? [dominant.r, dominant.g, dominant.b],
  }
}
function frameDir(name) {
  const d = join(tmpdir(), 'banner-' + name)
  rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true })
  return d
}
const frame = (dir, f) => join(dir, 'f' + String(f).padStart(3, '0') + '.png')
function toGif(dir, out, fps) {
  mkdirSync(OUT, { recursive: true })
  const r = spawnSync(FFMPEG, ['-v', 'error', '-y', '-framerate', String(fps), '-i', join(dir, 'f%03d.png'),
    '-filter_complex', '[0]split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=none',
    '-loop', '0', out], { stdio: 'inherit' })
  rmSync(dir, { recursive: true, force: true })
  if (r.status) throw new Error('ffmpeg failed for ' + out)
  console.log('ok', out)
}

// ── 1. THE LOOP: logo slides in, ticker types, taglines turn, CLICK HERE! blinks ──
async function banner(tok) {
  const { png: logo, base } = await logoOf(tok, 48)
  const dark = mix(base, [10, 10, 24], 0.65)
  const light = mix(base, [255, 255, 255], 0.35)
  const flash = ['#ffd166', '#ffffff', hex(light)]
  const dir = frameDir(tok.sym)
  const ticker = tickerOf(tok)
  const tScale = fit(ticker, 200, 1.5)
  const TX = 70

  for (let f = 0; f < FRAMES; f++) {
    const shift = (f * 2) % 24
    let stripes = ''
    for (let x = -60; x < W + 60; x += 24) stripes += `<polygon points="${x + shift},0 ${x + shift + 12},0 ${x + shift - 48},60 ${x + shift - 60},60" fill="${hex(mix(dark, base, 0.25))}"/>`
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" shape-rendering="crispEdges">
      <rect width="${W}" height="${H}" fill="${hex(dark)}"/>${stripes}
      <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#ffffff" stroke-width="1"/>
      <rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" fill="none" stroke="${hex(light)}" stroke-width="1"/>
      <rect x="${W - 1.5}" y="0" width="1" height="${H}" fill="#101018"/><rect x="0" y="${H - 1.5}" width="${W}" height="1" fill="#101018"/>
      <rect x="4" y="5" width="54" height="50" fill="#101018"/>
    </svg>`
    const layers = []

    const lx = Math.round(-60 + 67 * ease(Math.min(1, f / 8)))
    layers.push({ input: logo, left: lx, top: 6 + (f > 8 && Math.floor(f / 4) % 2 ? 1 : 0) })

    const shown = Math.min(ticker.length, Math.floor(f / 1.5))
    if (shown > 0) {
      const c = f < 12 ? '#ffffff' : flash[Math.floor(f / 3) % flash.length]
      layers.push(...(await inked(ticker.slice(0, shown), tScale, c, TX, 4)).layers)
    }

    const sub = f < 12 ? tok.name : tok.lines[Math.floor((f - 12) / 12) % tok.lines.length]
    if (f > 6) layers.push(...(await inked(sub, 1, '#ffffff', TX, 36)).layers)

    if (f >= 10 && Math.floor(f / 4) % 2 === 0) {
      const ck = await inked('CLICK HERE!', 1, '#ff5a5a', 0, 0)
      layers.push(...ck.layers.map(l => ({ ...l, left: l.left + W - ck.w - 10, top: l.top + 6 })))
    }
    const site = await inked(tok.site ?? 'MOSH.TRADE', 1, '#9fe8ff', 0, 0)
    layers.push(...site.layers.map(l => ({ ...l, left: l.left + W - site.w - 10, top: l.top + 32 })))

    let sparks = ''
    for (const [x, y, off] of SPARKS) {
      const k = ((f + off) % 12) / 12
      const r = k < 0.5 ? k * 8 : (1 - k) * 8
      if (r < 1) continue
      sparks += `<path d="M${x} ${y - r}L${x + 1} ${y - 1}L${x + r} ${y}L${x + 1} ${y + 1}L${x} ${y + r}L${x - 1} ${y + 1}L${x - r} ${y}L${x - 1} ${y - 1}Z" fill="#ffffff"/>`
    }
    if (sparks) layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${sparks}</svg>`), left: 0, top: 0 })

    await sharp(Buffer.from(svg)).composite(layers).png().toFile(frame(dir, f))
  }
  toGif(dir, join(OUT, `${tok.sym.toLowerCase()}.gif`), FPS)
}

// ── 2. THE STORY: loud colour cards, then the name and a self-pressing button ──
async function story(tok) {
  if (!tok.story) return
  const { png: logo, base } = await logoOf(tok, 48)
  const dir = frameDir(tok.sym + '-story')
  const CARD = 13, END = 24
  const cards = [[hex(base), '#ffffff'], ['#ffd400', '#101018'], ['#ffffff', hex(mix(base, [0, 0, 0], 0.3))]]
  let f = 0
  for (const [i, line] of tok.story.entries()) {
    const [bg, ink] = cards[i % cards.length]
    const t = await text(line, fit(line, 440, 2), ink)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${bg}"/><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#101018"/></svg>`
    for (let k = 0; k < CARD; k++) {
      // It slams in a few pixels off, lands, then jitters a pixel while it holds.
      const j = k === 0 ? 3 : k < 3 ? 0 : (k % 4 === 0 ? 1 : 0)
      await sharp(Buffer.from(svg)).composite([{ input: t.input, left: Math.round((W - t.w) / 2) + j, top: Math.round((H - t.h) / 2) - j }]).png().toFile(frame(dir, f++))
    }
  }
  const dark = mix(base, [10, 10, 24], 0.55)
  const ticker = tickerOf(tok)
  const nameT = await inked(ticker, fit(ticker, 210, 1.5), '#ffd166', 64, 6)
  const site = await inked(tok.site ?? 'MOSH.TRADE', 1, '#9fe8ff', 64, 34)
  const bt = await text(tok.button ?? 'CLICK HERE', 1, '#000000')
  const BW = bt.w + 24, BH = 34, BX = W - BW - 12, BY = 13
  for (let k = 0; k < END; k++) {
    const down = Math.floor(k / 6) % 2 === 1
    const [hi, lo] = down ? ['#404040', '#ffffff'] : ['#ffffff', '#404040']
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" shape-rendering="crispEdges">
      <rect width="${W}" height="${H}" fill="${hex(dark)}"/>
      <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#ffffff"/><rect x="6" y="5" width="52" height="50" fill="#101018"/>
      <rect x="${BX}" y="${BY}" width="${BW}" height="${BH}" fill="#c0c0c0"/>
      <path d="M${BX} ${BY + BH}V${BY}H${BX + BW}" stroke="${hi}" stroke-width="2" fill="none"/>
      <path d="M${BX + BW} ${BY}V${BY + BH}H${BX}" stroke="${lo}" stroke-width="2" fill="none"/></svg>`
    const layers = [{ input: logo, left: 8, top: 6 }, ...nameT.layers, ...site.layers,
      { input: bt.input, left: BX + 12 + (down ? 1 : 0), top: BY + 5 + (down ? 1 : 0) }]
    await sharp(Buffer.from(svg)).composite(layers).png().toFile(frame(dir, f++))
  }
  toGif(dir, join(OUT, `${tok.sym.toLowerCase()}-story.gif`), FPS)
}

// ── 3. THE MICRO BUTTON: 88x31, logo, two lines of tiny type, a raised bevel ──
async function micro(tok) {
  const { png: logo, base } = await logoOf(tok, 25)
  const dir = frameDir(tok.sym + '-micro')
  const top = tok.microTop ?? '$' + tok.sym
  const word = tok.micro ?? 'NOW!'
  const flashes = ['#ffd400', '#ff4040']
  for (let k = 0; k < 2; k++) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="31">
      <rect width="88" height="31" fill="#000000"/><rect x="1" y="1" width="86" height="29" fill="${hex(mix(base, [0, 0, 0], 0.55))}"/>
      <path d="M0.5 30.5V0.5H87.5" stroke="#c0c0c0" fill="none" shape-rendering="crispEdges"/>
      <path d="M87.5 0.5V30.5H0.5" stroke="#202020" fill="none" shape-rendering="crispEdges"/>
      <text x="32" y="13" font-family="Verdana" font-weight="bold" font-size="10" fill="#ffffff">${top}</text>
      <text x="32" y="26" font-family="Verdana" font-weight="bold" font-style="italic" font-size="11" fill="${flashes[k]}">${word}</text></svg>`
    await sharp(Buffer.from(svg)).composite([{ input: logo, left: 3, top: 3 }]).png().toFile(frame(dir, k))
  }
  toGif(dir, join(OUT, `${tok.sym.toLowerCase()}-btn.gif`), 2)
}

// ── 4. THE SQUARES: 250x250 and 125x125, the square ad sizes of the era ──────
// JP, 2026-10-12: "give me some more square looking banners".
function stripesSvg(size, dark, base, f, extra = '') {
  const shift = (f * 2) % 24
  let s = ''
  for (let x = -size; x < size * 2; x += 24) s += `<polygon points="${x + shift},0 ${x + shift + 12},0 ${x + shift - size + 12},${size} ${x + shift - size},${size}" fill="${hex(mix(dark, base, 0.25))}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" shape-rendering="crispEdges">
    <rect width="${size}" height="${size}" fill="${hex(dark)}"/>${s}
    <rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" fill="none" stroke="#ffffff"/>
    <rect x="${size - 1.5}" y="0" width="1" height="${size}" fill="#101018"/><rect x="0" y="${size - 1.5}" width="${size}" height="1" fill="#101018"/>${extra}</svg>`
}
function sparkSvg(size, f, n) {
  let s = ''
  for (let i = 0; i < n; i++) {
    const x = (i * 71 + 17) % (size - 20) + 10, y = (i * 53 + 29) % (size - 20) + 10
    const k = ((f + i * 5) % 12) / 12
    const r = k < 0.5 ? k * 8 : (1 - k) * 8
    if (r >= 1) s += `<path d="M${x} ${y - r}L${x + 1} ${y - 1}L${x + r} ${y}L${x + 1} ${y + 1}L${x} ${y + r}L${x - 1} ${y + 1}L${x - r} ${y}L${x - 1} ${y - 1}Z" fill="#ffffff"/>`
  }
  return s ? { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${s}</svg>`), left: 0, top: 0 } : null
}

async function square(tok) {
  const S = 250, LOGO = 100
  const { png: logo, base } = await logoOf(tok, LOGO)
  const dark = mix(base, [10, 10, 24], 0.65)
  const flash = ['#ffd166', '#ffffff', hex(mix(base, [255, 255, 255], 0.35))]
  const dir = frameDir(tok.sym + '-250')
  const ticker = tickerOf(tok)
  const tk = fit(ticker, S - 24, 1.5)
  const bt = await text(tok.button ?? 'CLICK HERE', 1, '#000000')
  const BW = bt.w + 24, BH = 30, BX = Math.round((S - BW) / 2), BY = 180
  const site = await inked(tok.site ?? 'MOSH.TRADE', fit(tok.site ?? 'MOSH.TRADE', S - 20, 1), '#9fe8ff', 0, 0)
  for (let f = 0; f < FRAMES; f++) {
    const down = f >= 12 && Math.floor(f / 6) % 2 === 1
    const [hi, lo] = down ? ['#404040', '#ffffff'] : ['#ffffff', '#404040']
    const ly = Math.round(-LOGO + (LOGO + 44) * ease(Math.min(1, f / 8)))      // the logo drops in
    const svg = stripesSvg(S, dark, base, f, `
      <rect x="${(S - LOGO) / 2 - 4}" y="${ly - 4}" width="${LOGO + 8}" height="${LOGO + 8}" fill="#101018"/>
      <rect x="${BX}" y="${BY}" width="${BW}" height="${BH}" fill="#c0c0c0"/>
      <path d="M${BX} ${BY + BH}V${BY}H${BX + BW}" stroke="${hi}" stroke-width="2" fill="none"/>
      <path d="M${BX + BW} ${BY}V${BY + BH}H${BX}" stroke="${lo}" stroke-width="2" fill="none"/>`)
    const layers = [{ input: logo, left: (S - LOGO) / 2, top: ly }]
    const shown = Math.min(ticker.length, Math.floor(f / 1.5))
    if (shown > 0) {
      const t = await inked(ticker.slice(0, shown), tk, f < 12 ? '#ffffff' : flash[Math.floor(f / 3) % flash.length], 0, 0)
      const full = Math.round(measure(ticker) * tk)
      layers.push(...t.layers.map(l => ({ ...l, left: l.left + Math.round((S - full) / 2), top: l.top + 5 })))
    }
    const sub = f < 12 ? tok.name : tok.lines[Math.floor((f - 12) / 12) % tok.lines.length]
    const st = await inked(sub, fit(sub, S - 16, 1), '#ffffff', 0, 0)
    if (f > 6) layers.push(...st.layers.map(l => ({ ...l, left: l.left + Math.round((S - st.w) / 2), top: l.top + 150 })))
    layers.push({ input: bt.input, left: BX + 12 + (down ? 1 : 0), top: BY + 3 + (down ? 1 : 0) })
    layers.push(...site.layers.map(l => ({ ...l, left: l.left + Math.round((S - site.w) / 2), top: l.top + 218 })))
    const sp = sparkSvg(S, f, 7)
    if (sp) layers.push(sp)
    await sharp(Buffer.from(svg)).composite(layers).png().toFile(frame(dir, f))
  }
  toGif(dir, join(OUT, `${tok.sym.toLowerCase()}-sq.gif`), FPS)
}

async function squareSmall(tok) {
  const S = 125, LOGO = 64
  const { png: logo, base } = await logoOf(tok, LOGO)
  const dark = mix(base, [10, 10, 24], 0.65)
  const dir = frameDir(tok.sym + '-125')
  const ticker = tok.microTop ?? '$' + tok.sym
  const tt = await inked(ticker, fit(ticker, S - 12, 1), '#ffffff', 0, 0)
  const word = tok.micro ?? 'NOW!'
  const N = 24
  for (let f = 0; f < N; f++) {
    const svg = stripesSvg(S, dark, base, f, `<rect x="${Math.round((S - LOGO) / 2) - 3}" y="31" width="${LOGO + 6}" height="${LOGO + 6}" fill="#101018"/>`)
    const layers = [{ input: logo, left: Math.round((S - LOGO) / 2), top: 34 + (Math.floor(f / 4) % 2) }]
    layers.push(...tt.layers.map(l => ({ ...l, left: l.left + Math.round((S - tt.w) / 2), top: l.top + 4 })))
    const w = await inked(word, 1, f % 6 < 3 ? '#ffd400' : '#ff4040', 0, 0)
    layers.push(...w.layers.map(l => ({ ...l, left: l.left + Math.round((S - w.w) / 2), top: l.top + 99 })))
    const sp = sparkSvg(S, f, 4)
    if (sp) layers.push(sp)
    await sharp(Buffer.from(svg)).composite(layers).png().toFile(frame(dir, f))
  }
  toGif(dir, join(OUT, `${tok.sym.toLowerCase()}-sm.gif`), FPS)
}

// Only the tokens named on the command line, or all of them.
const only = process.argv.slice(2).map(s => s.toUpperCase())
for (const t of TOKENS) {
  if (only.length && !only.includes(t.sym)) continue
  await banner(t)
  await story(t)
  await micro(t)
  await square(t)
  await squareSmall(t)
}
