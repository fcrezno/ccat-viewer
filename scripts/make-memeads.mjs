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
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'

const FFMPEG = 'C:/Users/JPDom/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe'
const OUT = 'public/flyers'
const MEME = n => `public/ratx/memes/${String(n).padStart(2, '0')}.jpg`

/** A meme cropped to w x h, as a data URI for the SVG. */
async function pic(n, w, h, position = 'centre') {
  // position may be a number: the crop's centre, 0..1 across the picture.
  const png = typeof position === 'number'
    ? await sharp(await sharp(MEME(n)).resize({ height: h }).toBuffer()).metadata().then(async m => sharp(await sharp(MEME(n)).resize({ height: h }).toBuffer())
        .extract({ left: Math.max(0, Math.min(m.width - w, Math.round(m.width * position - w / 2))), top: 0, width: w, height: h }).png().toBuffer())
    : await sharp(MEME(n)).resize(w, h, { fit: 'cover', position }).png().toBuffer()
  return 'data:image/png;base64,' + png.toString('base64')
}
const img = (uri, x, y, w, h, extra = '') => `<image href="${uri}" x="${x}" y="${y}" width="${w}" height="${h}" ${extra}/>`

/** A rounded glossy button: the 2004 "LEARN MORE" pill. `lit` is the blink frame. */
function pill(x, y, w, h, label, { from, to, ink = '#1a1a1a', size = 14, lit = false, font = 'Arial Black' }) {
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
      <text x="7" y="15" font-family="Tahoma" font-weight="bold" font-size="10.5" fill="#fff">Special Offer - Microsoft Internet Explorer</text>
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
      <text x="10" y="171" font-family="Verdana" font-weight="bold" font-size="10" fill="#ffe94a">A WALL OF BUN IS MOVING THROUGH YOUR AREA</text>
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
      <text x="7" y="15" font-family="Tahoma" font-weight="bold" font-size="10.5" fill="#fff">System Alert - Microsoft Internet Explorer</text>
      <rect x="280" y="4" width="15" height="13" fill="#d4d0c8" stroke="#fff"/><text x="287.5" y="14.5" text-anchor="middle" font-family="Tahoma" font-weight="bold" font-size="10">×</text>
      <circle cx="30" cy="48" r="16" fill="#ffd200" stroke="#000"/><text x="30" y="56" text-anchor="middle" font-family="Arial Black" font-size="22">!</text>
      <text x="54" y="44" font-family="Tahoma" font-weight="bold" font-size="14" fill="#c00">WARNING!</text>
      <text x="54" y="60" font-family="Tahoma" font-size="11">Your PC may be infected with</text>
      <text x="10" y="90" font-family="Tahoma" font-weight="bold" font-size="17" fill="#000">EXTREME CUTENESS</text>
      <text x="10" y="112" font-family="Tahoma" font-size="11">(1) BUN detected on this computer.</text>
      <text x="10" y="128" font-family="Tahoma" font-size="11">Scanning: C:\\Windows\\Bundle\\</text>
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

// "node scripts/make-memeads.mjs comfy storm" makes just those.
const only = process.argv.slice(2)
for (const ad of ADS.filter(a => !only.length || only.includes(a.name))) {
  const draw = await ad.make()
  const dir = join(tmpdir(), 'memead-' + ad.name)
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  for (const f of [0, 1]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ad.w}" height="${ad.h}">${draw(f)}</svg>`
    await sharp(Buffer.from(svg)).png().toFile(join(dir, `f00${f}.png`))
  }
  const out = join(OUT, `bun-x-${ad.name}.gif`)
  // Photos: a full palette and a fine dither, or the fur bands.
  const r = spawnSync(FFMPEG, ['-v', 'error', '-y', '-framerate', '1.5', '-i', join(dir, 'f%03d.png'),
    '-filter_complex', '[0]split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
    '-loop', '0', out], { stdio: 'inherit' })
  rmSync(dir, { recursive: true, force: true })
  if (r.status) throw new Error('ffmpeg failed for ' + out)
  console.log('ok', out)
}
