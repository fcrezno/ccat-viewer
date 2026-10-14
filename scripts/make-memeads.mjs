/**
 * BUNDLE CAT MEME ADS: the Meme Depot memes (public/ratx/memes) made into
 * 2000s web ads. JP, 2026-10-13, with a sheet of IAB-size ads ("Start Your Career
 * in Healthcare", "You can get by in Spanish with just 138 words", "HOPE vs JOBS",
 * "Love Top Secret", "NO FEE NYC Apartments") and a pile of Internet Explorer pop-ups:
 * "make some of the new images ads for the site in the same internet ad style".
 *
 *   node scripts/make-memeads.mjs   -> public/flyers/bun-x-<name>.gif
 *
 * Each ad blinks its button, the way the real ones did (2 frames). The jokes stay
 * jokes: no prices, no prizes, no promises about money. They link to $BUN on Mosh
 * (lib/banners MEME_ADS; shown in the side columns by components/SideAds).
 * Only cat memes: the photo of a real person from the depot is not used in an ad.
 */
import sharp from 'sharp'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'
import { FRAMES, bevel, blinkOf, decorate, encodeGif } from './classic.mjs'

const FFMPEG = 'C:/Users/JPDom/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe'
const OUT = 'public/flyers'
/*
 * SHARPER (JP, 2026-10-14: "fix these ads so they look better"). The game's memes
 * are 320 px, too soft for an ad, so the ads read full-size copies (1200 px, the
 * same Meme Depot pictures in the same order) from clanker-clips/memes-hi when
 * they are there. Every picture goes in at 2x, every ad is drawn at 2x and brought
 * down to the size the page SHOWS it (a 300x250 in a 250 column is drawn for 250,
 * not shrunk by the browser), and the frames are saved as animated WebP: a GIF's
 * 256 colours put grain all over fur and fire.
 */
const HI = 'C:/Users/JPDom/clanker-clips/memes-hi'
const MEME = n => {
  const id = String(n).padStart(2, '0')
  return existsSync(`${HI}/${id}.img`) ? `${HI}/${id}.img` : `public/ratx/memes/${id}.jpg`
}
const X = 2                                       // pictures and drawing at twice the shown size

/** A meme cropped to w x h, as a data URI for the SVG. */
async function pic(n, w0, h0, position = 'centre') {
  const w = w0 * X, h = h0 * X
  // 'contain': the whole picture, on white (the hand-drawn memes: a crop cuts their words).
  if (position === 'contain') {
    const png = await sharp(MEME(n)).resize(w, h, { fit: 'contain', background: '#ffffff', kernel: 'lanczos3' }).flatten({ background: '#ffffff' }).png().toBuffer()
    return 'data:image/png;base64,' + png.toString('base64')
  }
  // position may be a number: the crop's centre, 0..1 across the picture.
  const tall = await sharp(MEME(n)).resize({ height: h, kernel: 'lanczos3' }).toBuffer()
  const png = typeof position === 'number'
    ? await sharp(tall).metadata().then(m => sharp(tall)
        .extract({ left: Math.max(0, Math.min(m.width - w, Math.round(m.width * position - w / 2))), top: 0, width: Math.min(w, m.width), height: h })
        .sharpen({ sigma: 0.6 }).png().toBuffer())
    : await sharp(MEME(n)).resize(w, h, { fit: 'cover', position, kernel: 'lanczos3' }).sharpen({ sigma: 0.6 }).png().toBuffer()
  return 'data:image/png;base64,' + png.toString('base64')
}
const img = (uri, x, y, w, h, extra = '') => `<image href="${uri}" x="${x}" y="${y}" width="${w}" height="${h}" ${extra}/>`

/** A rounded glossy button: the 2004 "LEARN MORE" pill. `lit` is the blink frame. */
function pill(x, y, w, h, label, { size = 14, lit = false } = {}) {
  return bevel(x, y, w, h, label, { size: Math.min(size, 14), lit })
}
function glossyPill(x, y, w, h, label, { from, to, ink = '#1a1a1a', size = 14, lit = false, font = 'Arial Black' }) {
  const id = 'g' + Math.round(x + y * 7 + w)
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${lit ? '#ffffff' : from}"/><stop offset="0.45" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
    <rect x="${x + 2}" y="${y + 3}" width="${w}" height="${h}" rx="${h / 2.6}" fill="#000" opacity="0.35"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2.6}" fill="url(#${id})" stroke="${lit ? '#ffffff' : '#00000055'}" stroke-width="${lit ? 2 : 1}"/>
    <text x="${x + w / 2}" y="${y + h / 2 + size * 0.36}" text-anchor="middle" font-family="${font}" font-size="${size}" fill="${ink}">${label}</text>`
}

// ── the ads: each returns the SVG of frame f (0 or 1) ──
const ADS = [
  // "You can get by in Spanish with just 138 words." -> got $BUN?
  { name: 'getby', w: 300, h: 250, async make() {
    const p = await pic(39, 132, 118, 'north')
    return f => `<rect width="300" height="250" fill="#ececec"/>
      <rect width="300" height="92" fill="#2a2a2a"/>
      <g font-family="Arial Black" font-size="19" fill="#fff" text-anchor="middle">
        <text x="150" y="27">YOU CAN GET BY</text>
        <text x="150" y="53">IN THE <tspan fill="#ff3b30">MOSH PIT</tspan> WITH</text>
        <text x="150" y="79">JUST ONE <tspan fill="#ffc400">$BUN.</tspan></text></g>
      <g transform="rotate(-4 80 160)"><rect x="12" y="98" width="142" height="128" fill="#fff" stroke="#bbb"/>${img(p, 17, 103, 132, 118)}</g>
      <g font-family="Arial" font-size="12.5" fill="#333" text-anchor="middle">
        <text x="228" y="114">Just one cat</text><text x="228" y="130">in armor can</text>
        <text x="228" y="146">unlock thousands</text><text x="228" y="162">of memes.</text></g>
      <rect x="0" y="228" width="300" height="22" fill="#fff"/>
      <text x="10" y="243" font-family="Georgia" font-weight="bold" font-size="12" fill="#d2201f">Bundle<tspan fill="#555">Cat</tspan></text>
      ${pill(160, 192, 132, 32, 'GET STARTED!', { from: '#ff4a2e', to: '#c3170b', ink: '#fff', size: 14, lit: f === 1 })}
      <rect x="0.5" y="0.5" width="299" height="249" fill="none" stroke="#888"/>` } },

  // "Start Your Career in Healthcare" -> Start Your Career in Bundling.
  { name: 'career', w: 250, h: 250, async make() {
    const p = await pic(37, 112, 290, 0.42)
    return f => `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c8f25a"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>
      <rect width="250" height="250" fill="url(#bg)"/>
      ${img(p, 0, 0, 112, 290)}
      <g font-family="Trebuchet MS" font-style="italic">
        <text x="182" y="46" text-anchor="middle" font-size="21" fill="#1f3fbf">Start Your</text>
        <text x="182" y="88" text-anchor="middle" font-size="36" font-weight="bold" font-style="normal" fill="#d6157f">Career</text>
        <text x="182" y="112" text-anchor="middle" font-size="16" fill="#1f3fbf">in</text>
        <text x="182" y="142" text-anchor="middle" font-size="25" fill="#d6157f">Bundling</text></g>
      <g fill="#1b2a7a">${[0, 14, 30, 41, 58, 70, 86, 99, 117, 130, 146, 160, 176, 191, 208, 222, 236].map((x, i) => `<rect x="${x}" y="${214 - (i * 37 % 26) - 8}" width="13" height="${(i * 37 % 26) + 8}"/>`).join('')}</g>
      <rect x="0" y="214" width="250" height="36" fill="#1b2a7a"/>
      ${pill(118, 166, 124, 34, 'LEARN MORE', { from: '#ffe94a', to: '#f2b705', size: 14, lit: f === 1 })}
      <text x="8" y="236" font-family="Verdana" font-size="9" fill="#fff">STOP! You're gonna make me BUNDLE!</text>
      <rect x="0.5" y="0.5" width="249" height="249" fill="none" stroke="#888"/>` } },

  // "HOPE vs JOBS — choose your side... the fate of America depends on it! PLAY NOW"
  { name: 'side', w: 160, h: 600, async make() {
    const a = await pic(7, 112, 170, 'north'), b = await pic(36, 112, 170, 'centre')
    const col = (word, y, bg, ink) => `<rect x="112" y="${y}" width="48" height="170" fill="${bg}"/>` +
      [...word].map((c, i) => `<text x="136" y="${y + 36 + i * 38}" text-anchor="middle" font-family="Impact" font-size="36" fill="${ink}">${c}</text>`).join('')
    return f => `<rect width="160" height="600" fill="#0d1b3a"/>
      <text x="80" y="27" text-anchor="middle" font-family="Arial Black" font-size="17" font-style="italic" fill="#fff">MOSH<tspan fill="#4fa3ff">PIT</tspan></text>
      <text x="80" y="43" text-anchor="middle" font-family="Arial" font-size="10" font-style="italic" fill="#c8d6ff" letter-spacing="2">BUNDLE  2026</text>
      ${img(a, 0, 52, 112, 170)}${col('HOLD', 52, '#d8333a', '#f5e7c8')}
      <rect x="54" y="206" width="52" height="34" fill="#f2c200" stroke="#0d1b3a" stroke-width="3"/>
      <text x="80" y="232" text-anchor="middle" font-family="Impact" font-size="26" fill="#0d1b3a">VS</text>
      ${img(b, 0, 240, 112, 170)}${col('FOLD', 240, '#3d6fb0', '#f5e7c8')}
      <g font-family="Arial Black" text-anchor="middle" fill="#fff">
        <text x="80" y="440" font-size="19">CHOOSE</text>
        <text x="80" y="460" font-size="12">YOUR <tspan font-size="19">SIDE...</tspan></text>
        <text x="80" y="492" font-size="17">THE <tspan fill="#ff4040">FATE</tspan></text>
        <text x="80" y="512" font-size="13">OF THE <tspan fill="#4fa3ff" font-size="17">BUN</tspan></text>
        <text x="80" y="532" font-size="14">DEPENDS ON IT!</text></g>
      <rect x="0" y="548" width="160" height="52" fill="#d8202a"/>
      <text x="80" y="587" text-anchor="middle" font-family="Impact" font-size="34" fill="${f ? '#ffe94a' : '#ffffff'}">MOSH NOW</text>` } },

  // "LOVE TOP SECRET" (468x60) -> I've been hearing things.
  { name: 'hearing', w: 468, h: 60, async make() {
    const p = await pic(11, 190, 60, 'centre')
    return f => `<defs><linearGradient id="dk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a0b0b"/><stop offset="1" stop-color="#120303"/></linearGradient>
        <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0.6" stop-color="#3a0b0b" stop-opacity="0"/><stop offset="1" stop-color="#3a0b0b"/></linearGradient></defs>
      <rect width="468" height="60" fill="url(#dk)"/>${img(p, 0, 0, 190, 60)}<rect width="190" height="60" fill="url(#fade)"/>
      <text x="330" y="27" text-anchor="middle" font-family="Georgia" font-style="italic" font-weight="bold" font-size="16" fill="#e0302a" stroke="#000" stroke-width="0.5" letter-spacing="0.5">I'VE BEEN HEARING THINGS...</text>
      ${pill(272, 33, 120, 22, 'about $BUN', { from: '#ffb43a', to: '#d9590c', ink: '#3a0b0b', size: 12, lit: f === 1, font: 'Georgia' })}
      <rect x="0.5" y="0.5" width="467" height="59" fill="none" stroke="#000"/>` } },

  // "NO FEE — NYC APARTMENTS" (200x200) -> NO WALL can stop the BUNDLE.
  { name: 'nowall', w: 200, h: 200, async make() {
    const p = await pic(36, 184, 104, 'centre')
    return f => `<rect width="200" height="200" fill="#1d3a78"/>
      ${[...Array(9)].map((_, i) => `<text x="${12 + (i * 47) % 190}" y="${16 + (i * 29) % 180}" font-size="11" fill="#ffffff22">★</text>`).join('')}
      <text x="100" y="30" text-anchor="middle" font-family="Arial Black" font-size="25" fill="#ff8a1e" stroke="#7a2a00" stroke-width="0.8">NO WALL</text>
      <text x="100" y="48" text-anchor="middle" font-family="Arial Black" font-size="11.5" fill="#fff">CAN STOP THE BUNDLE</text>
      <rect x="6" y="56" width="188" height="108" fill="#fff"/>${img(p, 8, 58, 184, 104)}
      ${pill(36, 166, 128, 28, 'LEARN MORE!', { from: '#ffe94a', to: '#f2b705', size: 13, lit: f === 1 })}
      <rect x="0.5" y="0.5" width="199" height="199" fill="none" stroke="#0a1838"/>` } },

  // The Internet Explorer pop-up: "Before you go, did you know..."
  { name: 'beforeyougo', w: 300, h: 250, async make() {
    const p = await pic(46, 96, 132, 'north')
    return f => `<defs><linearGradient id="tb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0a246a"/><stop offset="1" stop-color="#a6caf0"/></linearGradient></defs>
      <rect width="300" height="250" fill="#d4d0c8"/>
      <rect x="2" y="2" width="296" height="18" fill="url(#tb)"/>
      <text x="7" y="15" font-family="Tahoma" font-weight="bold" font-size="10.5" fill="#fff">Special Offer - Internet Explorer</text>
      ${['_', '□', '×'].map((c, i) => `<rect x="${246 + i * 17}" y="4" width="15" height="13" fill="#d4d0c8" stroke="#fff"/><text x="${253.5 + i * 17}" y="14.5" text-anchor="middle" font-family="Tahoma" font-weight="bold" font-size="10">${c}</text>`).join('')}
      <rect x="5" y="23" width="290" height="222" fill="#fff" stroke="#808080"/>
      <rect x="5" y="23" width="290" height="34" fill="#0b5fbf"/>
      <text x="150" y="47" text-anchor="middle" font-family="Georgia" font-style="italic" font-weight="bold" font-size="17" fill="#fff">Before you go, did you know...</text>
      <g font-family="Verdana" font-size="11" fill="#0a2a6a">
        <text x="14" y="76">You can add a <tspan font-weight="bold">knight cat</tspan></text>
        <text x="14" y="91">to <tspan font-weight="bold">any</tspan> Mosh pit!</text>
        <text x="14" y="116" font-size="10" font-weight="bold">Works with any meme</text>
        <text x="14" y="134" font-size="10"><tspan font-weight="bold">Built-in armor</tspan> for</text>
        <text x="14" y="147" font-size="10">you and your bags</text>
        <text x="14" y="172" font-size="10.5" fill="#e06a00" font-weight="bold">GET IN THE PIT TODAY!</text></g>
      <rect x="192" y="64" width="96" height="132" fill="#000"/>${img(p, 192, 64, 96, 132)}
      ${pill(150, 204, 136, 30, 'Click here', { from: '#c9ee8e', to: '#5ea828', ink: '#123d00', size: 14, lit: f === 1, font: 'Verdana' })}
      <text x="14" y="224" font-family="Verdana" font-size="9" fill="#777">Upto <tspan font-size="15" font-weight="bold" fill="#0b5fbf">9 LIVES</tspan></text>` } },
]

// ── ROUND TWO (JP, 2026-10-13: "use the images we gain and make more ads to add to
// the site"): more of the early web's ad genres, each with a meme from the depot. ──
ADS.push(
  // The mattress-sale ad -> Comfy in Bun.
  { name: 'comfy', w: 300, h: 250, async make() {
    const p = await pic(40, 300, 150, 'centre')
    return f => `<rect width="300" height="250" fill="#13235b"/>${img(p, 0, 0, 300, 150)}
      <rect x="0" y="0" width="300" height="26" fill="#d81e1e"/>
      <text x="150" y="19" text-anchor="middle" font-family="Arial Black" font-size="15" fill="${f ? '#fff36b' : '#ffffff'}">★ THE BIG SNUGGLE-OUT EVENT ★</text>
      <text x="150" y="182" text-anchor="middle" font-family="Georgia" font-style="italic" font-weight="bold" font-size="27" fill="#ffffff">Comfy in Bun</text>
      <text x="150" y="203" text-anchor="middle" font-family="Verdana" font-size="11" fill="#c8d6ff">0% stress. 100% bun. All weekend long.</text>
      ${pill(80, 213, 140, 28, 'SNUGGLE NOW', { from: '#ffe94a', to: '#f2b705', size: 13, lit: f === 1 })}` } },

  // The fast-food ad -> the BUN DOG.
  { name: 'bundog', w: 250, h: 250, async make() {
    const p = await pic(25, 150, 200, 'centre')
    return f => `<rect width="250" height="250" fill="#ffd21f"/>
      ${[...Array(12)].map((_, i) => `<path d="M125 125 L${125 + 260 * Math.cos(i * Math.PI / 6)} ${125 + 260 * Math.sin(i * Math.PI / 6)} L${125 + 260 * Math.cos(i * Math.PI / 6 + 0.26)} ${125 + 260 * Math.sin(i * Math.PI / 6 + 0.26)} Z" fill="#ffb800"/>`).join('')}
      <circle cx="80" cy="140" r="78" fill="#fff"/>
      <clipPath id="plate"><circle cx="80" cy="140" r="72"/></clipPath><g clip-path="url(#plate)">${img(p, 5, 40, 150, 200)}</g>
      <g transform="rotate(-12 200 42)"><circle cx="200" cy="42" r="34" fill="#d81e1e" stroke="#fff" stroke-width="3"/>
        <text x="200" y="50" text-anchor="middle" font-family="Arial Black" font-size="${f ? 24 : 22}" fill="#fff">NEW!</text></g>
      <text x="190" y="118" text-anchor="middle" font-family="Arial Black" font-size="15" fill="#7a1200">THE</text>
      <text x="190" y="148" text-anchor="middle" font-family="Impact" font-size="34" fill="#d81e1e" stroke="#7a1200" stroke-width="1">BUN</text>
      <text x="190" y="180" text-anchor="middle" font-family="Impact" font-size="34" fill="#d81e1e" stroke="#7a1200" stroke-width="1">DOG</text>
      ${pill(140, 200, 102, 30, 'ORDER NOW!', { from: '#ff4a2e', to: '#c3170b', ink: '#fff', size: 12, lit: f === 1 })}
      <text x="8" y="244" font-family="Arial" font-size="8" fill="#7a1200">At participating Mosh pits. Cat not included.</text>` } },

  // The cable-TV premiere ad -> GAME OF BUNDLES.
  { name: 'throne', w: 300, h: 250, async make() {
    const p = await pic(29, 300, 250, 'centre')
    return f => `${img(p, 0, 0, 300, 250)}
      <defs><linearGradient id="dim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.75"/><stop offset="0.35" stop-color="#000" stop-opacity="0"/><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.9"/></linearGradient></defs>
      <rect width="300" height="250" fill="url(#dim)"/>
      <text x="150" y="38" text-anchor="middle" font-family="Times New Roman" font-weight="bold" font-size="23" letter-spacing="2" fill="#e9d9a6">GAME OF BUNDLES</text>
      <text x="150" y="56" text-anchor="middle" font-family="Times New Roman" font-style="italic" font-size="13" fill="#e9d9a6">Bundling is coming.</text>
      <text x="150" y="200" text-anchor="middle" font-family="Arial Black" font-size="15" fill="#ffffff">ALL-NEW SEASON</text>
      <text x="150" y="218" text-anchor="middle" font-family="Arial" font-size="12" fill="#e9d9a6">SUNDAYS 9/8c · ONLY ON MOSH</text>
      <rect x="104" y="226" width="92" height="20" fill="${f ? '#e9d9a6' : '#000'}" stroke="#e9d9a6"/>
      <text x="150" y="240" text-anchor="middle" font-family="Arial Black" font-size="11" fill="${f ? '#000' : '#e9d9a6'}">WATCH NOW ▸</text>` } },

  // The weather-channel alert -> a BUN STORM warning.
  { name: 'storm', w: 300, h: 250, async make() {
    const p = await pic(41, 300, 150, 'centre')
    return f => `<rect width="300" height="250" fill="#0d3c8c"/>
      <rect x="0" y="0" width="300" height="30" fill="${f ? '#ff2a2a' : '#c80000'}"/>
      <text x="150" y="21" text-anchor="middle" font-family="Arial Black" font-size="15" fill="#fff">⚠ SEVERE BUN WARNING ⚠</text>
      ${img(p, 0, 30, 300, 150)}
      <rect x="0" y="152" width="300" height="28" fill="#000" opacity="0.6"/>
      <text x="10" y="171" font-family="Verdana" font-weight="bold" font-size="10" fill="#ffe94a">A WALL OF BUN IS HEADING YOUR WAY</text>
      <text x="12" y="202" font-family="Arial" font-size="12" fill="#fff">Today: <tspan font-weight="bold">100% chance of bun</tspan></text>
      <text x="12" y="220" font-family="Arial" font-size="12" fill="#fff">Tonight: <tspan font-weight="bold">scattered cats</tspan></text>
      ${pill(196, 198, 96, 28, 'FORECAST', { from: '#4fa3ff', to: '#1b5fc2', ink: '#fff', size: 12, lit: f === 1 })}
      <text x="292" y="244" text-anchor="end" font-family="Verdana" font-size="8" fill="#9db8e8">The Bun Weather Channel</text>` } },

  // The energy-drink ad -> BUN ENERGY.
  { name: 'energy', w: 250, h: 250, async make() {
    const p = await pic(31, 250, 250, 'centre')
    return f => `${img(p, 0, 0, 250, 250)}<rect width="250" height="250" fill="#000" opacity="0.25"/>
      <g transform="rotate(-8 125 60)">
        <text x="125" y="58" text-anchor="middle" font-family="Impact" font-size="46" fill="#b6ff00" stroke="#000" stroke-width="3" paint-order="stroke">BUN</text>
        <text x="125" y="96" text-anchor="middle" font-family="Impact" font-size="34" fill="#ffffff" stroke="#000" stroke-width="3" paint-order="stroke">ENERGY</text></g>
      <text x="125" y="196" text-anchor="middle" font-family="Arial Black" font-size="17" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">UNLEASH THE BUN</text>
      ${pill(60, 208, 130, 30, 'GET AMPED!', { from: '#c9ff3a', to: '#5ea800', ink: '#000', size: 14, lit: f === 1 })}
      <rect x="0.5" y="0.5" width="249" height="249" fill="none" stroke="#b6ff00" stroke-width="${f ? 3 : 1}"/>` } },

  // The "1 weird trick" ad -> a local cat.
  { name: 'trick', w: 300, h: 250, async make() {
    const p = await pic(18, 130, 130, 'centre')
    return f => `<rect width="300" height="250" fill="#ffffff"/>
      <rect x="0.5" y="0.5" width="299" height="249" fill="none" stroke="#c9c9c9"/>
      <text x="12" y="22" font-family="Arial" font-size="10" fill="#999">Sponsored Links</text>
      ${img(p, 12, 32, 130, 130)}
      <g font-family="Arial" font-weight="bold" font-size="15" fill="#1a0dab">
        <text x="152" y="48">Local Cat Finds</text><text x="152" y="67">1 Weird Trick</text>
        <text x="152" y="86">To Win At Memes</text></g>
      <g font-family="Arial" font-size="12" fill="#333">
        <text x="152" y="108">Other cats <tspan font-weight="bold" fill="#c00">HATE</tspan> him!</text>
        <text x="152" y="126">He just sat there.</text>
        <text x="152" y="144">(It's the bun.)</text></g>
      <text x="12" y="186" font-family="Arial" font-size="11" fill="#006621">www.mosh.trade/bun</text>
      <text x="12" y="204" font-family="Arial" font-size="11" fill="#333">You won't believe what happens next...</text>
      ${pill(160, 214, 128, 28, 'READ MORE »', { from: '#f7f7f7', to: '#d6d6d6', ink: f ? '#c00' : '#1a0dab', size: 12, font: 'Arial Black' })}` } },

  // The fake virus alert pop-up -> CUTENESS detected.
  { name: 'virus', w: 300, h: 250, async make() {
    const p = await pic(21, 104, 104, 'centre')
    return f => `<rect width="300" height="250" fill="#d4d0c8" stroke="#000"/>
      <rect x="2" y="2" width="296" height="18" fill="${f ? '#0a246a' : '#7b0000'}"/>
      <text x="7" y="15" font-family="Tahoma" font-weight="bold" font-size="10.5" fill="#fff">System Alert - Internet Explorer</text>
      <rect x="280" y="4" width="15" height="13" fill="#d4d0c8" stroke="#fff"/><text x="287.5" y="14.5" text-anchor="middle" font-family="Tahoma" font-weight="bold" font-size="10">×</text>
      <circle cx="30" cy="48" r="16" fill="#ffd200" stroke="#000"/><text x="30" y="56" text-anchor="middle" font-family="Arial Black" font-size="22">!</text>
      <text x="54" y="44" font-family="Tahoma" font-weight="bold" font-size="14" fill="#c00">WARNING!</text>
      <text x="54" y="60" font-family="Tahoma" font-size="11">Your PC may be infected with</text>
      <text x="10" y="90" font-family="Tahoma" font-weight="bold" font-size="17" fill="#000">EXTREME CUTENESS</text>
      <text x="10" y="112" font-family="Tahoma" font-size="11">(1) BUN detected!</text>
      <text x="10" y="128" font-family="Tahoma" font-size="11">Scanning C:\\Bun\\</text>
      <rect x="10" y="136" width="170" height="14" fill="#fff" stroke="#808080"/>
      ${[...Array(f ? 11 : 7)].map((_, i) => `<rect x="${12 + i * 15}" y="138" width="13" height="10" fill="#0a246a"/>`).join('')}
      <rect x="188" y="74" width="104" height="104" fill="#000"/>${img(p, 188, 74, 104, 104)}
      <rect x="40" y="200" width="100" height="26" fill="#d4d0c8" stroke="#000" stroke-width="${f ? 2 : 1}"/><text x="90" y="218" text-anchor="middle" font-family="Tahoma" font-size="12">Keep the Bun</text>
      <rect x="160" y="200" width="100" height="26" fill="#d4d0c8" stroke="#808080"/><text x="210" y="218" text-anchor="middle" font-family="Tahoma" font-size="12" fill="#808080">Remove</text>` } },

  // The arcade skyscraper -> CHOOSE YOUR FIGHTER.
  { name: 'fighter', w: 160, h: 600, async make() {
    const ps = [await pic(10, 140, 128, 'north'), await pic(12, 140, 128, 'north'), await pic(13, 140, 128, 'north')]
    const names = ['MECHA BUN', 'SAMURAI BUN', 'SUMMIT BUN']
    return f => `<rect width="160" height="600" fill="#120024"/>
      ${[...Array(30)].map((_, i) => `<rect x="${(i * 53) % 160}" y="${(i * 97) % 600}" width="2" height="2" fill="#ffffff55"/>`).join('')}
      <text x="80" y="30" text-anchor="middle" font-family="Impact" font-size="24" fill="#ffd200" stroke="#a00" stroke-width="1">CHOOSE YOUR</text>
      <text x="80" y="62" text-anchor="middle" font-family="Impact" font-size="34" fill="#ff3b30" stroke="#ffd200" stroke-width="1">FIGHTER</text>
      ${ps.map((p, i) => `<rect x="8" y="${76 + i * 150}" width="144" height="132" fill="${i === 1 && f ? '#ffd200' : '#3a2a6a'}"/>${img(p, 10, 78 + i * 150, 140, 128)}
        <rect x="10" y="${186 + i * 150}" width="140" height="20" fill="#000" opacity="0.75"/>
        <text x="80" y="${201 + i * 150}" text-anchor="middle" font-family="Arial Black" font-size="12" fill="#fff">${names[i]}</text>`).join('')}
      <text x="80" y="548" text-anchor="middle" font-family="Courier New" font-weight="bold" font-size="13" fill="#7dff7d">1P  PRESS START</text>
      <text x="80" y="582" text-anchor="middle" font-family="Impact" font-size="26" fill="${f ? '#ffffff' : '#ffd200'}">INSERT COIN</text>` } },

  // The museum exhibition banner -> The Creation of Bun.
  { name: 'creation', w: 468, h: 60, async make() {
    const p = await pic(48, 180, 60, 'centre')
    return f => `<rect width="468" height="60" fill="#f3ead6"/>${img(p, 0, 0, 180, 60)}
      <rect x="180" y="0" width="2" height="60" fill="#8a6d3b"/>
      <text x="196" y="24" font-family="Times New Roman" font-size="11" letter-spacing="2" fill="#8a6d3b">NOW AT THE MOSH MUSEUM</text>
      <text x="196" y="47" font-family="Times New Roman" font-style="italic" font-weight="bold" font-size="17" fill="#3b2a10">The Creation of $BUN</text>
      ${pill(392, 19, 68, 22, 'Visit »', { from: '#c9a45c', to: '#8a6d3b', ink: '#fff', size: 11, lit: f === 1, font: 'Georgia' })}
      <rect x="0.5" y="0.5" width="467" height="59" fill="none" stroke="#8a6d3b"/>` } },

  // The rodeo banner -> RIDE THE BEAR.
  { name: 'bear', w: 468, h: 60, async make() {
    const p = await pic(27, 150, 60, 'centre')
    return f => `<rect width="468" height="60" fill="#5a2d0c"/>${img(p, 0, 0, 150, 60)}
      <text x="306" y="27" text-anchor="middle" font-family="Georgia" font-weight="bold" font-size="18" fill="#ffd27a" letter-spacing="1">BEAR MARKET?</text>
      <text x="270" y="50" text-anchor="middle" font-family="Georgia" font-style="italic" font-size="14" fill="#fff">Bun rides it.</text>
      ${pill(348, 34, 110, 22, 'SADDLE UP', { from: '#ffb43a', to: '#d9590c', ink: '#3a1a00', size: 11, lit: f === 1, font: 'Arial Black' })}
      <rect x="0.5" y="0.5" width="467" height="59" fill="none" stroke="#2a1300"/>` } },
)


// ── ROUND THREE (JP, 2026-10-14: "make at least 33 ads and put them on the website
// and in the game"): nineteen more, 35 in all. ──
const stars = (n, w, h, ink = '#ffffff33') => [...Array(n)].map((_, i) => `<text x="${(i * 53 + 11) % w}" y="${(i * 37 + 17) % h}" font-size="9" fill="${ink}">★</text>`).join('')
ADS.push(
  // The wrestling pay-per-view -> BUNMANIA.
  { name: 'bunmania', w: 300, h: 250, async make() {
    const p = await pic(20, 150, 250, 'north')
    return f => `<rect width="300" height="250" fill="#0a0a0a"/>${img(p, 150, 0, 150, 250)}
      <defs><linearGradient id="fadeL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0a0a0a"/><stop offset="0.35" stop-color="#0a0a0a" stop-opacity="0"/></linearGradient></defs>
      <rect x="150" width="150" height="250" fill="url(#fadeL)"/>
      <text x="14" y="34" font-family="Arial Black" font-size="11" fill="#ffd200" letter-spacing="2">LIVE ON PAY-PER-VIEW</text>
      <text x="12" y="80" font-family="Impact" font-size="46" fill="#ff1e1e" stroke="#ffd200" stroke-width="1.5" paint-order="stroke">BUN</text>
      <text x="12" y="122" font-family="Impact" font-size="40" fill="#ffffff" stroke="#000" stroke-width="2" paint-order="stroke">MANIA</text>
      <text x="14" y="146" font-family="Arial Black" font-size="12" fill="#fff">THE MAIN EVENT</text>
      <text x="14" y="162" font-family="Arial" font-size="11" fill="#bbb">One cat. One belt. No rules.</text>
      ${pill(12, 196, 132, 32, 'ORDER NOW!', { from: '#ffd200', to: '#e08a00', size: 14, lit: f === 1 })}
      <rect x="0.5" y="0.5" width="299" height="249" fill="none" stroke="#ffd200"/>` } },

  // The video-store new release -> BUN AND THE STONE.
  { name: 'stone', w: 300, h: 250, async make() {
    const p = await pic(9, 130, 196, 'centre')
    return f => `<rect width="300" height="250" fill="#003a8c"/>
      <rect x="0" y="0" width="300" height="34" fill="#ffd200"/>
      <text x="150" y="24" text-anchor="middle" font-family="Arial Black" font-size="17" fill="#003a8c">NEW RELEASE · NOW ON VHS!</text>
      <rect x="12" y="44" width="134" height="200" fill="#000"/>${img(p, 14, 46, 130, 196)}
      <text x="79" y="66" text-anchor="middle" font-family="Times New Roman" font-weight="bold" font-size="14" fill="#fff" stroke="#000" stroke-width="2" paint-order="stroke">BUN AND THE STONE</text>
      <g font-family="Arial" fill="#fff"><text x="158" y="70" font-size="12" font-style="italic">"Two paws up!"</text>
        <text x="158" y="88" font-size="10" fill="#ffd200">★★★★★ Mosh Times</text>
        <text x="158" y="116" font-size="12" font-weight="bold">Only the true king</text><text x="158" y="132" font-size="12" font-weight="bold">can pull the bun.</text></g>
      ${pill(158, 196, 130, 30, 'RENT IT TODAY', { from: '#ffd200', to: '#e0a800', ink: '#003a8c', size: 12, lit: f === 1 })}
      <text x="223" y="244" text-anchor="middle" font-family="Arial" font-size="8" fill="#9db8e8">Be kind, rewind.</text>` } },

  // The summer-blockbuster teaser -> INFINITY BUN.
  { name: 'infinity', w: 300, h: 250, async make() {
    const p = await pic(3, 300, 250, 'centre')
    return f => `${img(p, 0, 0, 300, 250)}
      <defs><linearGradient id="vig" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.92"/></linearGradient></defs>
      <rect width="300" height="250" fill="url(#vig)"/>
      <text x="150" y="176" text-anchor="middle" font-family="Arial Black" font-size="30" letter-spacing="3" fill="#ffffff">INFINITY BUN</text>
      <text x="150" y="196" text-anchor="middle" font-family="Arial" font-size="11" letter-spacing="4" fill="#e9c46a">ONE SNAP. ALL THE BUNS.</text>
      <text x="150" y="226" text-anchor="middle" font-family="Arial Black" font-size="13" fill="${f ? '#ffd200' : '#ffffff'}">COMING SOON TO A MOSH PIT NEAR YOU</text>` } },

  // The sandwich-shop ad -> the BUN-WICH.
  { name: 'bunwich', w: 300, h: 250, async make() {
    const p = await pic(30, 300, 150, 'centre')
    return f => `<rect width="300" height="250" fill="#005a2b"/>${img(p, 0, 0, 300, 150)}
      <rect x="0" y="150" width="300" height="100" fill="#ffd200"/>
      <path d="M0 150 L300 150 L300 160 L0 168 Z" fill="#005a2b"/>
      <text x="14" y="198" font-family="Arial Black" font-size="27" fill="#005a2b">THE BUN-WICH</text>
      <text x="14" y="218" font-family="Arial" font-weight="bold" font-size="12" fill="#004020">Freshly bundled. Every day.</text>
      <text x="14" y="238" font-family="Arial" font-size="9" fill="#004020">Toppings: cat. That's it.</text>
      ${pill(200, 208, 90, 30, 'EAT BUN', { from: '#2bb34a', to: '#005a2b', ink: '#fff', size: 13, lit: f === 1 })}
      <rect x="0.5" y="0.5" width="299" height="249" fill="none" stroke="#004020"/>` } },

  // The supermarket weekly circular -> FRESH BUNS, aisle 9.
  { name: 'aisle9', w: 250, h: 250, async make() {
    const p = await pic(35, 150, 160, 'north')
    return f => `<rect width="250" height="250" fill="#fff"/>
      <rect width="250" height="40" fill="#d81e1e"/>
      <text x="125" y="27" text-anchor="middle" font-family="Arial Black" font-size="17" fill="#fff">THIS WEEK ONLY!</text>
      ${img(p, 0, 40, 150, 160)}
      <g transform="rotate(8 200 100)"><path d="M160 60 L245 60 L245 140 L160 140 Z" fill="#ffd200" stroke="#d81e1e" stroke-width="3"/>
        <text x="202" y="92" text-anchor="middle" font-family="Arial Black" font-size="13" fill="#d81e1e">BUY 1</text>
        <text x="202" y="112" text-anchor="middle" font-family="Arial Black" font-size="13" fill="#d81e1e">GET 1</text>
        <text x="202" y="132" text-anchor="middle" font-family="Impact" font-size="${f ? 20 : 18}" fill="#000">BUN</text></g>
      <rect y="200" width="250" height="50" fill="#1d4fa8"/>
      <text x="12" y="222" font-family="Arial Black" font-size="15" fill="#fff">FRESH BAKED BUNS</text>
      <text x="12" y="240" font-family="Arial" font-size="11" fill="#ffd200">Aisle 9 · while cats last</text>` } },

  // The sports-network promo -> the pillow-fight championship.
  { name: 'pillow', w: 300, h: 250, async make() {
    const p = await pic(47, 300, 200, 'centre')
    return f => `<rect width="300" height="250" fill="#111"/>${img(p, 0, 0, 300, 200)}
      <rect x="0" y="0" width="74" height="26" fill="#c80000"/><text x="37" y="18" text-anchor="middle" font-family="Arial Black" font-size="13" fill="#fff">${f ? '● LIVE' : '○ LIVE'}</text>
      <rect y="168" width="300" height="82" fill="#111" opacity="0.92"/>
      <text x="12" y="192" font-family="Arial Black" font-style="italic" font-size="17" fill="#fff">WORLD PILLOW FIGHT</text>
      <text x="12" y="212" font-family="Arial Black" font-style="italic" font-size="17" fill="#ffd200">CHAMPIONSHIP</text>
      <text x="12" y="236" font-family="Arial" font-size="11" fill="#bbb">SAT 8PM · MOSH SPORTS</text>
      ${pill(206, 214, 84, 28, 'WATCH', { from: '#ff4a2e', to: '#c3170b', ink: '#fff', size: 13, lit: f === 1 })}` } },

  // The e-mail newsletter sign-up -> daily affirmations.
  { name: 'smiling', w: 250, h: 250, async make() {
    const p = await pic(33, 110, 140, 'north')
    return f => `<rect width="250" height="250" fill="#fff6d8"/>
      <rect width="250" height="36" fill="#ff8fb1"/>
      <text x="125" y="24" text-anchor="middle" font-family="Comic Sans MS" font-weight="bold" font-size="16" fill="#fff">☺ Daily Affirmations ☺</text>
      <rect x="10" y="46" width="114" height="144" fill="#fff" stroke="#ff8fb1" stroke-width="2"/>${img(p, 12, 48, 110, 140)}
      <g font-family="Comic Sans MS" font-size="13" fill="#7a3b4f"><text x="134" y="70">Smiling</text><text x="134" y="88">through</text><text x="134" y="106">it all!</text>
        <text x="134" y="140" font-size="11">One cat. One</text><text x="134" y="155" font-size="11">smile. Every</text><text x="134" y="170" font-size="11">morning.</text></g>
      <rect x="10" y="202" width="130" height="24" fill="#fff" stroke="#999"/><text x="16" y="218" font-family="Arial" font-size="11" fill="#aaa">your@email.com</text>
      ${pill(146, 200, 94, 28, 'SIGN UP!', { from: '#ff8fb1', to: '#e0406f', ink: '#fff', size: 12, lit: f === 1 })}` } },

  // The sitcom promo -> THE BIG $BUN THEORY.
  { name: 'theory', w: 300, h: 250, async make() {
    const p = await pic(14, 300, 170, 'centre')
    return f => `<rect width="300" height="250" fill="#120830"/>${img(p, 0, 0, 300, 170)}
      <rect y="170" width="300" height="80" fill="#120830"/>
      <text x="150" y="196" text-anchor="middle" font-family="Arial Black" font-size="13" fill="#c6a8ff" letter-spacing="2">ALL-NEW EPISODES</text>
      <text x="150" y="218" text-anchor="middle" font-family="Arial Black" font-size="18" fill="#fff">THURSDAYS 8/7c</text>
      <rect x="96" y="226" width="108" height="18" rx="9" fill="${f ? '#c6a8ff' : '#5b2bd6'}"/>
      <text x="150" y="239" text-anchor="middle" font-family="Arial Black" font-size="10" fill="${f ? '#120830' : '#fff'}">ON MOSH NETWORK</text>` } },

  // The PC-game box ad -> BUN, rated M for Meow.
  { name: 'doom', w: 250, h: 250, async make() {
    const p = await pic(46, 130, 196, 'north')
    return f => `<rect width="250" height="250" fill="#1a0000"/>
      ${stars(14, 250, 250, '#ff400033')}
      <g transform="rotate(-4 75 125)"><rect x="12" y="24" width="134" height="200" fill="#000" stroke="#7a0000" stroke-width="2"/>${img(p, 14, 26, 130, 196)}
        <rect x="16" y="196" width="24" height="24" fill="#fff"/><text x="28" y="214" text-anchor="middle" font-family="Arial Black" font-size="16">M</text></g>
      <text x="198" y="54" text-anchor="middle" font-family="Impact" font-size="20" fill="#ff5a00">RATED M</text>
      <text x="198" y="72" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="11" fill="#fff">for MEOW</text>
      <g font-family="Arial" font-size="10.5" fill="#ffb07a"><text x="160" y="104">✓ Rip and bun</text><text x="160" y="122">✓ 666 rats</text><text x="160" y="140">✓ No wallet</text></g>
      ${pill(156, 176, 84, 30, 'PLAY', { from: '#ff7a00', to: '#c00000', ink: '#fff', size: 15, lit: f === 1, font: 'Impact' })}
      <text x="125" y="244" text-anchor="middle" font-family="Arial" font-size="10" fill="#aa6a4a">Sold wherever bun is sold.</text>` } },

  // The extreme-sports cereal ad -> BUNDLE TO THE EXTREME!
  { name: 'extreme', w: 300, h: 250, async make() {
    const p = await pic(22, 150, 112, 'centre')
    return f => `<rect width="300" height="250" fill="${f ? '#00e5ff' : '#ff2bd6'}"/>
      ${[...Array(9)].map((_, i) => `<path d="M${i * 40 - 20} 250 L${i * 40 + 40} 0 L${i * 40 + 55} 0 L${i * 40 - 5} 250 Z" fill="${f ? '#ff2bd6' : '#00e5ff'}" opacity="0.5"/>`).join('')}
      <rect x="12" y="78" width="154" height="116" fill="#fff" stroke="#000" stroke-width="3" transform="rotate(-3 89 136)"/>${img(p, 14, 80, 150, 112, 'transform="rotate(-3 89 136)"')}
      <text x="150" y="40" text-anchor="middle" font-family="Impact" font-size="34" fill="#ffe600" stroke="#000" stroke-width="3" paint-order="stroke" transform="rotate(-4 150 40)">BUNDLE TO THE</text>
      <text x="230" y="120" text-anchor="middle" font-family="Impact" font-size="40" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke" transform="rotate(8 230 120)">XTREME!</text>
      <text x="236" y="158" text-anchor="middle" font-family="Arial Black" font-size="11" fill="#000">TOTALLY RADICAL</text>
      ${pill(176, 200, 112, 32, 'GO XTREME', { from: '#ffe600', to: '#ff9a00', size: 13, lit: f === 1, font: 'Impact' })}` } },

  // The instant-messenger pop-up -> You've got BUN!
  { name: 'buddy', w: 250, h: 250, async make() {
    const p = await pic(32, 80, 80, 'contain')
    return f => `<rect width="250" height="250" fill="#d4d0c8"/>
      <rect x="2" y="2" width="246" height="18" fill="#0a246a"/><text x="7" y="15" font-family="Tahoma" font-weight="bold" font-size="10.5" fill="#fff">BunBuddy42 - Instant Message</text>
      <rect x="230" y="4" width="15" height="13" fill="#d4d0c8" stroke="#fff"/><text x="237.5" y="14.5" text-anchor="middle" font-family="Tahoma" font-weight="bold" font-size="10">×</text>
      <rect x="6" y="24" width="238" height="150" fill="#fff" stroke="#808080"/>
      <g font-family="Arial" font-size="12"><text x="12" y="44"><tspan fill="#d00" font-weight="bold">BunBuddy42:</tspan> hey</text>
        <text x="12" y="64"><tspan fill="#d00" font-weight="bold">BunBuddy42:</tspan> u there??</text>
        <text x="12" y="84"><tspan fill="#d00" font-weight="bold">BunBuddy42:</tspan> he bought $BUN</text>
        <text x="12" y="104"><tspan fill="#00d" font-weight="bold">You:</tspan> who</text>
        <text x="12" y="124"><tspan fill="#d00" font-weight="bold">BunBuddy42:</tspan> look →</text></g>
      <rect x="158" y="88" width="80" height="80" fill="#fff" stroke="#808080"/>${img(p, 158, 88, 80, 80)}
      <rect x="6" y="180" width="238" height="30" fill="#fff" stroke="#808080"/><text x="12" y="200" font-family="Arial" font-size="12" fill="#999">${f ? '|' : ''}</text>
      <text x="10" y="238" font-family="Arial Black" font-size="15" fill="#0a246a">You've got BUN!</text>
      <rect x="180" y="220" width="62" height="24" fill="#d4d0c8" stroke="#000" stroke-width="${f ? 2 : 1}"/><text x="211" y="236" text-anchor="middle" font-family="Tahoma" font-size="11">Send</text>` } },

  // The travel agency deal -> Bun Island.
  { name: 'island', w: 300, h: 250, async make() {
    const p = await pic(38, 300, 250, 'centre')
    return f => `${img(p, 0, 0, 300, 250)}
      <rect x="0" y="0" width="300" height="56" fill="#fff" opacity="0.88"/>
      <text x="150" y="26" text-anchor="middle" font-family="Georgia" font-style="italic" font-size="22" fill="#0a5aa8">Escape to Bun Island</text>
      <text x="150" y="46" text-anchor="middle" font-family="Arial" font-size="11" fill="#333">Sun. Sea. Absolutely no red candles.</text>
      <g transform="rotate(-10 238 150)"><circle cx="238" cy="150" r="40" fill="#ffd200" stroke="#fff" stroke-width="3"/>
        <text x="238" y="146" text-anchor="middle" font-family="Arial Black" font-size="12" fill="#c00">ALL</text><text x="238" y="162" text-anchor="middle" font-family="Arial Black" font-size="12" fill="#c00">INCLUSIVE</text></g>
      ${pill(14, 206, 128, 30, 'BOOK NOW »', { from: '#4fa3ff', to: '#0a5aa8', ink: '#fff', size: 13, lit: f === 1 })}` } },

  // The dating site -> single knights in your area.
  { name: 'singles', w: 300, h: 250, async make() {
    const p = await pic(6, 124, 150, 'north'), q = await pic(45, 124, 150, 'north')
    return f => `<rect width="300" height="250" fill="#ffe8f0"/>
      <text x="150" y="30" text-anchor="middle" font-family="Georgia" font-weight="bold" font-size="20" fill="#c2185b">Lonely this weekend?</text>
      <text x="150" y="50" text-anchor="middle" font-family="Arial" font-size="12" fill="#555">Meet single knights in your area!</text>
      <rect x="18" y="60" width="128" height="154" fill="#fff" stroke="#e8a0bd" stroke-width="2"/>${img(p, 20, 62, 124, 150)}
      <rect x="154" y="60" width="128" height="154" fill="#fff" stroke="#e8a0bd" stroke-width="2"/>${img(q, 156, 62, 124, 150)}
      <rect x="20" y="192" width="124" height="20" fill="#000" opacity="0.6"/><text x="82" y="206" text-anchor="middle" font-family="Arial" font-size="10" fill="#fff">Sir Bun, 3 · 0.2 mi</text>
      <rect x="156" y="192" width="124" height="20" fill="#000" opacity="0.6"/><text x="218" y="206" text-anchor="middle" font-family="Arial" font-size="10" fill="#fff">Lady Bun, 2 · 0.4 mi</text>
      <text x="150" y="136" text-anchor="middle" font-size="28" fill="${f ? '#ff2a6a' : '#c2185b'}">♥</text>
      <rect x="90" y="220" width="120" height="24" rx="12" fill="${f ? '#ff2a6a' : '#c2185b'}"/><text x="150" y="236" text-anchor="middle" font-family="Arial Black" font-size="11" fill="#fff">VIEW PROFILES</text>` } },

  // The free-screensaver download -> the Bun screensaver.
  { name: 'screensaver', w: 250, h: 250, async make() {
    const p = await pic(16, 180, 110, 'centre')
    return f => `<rect width="250" height="250" fill="#008080"/>
      <text x="125" y="30" text-anchor="middle" font-family="Arial Black" font-size="21" fill="#fff" stroke="#003" stroke-width="1">FREE SCREENSAVER!</text>
      <rect x="30" y="42" width="190" height="130" rx="6" fill="#d4d0c8" stroke="#000"/>
      <rect x="40" y="50" width="170" height="104" fill="#000"/>${img(p, 40, 50, 170, 104)}
      <rect x="100" y="172" width="50" height="8" fill="#d4d0c8" stroke="#000"/><rect x="80" y="180" width="90" height="6" fill="#d4d0c8" stroke="#000"/>
      <text x="125" y="204" text-anchor="middle" font-family="Verdana" font-size="11" fill="#fff">The Bun is ALWAYS watching.</text>
      <rect x="54" y="214" width="142" height="28" fill="#d4d0c8" stroke="${f ? '#000' : '#fff'}" stroke-width="2"/>
      <text x="125" y="233" text-anchor="middle" font-family="Tahoma" font-weight="bold" font-size="13">Get it now!</text>` } },

  // The personality-quiz skyscraper -> WHICH BUN ARE YOU?
  { name: 'quiz', w: 160, h: 600, async make() {
    const ps = await Promise.all([6, 13, 45, 12].map(n => pic(n, 68, 68, 'north')))
    const names = ['Brave', 'Chill', 'Happy', 'Ninja']
    return f => `<rect width="160" height="600" fill="#6a1b9a"/>
      ${stars(20, 160, 600)}
      <text x="80" y="40" text-anchor="middle" font-family="Arial Black" font-size="21" fill="#ffeb3b">WHICH</text>
      <text x="80" y="70" text-anchor="middle" font-family="Arial Black" font-size="27" fill="#fff">BUN</text>
      <text x="80" y="98" text-anchor="middle" font-family="Arial Black" font-size="21" fill="#ffeb3b">ARE YOU?</text>
      ${ps.map((p, i) => { const x = 8 + (i % 2) * 76, y = 116 + Math.floor(i / 2) * 104
        return `<rect x="${x}" y="${y}" width="68" height="92" fill="#fff"/>${img(p, x, y, 68, 68)}<text x="${x + 34}" y="${y + 84}" text-anchor="middle" font-family="Arial Black" font-size="11" fill="#6a1b9a">${names[i]}</text>` }).join('')}
      <g font-family="Arial" font-size="12" fill="#fff" text-anchor="middle"><text x="80" y="356">Take the 10-second</text><text x="80" y="372">quiz and find out!</text></g>
      <text x="80" y="420" text-anchor="middle" font-family="Arial Black" font-size="15" fill="#ffeb3b">98% of cats</text>
      <text x="80" y="438" text-anchor="middle" font-family="Arial Black" font-size="15" fill="#ffeb3b">get this wrong!</text>
      ${pill(14, 470, 132, 40, 'START QUIZ', { from: '#ffeb3b', to: '#f5a700', ink: '#4a0072', size: 15, lit: f === 1 })}
      <text x="80" y="560" text-anchor="middle" font-family="Arial" font-size="9" fill="#d1a6e8">Results not scientific.</text>` } },

  // HOT or NOT -> rate this cat.
  { name: 'hotornot', w: 160, h: 600, async make() {
    const p = await pic(21, 144, 200, 'centre')
    return f => `<rect width="160" height="600" fill="#fff"/>
      <rect width="160" height="70" fill="#d81e1e"/>
      <text x="80" y="34" text-anchor="middle" font-family="Arial Black" font-size="23" fill="#fff">HOT <tspan font-size="14">or</tspan></text>
      <text x="80" y="60" text-anchor="middle" font-family="Arial Black" font-size="23" fill="#fff">NOT?</text>
      <rect x="6" y="80" width="148" height="204" fill="#000"/>${img(p, 8, 82, 144, 200)}
      <text x="80" y="310" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="13" fill="#333">Rate this cat!</text>
      ${[...Array(10)].map((_, i) => { const x = 10 + (i % 5) * 29, y = 324 + Math.floor(i / 5) * 32, on = f && i === 9
        return `<rect x="${x}" y="${y}" width="26" height="26" fill="${on ? '#d81e1e' : '#eee'}" stroke="#999"/><text x="${x + 13}" y="${y + 18}" text-anchor="middle" font-family="Arial Black" font-size="12" fill="${on ? '#fff' : '#333'}">${i + 1}</text>` }).join('')}
      <text x="80" y="424" text-anchor="middle" font-family="Arial" font-size="11" fill="#666">Average: <tspan font-weight="bold" fill="#d81e1e">10.0</tspan></text>
      <text x="80" y="442" text-anchor="middle" font-family="Arial" font-size="11" fill="#666">(4,201 votes)</text>
      ${pill(14, 488, 132, 38, 'VOTE NOW!', { from: '#ff4a2e', to: '#c3170b', ink: '#fff', size: 14, lit: f === 1 })}
      <rect x="0.5" y="0.5" width="159" height="599" fill="none" stroke="#999"/>` } },

  // PUNCH THE MONKEY -> hit the rat.
  { name: 'punch', w: 468, h: 60, async make() {
    const p = await pic(23, 90, 60, 'contain')
    const rx = [300, 340, 380][0]
    return f => `<rect width="468" height="60" fill="#ffe600"/>
      ${img(p, 0, 0, 90, 60)}
      <text x="100" y="26" font-family="Impact" font-size="20" fill="#d81e1e">HIT THE RAT</text>
      <text x="100" y="48" font-family="Arial Black" font-size="11" fill="#000">AND WIN A HIGH FIVE!</text>
      ${[0, 1, 2, 3, 4].map(i => `<rect x="${250 + i * 34}" y="10" width="30" height="40" fill="#fff" stroke="#000"/>`).join('')}
      <text x="${f ? 299 : 367}" y="40" text-anchor="middle" font-size="22">🐀</text>
      <text x="${f ? 299 : 367}" y="24" text-anchor="middle" font-family="Arial Black" font-size="9" fill="#d81e1e">${f ? '' : 'POW!'}</text>
      <rect x="428" y="12" width="34" height="36" fill="#d81e1e"/><text x="445" y="35" text-anchor="middle" font-family="Arial Black" font-size="10" fill="#fff">GO!</text>
      <rect x="0.5" y="0.5" width="467" height="59" fill="none" stroke="#000"/>` } },

  // The dial-up free-hours CD -> 700 HOURS OF BUN.
  { name: 'dialup', w: 468, h: 60, async make() {
    const p = await pic(42, 70, 60, 'contain')
    return f => `<defs><linearGradient id="cd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9bf"/><stop offset="0.5" stop-color="#fdf"/><stop offset="1" stop-color="#9fd"/></linearGradient></defs>
      <rect width="468" height="60" fill="#0b2a7a"/>
      <circle cx="35" cy="30" r="27" fill="url(#cd)" stroke="#fff"/><circle cx="35" cy="30" r="5" fill="#0b2a7a"/>
      ${img(p, 72, 0, 70, 60)}
      <text x="152" y="27" font-family="Arial Black" font-size="19" fill="#ffd200">700 HOURS OF BUN</text>
      <text x="152" y="46" font-family="Arial" font-size="11" fill="#fff">Dial in at 56k. ${f ? 'Connected!' : 'Connecting...'}</text>
      ${pill(372, 16, 88, 28, 'SIGN ON', { from: '#ffd200', to: '#e08a00', ink: '#0b2a7a', size: 12, lit: f === 1 })}` } },

  // The search-engine banner -> Ask Bun.
  { name: 'askbun', w: 468, h: 60, async make() {
    const p = await pic(21, 70, 60, 'centre')
    return f => `<rect width="468" height="60" fill="#fff"/>
      ${img(p, 0, 0, 70, 60)}
      <text x="80" y="26" font-family="Georgia" font-weight="bold" font-size="20" fill="#c2185b">Ask Bun<tspan font-size="11" fill="#666">.com</tspan></text>
      <text x="80" y="46" font-family="Arial" font-size="11" fill="#555">Got a question? Ask a cat.</text>
      <rect x="248" y="18" width="150" height="24" fill="#fff" stroke="#7a9cc6"/><text x="254" y="34" font-family="Arial" font-size="11" fill="#999">is bun the one?${f ? '|' : ''}</text>
      <rect x="404" y="18" width="56" height="24" fill="#d4d0c8" stroke="#808080"/><text x="432" y="34" text-anchor="middle" font-family="Tahoma" font-weight="bold" font-size="11">Ask!</text>
      <rect x="0.5" y="0.5" width="467" height="59" fill="none" stroke="#7a9cc6"/>` } },
)

/** The size the page shows an ad at (lib/banners MEME_ADS): no wider than its column. */
const shown = ad => {
  const max = ad.h === 60 ? 468 : ad.h >= 600 ? 160 : 250
  // The squares are drawn to fill 250 wide (a 200x200 grows; vector, so it stays sharp).
  const k = ad.h === 60 || ad.h >= 600 ? Math.min(1, max / ad.w) : max / ad.w
  return [Math.round(ad.w * k), Math.round(ad.h * k)]
}
/*
 * UNIFORM SQUARES (JP, 2026-10-14: "make the ads be uniform"): every square-slot ad
 * is saved 250x250. A 300x250 design, drawn 250x208, gets a band above and below in
 * the average colour of its own top and bottom edge, so every
 * column cell is the same size.
 */
const square = ad => ad.h !== 60 && ad.h < 600
/*
 * READABLE (JP, 2026-10-14: "make sure its readable to users"): no word on an ad is
 * smaller than MIN_PX as the page shows it. A 300x250 is shown at 250, so its small
 * print is raised to MIN_PX / (250/300) in its own units. Single symbols (the stars,
 * the window buttons) keep their size.
 */
const MIN_PX = 10
/** Lay classic.mjs's cheap animation for frame f over a finished frame (PNG buffer, fw x fh). */
async function withDecor(png, name, fw, fh, f) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${fw * X}" height="${fh * X}" viewBox="0 0 ${fw} ${fh}">${decorate(name, fw, fh, f)}</svg>`
  const top = await sharp(Buffer.from(svg)).resize(fw, fh, { kernel: 'lanczos3' }).png().toBuffer()
  return sharp(png).composite([{ input: top, left: 0, top: 0 }]).png().toBuffer()
}

const readable = (svg, k) => svg.replace(/font-size="([0-9.]+)"([^>]*>)([^<]*)/g, (all, size, rest, text) =>
  text.trim().length <= 1 || +size * k >= MIN_PX ? all : `font-size="${(MIN_PX / k).toFixed(1)}"${rest}${text}`)
/*
 * THE MINIS (JP: "make sure its readable to users"): a 250 square shrunk to the
 * medium columns' 125 has words too small to read, so each square has its own
 * 125x125: its picture and one big title. -> bun-x-<name>-mini.webp
 */
const MINI = {
  getby: [39, 'GOT $BUN?'], career: [37, 'CAREER'], nowall: [36, 'NO WALL'], beforeyougo: [46, 'DID U KNOW'],
  comfy: [40, 'COMFY'], bundog: [25, 'BUN DOG'], throne: [29, 'THE THRONE'], storm: [41, 'BUN STORM'],
  energy: [31, 'BUN ENERGY'], trick: [18, '1 WEIRD TRICK'], virus: [21, 'VIRUS ALERT'], bunmania: [20, 'BUNMANIA'],
  stone: [9, 'NOW ON VHS'], infinity: [3, 'INFINITY'], bunwich: [30, 'BUN-WICH'], aisle9: [35, 'FRESH BUNS'],
  pillow: [47, 'PILLOW FIGHT'], smiling: [45, 'SMILE!'], theory: [14, 'BUN THEORY'], doom: [46, 'RATED M'],
  extreme: [22, 'XTREME!', 'contain'], buddy: [32, 'BUNBUDDY', 'contain'], island: [38, 'BUN ISLAND'],
  singles: [6, 'SINGLES'], screensaver: [16, 'SCREENSAVER'],
}
async function miniOf(name) {
  const [n, title, pos] = MINI[name]
  const p = await pic(n, 125, 125, pos || 'north')
  const size = title.length > 10 ? 12 : 15
  return f => `${img(p, 0, 0, 125, 125)}
    <rect y="91" width="125" height="34" fill="${f ? '#c00000' : '#0b1f5c'}" opacity="0.93"/>
    <text x="62.5" y="${108 + size * 0.36}" text-anchor="middle" font-family="Arial Black" font-size="${size}" fill="${f ? '#ffffff' : '#ffd200'}">${title.replace(/&/g, '&amp;')}</text>
    <rect x="0.5" y="0.5" width="124" height="124" fill="none" stroke="#0b1f5c"/>`
}
// "node scripts/make-memeads.mjs comfy storm" makes just those.
const only = process.argv.slice(2)
for (const ad of ADS.filter(a => !only.length || only.includes(a.name))) {
  const draw = await ad.make()
  // AUDIT=1: list every text smaller than 10 px as the page shows it (readability sweep).
  if (process.env.AUDIT) {
    const k = shown(ad)[0] / ad.w, svg = readable(draw(0), k)
    for (const m of svg.matchAll(/font-size="([0-9.]+)"[^>]*>([^<]{0,40})/g)) if (+m[1] * k < 10) console.log(ad.name.padEnd(12), (+m[1] * k).toFixed(1).padStart(5), m[2])
    continue
  }
  const dir = join(tmpdir(), 'memead-' + ad.name)
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  const [sw, sh] = shown(ad)
  for (let f = 0; f < FRAMES; f++) {
    // The ad's own coordinates (viewBox), rasterised at 2x the shown size, then brought down.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sw * X}" height="${sh * X}" viewBox="0 0 ${ad.w} ${ad.h}">${readable(draw(blinkOf(f)), sw / ad.w)}</svg>`
    const px = sharp(await sharp(Buffer.from(svg)).resize(sw, sh, { kernel: 'lanczos3' }).png().toBuffer())
    const pad = square(ad) ? 250 - sh : 0
    if (pad > 0) {
      // Each band in the average colour of the edge it continues: no streaks from a photo's edge.
      const raw = await px.clone().png().toBuffer()
      const avg = async top => { const { data } = await sharp(raw).extract({ left: 0, top, width: sw, height: 2 }).resize(1, 1).raw().toBuffer({ resolveWithObject: true }); return { r: data[0], g: data[1], b: data[2], alpha: 1 } }
      const top = await avg(3), bot = await avg(sh - 5)          // inside any 1px border
      const t = Math.floor(pad / 2), b = Math.ceil(pad / 2)
      const full = await sharp({ create: { width: sw, height: 250, channels: 4, background: top } })
        .composite([{ input: { create: { width: sw, height: b + 1, channels: 4, background: bot } }, left: 0, top: 250 - b - 1 }, { input: raw, left: 0, top: t }])
        .png().toBuffer()
      await sharp(await withDecor(full, ad.name, sw, 250, f)).toFile(join(dir, `f00${f}.png`))
    } else await sharp(await withDecor(await px.png().toBuffer(), ad.name, sw, sh, f)).toFile(join(dir, `f00${f}.png`))
  }
  const out = join(OUT, `bun-x-${ad.name}.gif`)
  encodeGif(dir, out)
  rmSync(dir, { recursive: true, force: true })
  if (MINI[ad.name]) {
    const draw2 = await miniOf(ad.name)
    const d2 = join(tmpdir(), 'memead-mini-' + ad.name)
    rmSync(d2, { recursive: true, force: true }); mkdirSync(d2, { recursive: true })
    for (let f = 0; f < FRAMES; f++) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${125 * X}" height="${125 * X}" viewBox="0 0 125 125">${draw2(blinkOf(f))}</svg>`
      const png = await sharp(Buffer.from(svg)).resize(125, 125, { kernel: 'lanczos3' }).png().toBuffer()
      await sharp(await withDecor(png, ad.name + '-mini', 125, 125, f)).toFile(join(d2, `f00${f}.png`))
    }
    encodeGif(d2, join(OUT, `bun-x-${ad.name}-mini.gif`))
    rmSync(d2, { recursive: true, force: true })
  }
  console.log('ok', out)
}
