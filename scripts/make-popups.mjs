/**
 * "YOU WON!!!" POP-UP ADS — the fake-prize pop-up of the early web, played for
 * laughs. JP, 2026-10-12, after a Pinterest pin of one ("Congratulations!!! YOU
 * WON!!! No This Is Not A Joke ... *Not Actually Free"): "also do some ads like
 * this as well".
 *
 *   node scripts/make-popups.mjs [SYM ...]   -> public/banners/<sym>-popup.gif   540x675, animated
 *                                               public/banners/<sym>-popup.png   1080x1350, Instagram portrait
 *
 * THE TWIST FOR US: our prize IS free — the game costs nothing — so the small
 * print says so. For the other Mosh tokens the prizes stay silly and plainly not
 * money: in crypto a "YOU WON!" pop-up is the airdrop scam, and these must never
 * read as one. No "free tokens", ever.
 *
 * Drawn as one SVG per frame (mixed system type, the way the real ones were),
 * rendered by sharp, joined into a GIF by ffmpeg.
 */
import sharp from 'sharp'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'

const FFMPEG = 'C:/Users/JPDom/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe'
const OUT = 'public/banners'
const W = 540, H = 675, FRAMES = 24, FPS = 8

const CAT = seed => `https://clankercats.com/api/cat-art?seed=${seed}`
const ADS = [
  { sym: 'CLKCAT', site: 'CLANKERCATS.COM', claim: 'Click Here',
    a: { img: CAT(52592), label: 'A FREE CLANKER CAT' }, b: { img: CAT(31337), label: 'ANOTHER FREE CAT' },
    fine: '*Actually free. No wallet. No download.' },
  { sym: 'BORK', site: 'KINGBORK.FUN', claim: 'Click Here',
    a: { img: 'https://kingbork.fun/assets/king-bork-icon.png', label: 'A SEAT AT THE FEAST' }, b: { img: CAT(777), label: 'A SNACK (MAYBE)' },
    fine: '*Poison not included. Probably.' },
  { sym: 'BUN', site: 'MOSH.TRADE', claim: 'Click Here',
    a: { img: 'https://cdn.dexscreener.com/cms/images/Qg8DtP-7cTLYq_Vb?width=800&height=800&quality=95&format=auto', label: 'A SPOT IN THE MOSH PIT' }, b: { img: CAT(4242), label: 'A FREE CLANKER CAT' },
    fine: '*The cat is real. The prize is vibes.' },
  { sym: 'BPEPE', site: 'MOSH.TRADE', claim: 'Click Here',
    a: { img: 'https://cdn.dexscreener.com/cms/images/MfVMh7A5FAkzsvlN?width=800&height=800&quality=95&format=auto', label: 'FEELING GOOD, MAN' }, b: { img: CAT(1999), label: 'A FREE CLANKER CAT' },
    fine: '*Good feelings not guaranteed.' },
  { sym: 'ALF', site: 'ALFMEMECOIN.XYZ', claim: 'Click Here',
    a: { img: 'https://cdn.dexscreener.com/cms/images/DgDEFaqAW5i5dN0j?width=800&height=800&quality=95&format=auto', label: 'AN AGENT, WORKING' }, b: { img: CAT(1986), label: 'A FREE CLANKER CAT' },
    fine: '*Agents sold separately. Cats are free.' },
]

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function dataUri(url, size) {
  const raw = Buffer.from(await (await fetch(url)).arrayBuffer())
  const png = await sharp(raw).resize(size, size, { fit: 'cover', position: 'top' }).png().toBuffer()
  return 'data:image/png;base64,' + png.toString('base64')
}

function svgFrame(ad, imgA, imgB, f, scale = 1) {
  const B = 26                                   // the "Winner!" border
  const blink = f % 4 < 2
  const bob = [0, 3, 6, 3][f % 4]
  // The marquee: "Winner!" round all four sides, crawling one step a frame.
  const word = 'Winner! '
  const step = 58, off = (f * 6) % step
  // Sides first, then the top and bottom bands over them, so the corners stay clean.
  let marquee = ''
  for (let y = -step + off; y < H + step; y += step) {
    marquee += `<text transform="translate(${B - 8} ${y}) rotate(90)">${word}</text><text transform="translate(${W - B + 8} ${H - y}) rotate(-90)">${word}</text>`
  }
  marquee += `<rect width="${W}" height="${B}" fill="#2a2ad8"/><rect y="${H - B}" width="${W}" height="${B}" fill="#2a2ad8"/>`
  for (let x = -step + off; x < W + step; x += step) {
    marquee += `<text x="${x}" y="${B - 8}">${word}</text><text x="${W - x}" y="${H - 8}" text-anchor="end">${word}</text>`
  }
  const cx = [148, 392], cy = 498, R = 86
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * scale}" height="${H * scale}" viewBox="0 0 ${W} ${H}">
  <defs>
    <clipPath id="ca"><circle cx="${cx[0]}" cy="${cy}" r="${R - 8}"/></clipPath>
    <clipPath id="cb"><circle cx="${cx[1]}" cy="${cy}" r="${R - 8}"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#2a2ad8"/>
  <g font-family="Times New Roman" font-style="italic" font-size="17" fill="#ffffff">${marquee}</g>
  <rect x="${B}" y="${B}" width="${W - 2 * B}" height="${H - 2 * B}" fill="#f4f1e8"/>

  <text x="${W / 2}" y="92" text-anchor="middle" font-family="Times New Roman" font-style="italic" font-size="52" fill="${blink ? '#d81e1e' : '#1e3cd8'}">Congratulations!!!</text>
  <rect x="64" y="104" width="${W - 128}" height="62" fill="#22e03a"/>
  <text x="${W / 2}" y="156" text-anchor="middle" font-family="Arial Black" font-size="50" fill="${blink ? '#1e3cd8' : '#d81e1e'}">YOU WON!!!</text>
  <text x="${W / 2}" y="204" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="28" fill="#101010">No This Is <tspan fill="#d81e1e" font-style="italic" text-decoration="underline">Not</tspan> A Joke</text>
  <text x="${W / 2}" y="244" text-anchor="middle" font-family="Times New Roman" font-style="italic" font-size="26" fill="#101010">You are the lucky <tspan fill="#1e3cd8" text-decoration="underline">1,000,000th</tspan> visitor!</text>

  <path d="M${W / 2 - 18} ${252 + bob}h36v22h20l-38 34l-38-34h20z" fill="#22e03a" stroke="#0a8a1a" stroke-width="2"/>
  <rect x="${W / 2 - 92}" y="314" width="184" height="46" rx="10" fill="${blink ? '#e02020' : '#ff4040'}"/>
  <text x="${W / 2}" y="347" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="28" fill="#ffffff" text-decoration="underline">${esc(ad.claim)}</text>
  <text x="${W / 2}" y="388" text-anchor="middle" font-family="Arial" font-size="22" fill="#101010">To Claim Your <tspan fill="#1e3cd8" text-decoration="underline">FREE</tspan>* Prize!</text>

  <circle cx="${cx[0]}" cy="${cy}" r="${R}" fill="#22e03a"/>
  <circle cx="${cx[1]}" cy="${cy}" r="${R}" fill="#2a2ad8"/>
  <image href="${imgA}" x="${cx[0] - R + 8}" y="${cy - R + 8}" width="${2 * (R - 8)}" height="${2 * (R - 8)}" clip-path="url(#ca)"/>
  <image href="${imgB}" x="${cx[1] - R + 8}" y="${cy - R + 8}" width="${2 * (R - 8)}" height="${2 * (R - 8)}" clip-path="url(#cb)"/>
  <text x="${W / 2}" y="${cy + 14}" text-anchor="middle" font-family="Arial Black" font-style="italic" font-size="32" fill="#101010">OR</text>
  <text x="${cx[0]}" y="${cy + R + 24}" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="15" fill="#101010">${esc(ad.a.label)}</text>
  <text x="${cx[1]}" y="${cy + R + 24}" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="15" fill="#101010">${esc(ad.b.label)}</text>

  <text x="${B + 12}" y="${H - B - 12}" font-family="Arial" font-size="13" fill="#101010">${esc(ad.fine)}</text>
  <text x="${W - B - 12}" y="${H - B - 12}" text-anchor="end" font-family="Arial" font-weight="bold" font-size="13" fill="#1e3cd8">${esc(ad.site)}</text>
</svg>`
}

async function popup(ad) {
  const [imgA, imgB] = await Promise.all([dataUri(ad.a.img, 200), dataUri(ad.b.img, 200)])
  mkdirSync(OUT, { recursive: true })
  const name = ad.sym.toLowerCase()
  // The still, for Instagram: 1080x1350, the frame with "Congratulations" in red.
  await sharp(Buffer.from(svgFrame(ad, imgA, imgB, 0, 2))).png().toFile(join(OUT, `${name}-popup.png`))
  // The animated one.
  const dir = join(tmpdir(), 'popup-' + name)
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  for (let f = 0; f < FRAMES; f++)
    await sharp(Buffer.from(svgFrame(ad, imgA, imgB, f))).png().toFile(join(dir, 'f' + String(f).padStart(3, '0') + '.png'))
  const r = spawnSync(FFMPEG, ['-v', 'error', '-y', '-framerate', String(FPS), '-i', join(dir, 'f%03d.png'),
    '-filter_complex', '[0]split[a][b];[a]palettegen=max_colors=160:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
    '-loop', '0', join(OUT, `${name}-popup.gif`)], { stdio: 'inherit' })
  rmSync(dir, { recursive: true, force: true })
  if (r.status) throw new Error('ffmpeg failed for ' + name)
  console.log('ok', name)
}

const only = process.argv.slice(2).map(s => s.toUpperCase())
for (const ad of ADS) if (!only.length || only.includes(ad.sym)) await popup(ad)
