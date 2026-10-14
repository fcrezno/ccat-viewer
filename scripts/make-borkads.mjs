/**
 * KING BORK MEME ADS: the memes from memedepot.com/d/king-bork as 2000s web ads,
 * the way scripts/make-memeads.mjs does Bundle Cat (JP, 2026-10-14: "do the same
 * for king bork as well", "33").
 *
 *   node scripts/make-borkads.mjs [name ...]   -> public/flyers/bork-x-<name>.webp      (the ad)
 *                                                 public/flyers/bork-x-<name>-mini.webp (125x125, for the medium columns)
 *
 * Sources: the full-size memes in clanker-clips/bork-src/hi (NN.img, Meme Depot
 * page order; bork-src/list.json names them). Left out: the two Meme Depot blurs,
 * the pope, the SpongeBob background, and the ones that read as trading advice
 * ("BUY THE DIP", "just up", the BUY button, the rocket chart).
 *
 * Drawn at 2x and saved at the size shown: squares 250x250 (uniform with the
 * Bundle Cat squares), skyscrapers 160x600, banners 468x60. No word under 10 px.
 * Jokes stay jokes: no prices, no prizes, no money promises. Link: kingbork.fun.
 */
import sharp from 'sharp'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'
import { FRAMES, bevel, blinkOf, decorate, encodeGif } from './classic.mjs'

const FFMPEG = 'C:/Users/JPDom/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe'
const OUT = 'public/flyers'
const SRC = 'C:/Users/JPDom/clanker-clips/bork-src/hi'
const MEME = n => `${SRC}/${String(n).padStart(2, '0')}.img`
const X = 2
const MIN_PX = 10
/** Lay classic.mjs's cheap animation for frame f over a finished frame (PNG buffer, fw x fh). */
async function withDecor(png, name, fw, fh, f) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${fw * X}" height="${fh * X}" viewBox="0 0 ${fw} ${fh}">${decorate(name, fw, fh, f)}</svg>`
  const top = await sharp(Buffer.from(svg)).resize(fw, fh, { kernel: 'lanczos3' }).png().toBuffer()
  return sharp(png).composite([{ input: top, left: 0, top: 0 }]).png().toBuffer()
}


// King Bork's colours: royal red, crown gold, cream, ink.
const RED = '#b3122e', GOLD = '#f5c518', CREAM = '#fff4dc', INK = '#2a1408', NAVY = '#14214f'

async function pic(n, w0, h0, position = 'centre') {
  const w = w0 * X, h = h0 * X
  const fit = position === 'contain' ? { fit: 'contain', background: '#ffffff' } : { fit: 'cover', position }
  const png = await sharp(MEME(n)).resize(w, h, { ...fit, kernel: 'lanczos3' }).flatten({ background: '#ffffff' }).sharpen({ sigma: 0.5 }).png().toBuffer()
  return 'data:image/png;base64,' + png.toString('base64')
}
const img = (uri, x, y, w, h, extra = '') => `<image href="${uri}" x="${x}" y="${y}" width="${w}" height="${h}" ${extra}/>`
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
let gid = 0
function pill(x, y, w, h, label, { size = 14, lit = false } = {}) {
  return bevel(x, y, w, h, label, { size: Math.min(size, 14), lit })
}
function glossyPill(x, y, w, h, label, { from = GOLD, to = '#d99a00', ink = INK, size = 14, lit = false, font = 'Arial Black' } = {}) {
  const id = 'p' + (gid++)
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${lit ? '#ffffff' : from}"/><stop offset="0.45" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
    <rect x="${x + 2}" y="${y + 3}" width="${w}" height="${h}" rx="${h / 2.6}" fill="#000" opacity="0.35"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2.6}" fill="url(#${id})" stroke="${lit ? '#ffffff' : '#00000055'}" stroke-width="${lit ? 2 : 1}"/>
    <text x="${x + w / 2}" y="${y + h / 2 + size * 0.36}" text-anchor="middle" font-family="${font}" font-size="${size}" fill="${ink}">${esc(label)}</text>`
}
const crownMark = (x, y, s = 1) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 14 L3 2 L8 9 L12 0 L16 9 L21 2 L24 14 Z" fill="${GOLD}" stroke="${INK}" stroke-width="1"/>`
const lines = (arr, x, y, step, attrs) => arr.map((t, i) => `<text x="${x}" y="${y + i * step}" ${attrs}>${esc(t)}</text>`).join('')

// ── THE LAYOUTS (each 250x250, f = the blink frame) ──
const T = {
  /** Photo on top, a coloured band below with the words and the button. */
  photoTop: async a => { const p = await pic(a.meme, 250, 146, a.pos || 'north'); const bg = a.bg || RED, ink = a.ink || '#fff'
    return f => `<rect width="250" height="250" fill="${bg}"/>${img(p, 0, 0, 250, 146)}
      <rect y="146" width="250" height="4" fill="${GOLD}"/>
      <text x="125" y="178" text-anchor="middle" font-family="Arial Black" font-size="${a.headSize || 21}" fill="${ink}">${esc(a.head)}</text>
      <text x="125" y="198" text-anchor="middle" font-family="Verdana" font-size="11" fill="${ink}" opacity="0.92">${esc(a.sub)}</text>
      ${pill(62, 208, 126, 32, a.btn, { lit: f === 1 })}` },
  /** The picture full-bleed: a strip of words on top, the title and button on a dark foot. */
  overlay: async a => { const p = await pic(a.meme, 250, 250, a.pos || 'centre')
    return f => `${img(p, 0, 0, 250, 250)}
      <defs><linearGradient id="ov" x1="0" y1="0" x2="0" y2="1"><stop offset="0.38" stop-color="#000" stop-opacity="0"/><stop offset="0.62" stop-color="#000" stop-opacity="0.82"/><stop offset="1" stop-color="#000" stop-opacity="0.95"/></linearGradient></defs>
      <rect width="250" height="250" fill="url(#ov)"/>
      <rect width="250" height="26" fill="${a.bar || RED}"/><text x="125" y="18" text-anchor="middle" font-family="Arial Black" font-size="12" fill="${f ? GOLD : '#fff'}" letter-spacing="1">${esc(a.top)}</text>
      <text x="125" y="176" text-anchor="middle" font-family="${a.font || 'Arial Black'}" font-size="${a.headSize || 22}" fill="#fff" stroke="#000" stroke-width="2" paint-order="stroke">${esc(a.head)}</text>
      <text x="125" y="196" text-anchor="middle" font-family="Verdana" font-size="11" fill="${GOLD}">${esc(a.sub)}</text>
      ${pill(62, 207, 126, 32, a.btn, { lit: f === 1 })}` },
  /** Picture left, words right. */
  split: async a => { const p = await pic(a.meme, 118, 250, a.pos || 'centre'); const bg = a.bg || CREAM
    return f => `<rect width="250" height="250" fill="${bg}"/>${img(p, 0, 0, 118, 250)}<rect x="118" width="3" height="250" fill="${GOLD}"/>
      ${lines(a.head, 186, 44, 30, `text-anchor="middle" font-family="Georgia" font-weight="bold" font-size="${a.headSize || 22}" fill="${a.ink || RED}"`)}
      ${lines(a.sub, 186, 44 + a.head.length * 30 + 10, 16, `text-anchor="middle" font-family="Verdana" font-size="11" fill="${INK}"`)}
      ${pill(128, 204, 114, 32, a.btn, { from: a.btnFrom || RED, to: '#7a0a1e', ink: '#fff', size: 13, lit: f === 1 })}` },
  /** A Windows 98 dialog. */
  window: async a => { const p = await pic(a.meme, 96, 96, a.pos || 'centre')
    return f => `<rect width="250" height="250" fill="#d4d0c8" stroke="#000"/>
      <rect x="2" y="2" width="246" height="20" fill="${f ? '#0a246a' : '#1f4fbf'}"/>
      <text x="7" y="16" font-family="Tahoma" font-weight="bold" font-size="11" fill="#fff">${esc(a.title)}</text>
      <rect x="229" y="5" width="16" height="14" fill="#d4d0c8" stroke="#fff"/><text x="237" y="16" text-anchor="middle" font-family="Tahoma" font-weight="bold" font-size="11">×</text>
      <text x="12" y="46" font-family="Tahoma" font-weight="bold" font-size="15" fill="${a.headInk || '#c00'}">${esc(a.head)}</text>
      ${lines(a.sub, 12, 68, 16, `font-family="Tahoma" font-size="12" fill="#000"`)}
      <rect x="144" y="58" width="96" height="96" fill="#fff" stroke="#808080"/>${img(p, 144, 58, 96, 96)}
      <rect x="10" y="170" width="230" height="16" fill="#fff" stroke="#808080"/>
      ${[...Array(f ? 14 : 9)].map((_, i) => `<rect x="${12 + i * 16}" y="172" width="14" height="12" fill="#0a246a"/>`).join('')}
      ${a.btns.map((b, i) => `<rect x="${16 + i * 116}" y="204" width="104" height="30" fill="#d4d0c8" stroke="${i === 0 ? '#000' : '#808080'}" stroke-width="${i === 0 && f ? 2 : 1}"/><text x="${68 + i * 116}" y="224" text-anchor="middle" font-family="Tahoma" font-size="13" fill="${i === 0 ? '#000' : '#555'}">${esc(b)}</text>`).join('')}` },
  /** A starburst behind a round picture: the loud sale ad. */
  burst: async a => { const p = await pic(a.meme, 140, 140, a.pos || 'north'); const c1 = a.c1 || GOLD, c2 = a.c2 || '#ffde59'
    return f => `<rect width="250" height="250" fill="${c1}"/>
      ${[...Array(12)].map((_, i) => `<path d="M125 110 L${125 + 300 * Math.cos(i * Math.PI / 6)} ${110 + 300 * Math.sin(i * Math.PI / 6)} L${125 + 300 * Math.cos(i * Math.PI / 6 + 0.26)} ${110 + 300 * Math.sin(i * Math.PI / 6 + 0.26)} Z" fill="${c2}"/>`).join('')}
      <text x="125" y="32" text-anchor="middle" font-family="Impact" font-size="${a.headSize || 27}" fill="${RED}" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(a.head)}</text>
      <circle cx="125" cy="110" r="66" fill="#fff" stroke="${RED}" stroke-width="4"/>
      <clipPath id="cb"><circle cx="125" cy="110" r="62"/></clipPath><g clip-path="url(#cb)">${img(p, 55, 40, 140, 140)}</g>
      <g transform="rotate(-14 205 70)"><circle cx="205" cy="70" r="27" fill="${RED}" stroke="#fff" stroke-width="3"/><text x="205" y="77" text-anchor="middle" font-family="Arial Black" font-size="${f ? 18 : 16}" fill="#fff">${esc(a.badge || 'NEW!')}</text></g>
      <rect x="0" y="182" width="250" height="24" fill="${INK}" opacity="0.85"/>
      <text x="125" y="199" text-anchor="middle" font-family="Verdana" font-weight="bold" font-size="12" fill="#fff">${esc(a.sub)}</text>
      ${pill(62, 212, 126, 30, a.btn, { from: RED, to: '#7a0a1e', ink: '#fff', size: 13, lit: f === 1 })}` },
  /** The "Sponsored Links" text ad. */
  classified: async a => { const p = await pic(a.meme, 104, 104, a.pos || 'north')
    return f => `<rect width="250" height="250" fill="#fff"/><rect x="0.5" y="0.5" width="249" height="249" fill="none" stroke="#c9c9c9"/>
      <text x="10" y="20" font-family="Arial" font-size="10" fill="#888">Sponsored Links</text>
      ${img(p, 10, 30, 104, 104)}
      ${lines(a.head, 122, 46, 18, `font-family="Arial" font-weight="bold" font-size="15" fill="#1a0dab"`)}
      ${lines(a.sub, 122, 46 + a.head.length * 18 + 8, 16, `font-family="Arial" font-size="12" fill="#333"`)}
      <text x="10" y="156" font-family="Arial" font-size="11" fill="#006621">www.kingbork.fun</text>
      ${lines(a.foot || [], 10, 176, 16, `font-family="Arial" font-size="12" fill="#333"`)}
      ${pill(112, 206, 128, 30, a.btn, { from: '#f7f7f7', to: '#d6d6d6', ink: f ? '#c00' : '#1a0dab', size: 12 })}` },
  /** A royal decree on parchment, with a wax seal. */
  decree: async a => { const p = await pic(a.meme, 96, 96, a.pos || 'north')
    return f => `<rect width="250" height="250" fill="${RED}"/>
      <rect x="12" y="10" width="226" height="230" rx="6" fill="#f3e2b3" stroke="#8a6d3b" stroke-width="2"/>
      <rect x="12" y="10" width="226" height="10" rx="5" fill="#d8c189"/><rect x="12" y="230" width="226" height="10" rx="5" fill="#d8c189"/>
      ${crownMark(113, 26)}
      <text x="125" y="62" text-anchor="middle" font-family="Times New Roman" font-weight="bold" font-size="${a.headSize || 21}" fill="${RED}" letter-spacing="1">${esc(a.head)}</text>
      ${lines(a.sub, 24, 86, 17, `font-family="Times New Roman" font-style="italic" font-size="14" fill="${INK}"`)}
      <circle cx="186" cy="172" r="50" fill="#fff" stroke="#8a6d3b" stroke-width="2"/>
      <clipPath id="cd"><circle cx="186" cy="172" r="47"/></clipPath><g clip-path="url(#cd)">${img(p, 138, 124, 96, 96)}</g>
      <circle cx="54" cy="200" r="${f ? 20 : 18}" fill="#a3122b" stroke="#6a0a1a" stroke-width="2"/><text x="54" y="205" text-anchor="middle" font-family="Times New Roman" font-weight="bold" font-size="14" fill="#f3e2b3">KB</text>
      ${pill(24, 142, 100, 28, a.btn, { from: RED, to: '#7a0a1e', ink: '#fff', size: 13, lit: f === 1, font: 'Georgia' })}` },
  /** 160x600 skyscraper: title, two pictures, words, button. */
  tall: async a => { const p = await pic(a.meme, 144, 180, a.pos || 'north'), q = a.meme2 ? await pic(a.meme2, 144, 150, a.pos2 || 'north') : null
    return f => `<rect width="160" height="600" fill="${a.bg || RED}"/>
      ${lines(a.head, 80, 40, 30, `text-anchor="middle" font-family="Impact" font-size="${a.headSize || 28}" fill="${GOLD}" stroke="${INK}" stroke-width="1"`)}
      <rect x="6" y="${54 + (a.head.length - 1) * 30}" width="148" height="184" fill="#fff"/>${img(p, 8, 56 + (a.head.length - 1) * 30, 144, 180)}
      ${q ? `<rect x="6" y="${250 + (a.head.length - 1) * 30}" width="148" height="154" fill="#fff"/>${img(q, 8, 252 + (a.head.length - 1) * 30, 144, 150)}` : ''}
      ${lines(a.sub, 80, q ? 448 : 300, 18, `text-anchor="middle" font-family="Verdana" font-weight="bold" font-size="13" fill="#fff"`)}
      ${pill(14, 518, 132, 40, a.btn, { lit: f === 1, size: 15 })}
      <text x="80" y="584" text-anchor="middle" font-family="Verdana" font-size="10" fill="${GOLD}">kingbork.fun</text>` },
  /** 468x60 banner. */
  strip: async a => { const p = await pic(a.meme, 96, 60, a.pos || 'north')
    return f => `<rect width="468" height="60" fill="${a.bg || RED}"/>${img(p, 0, 0, 96, 60)}
      <text x="108" y="27" font-family="${a.font || 'Arial Black'}" font-size="${a.headSize || 19}" fill="${GOLD}">${esc(a.head)}</text>
      <text x="108" y="47" font-family="Verdana" font-size="12" fill="#fff">${esc(a.sub)}</text>
      ${pill(352, 15, 108, 30, a.btn, { lit: f === 1, size: 12 })}
      <rect x="0.5" y="0.5" width="467" height="59" fill="none" stroke="${INK}"/>` },
}

// ── THE 33 ADS ── (meme numbers: bork-src/sheet.jpg) ──
const ADS = [
  { name: 'decree', t: 'decree', meme: 3, head: 'HEAR YE! HEAR YE!', headSize: 17, sub: ['By order of the King,', 'all loyal subjects', 'must BORK daily.'], btn: 'OBEY', mini: 'HEAR YE!' },
  { name: 'movie', t: 'overlay', meme: 1, top: 'NOW SHOWING', head: 'KING BORK', sub: 'THE MOVIE · Bring popcorn.', btn: 'GET TICKETS', mini: 'NOW SHOWING' },
  { name: 'ball', t: 'overlay', meme: 17, top: 'TONIGHT ONLY', head: 'THE ROYAL BALL', sub: 'Fireworks at midnight', btn: 'RSVP', mini: 'ROYAL BALL' },
  { name: 'feast', t: 'photoTop', meme: 21, pos: 'centre', head: "THE KING'S FEAST", sub: 'All you can eat. Then more.', btn: 'RESERVE', mini: 'THE FEAST' },
  { name: 'paint', t: 'split', meme: 18, head: ['Paint', 'like a', 'KING'], sub: ['Royal Art School', 'No talent needed'], btn: 'ENROLL', mini: 'ART SCHOOL' },
  { name: 'gym', t: 'burst', meme: 14, head: 'GET RIPPED LIKE A KING', headSize: 22, badge: 'NEW!', sub: 'Royal Fitness · Day 1', btn: 'JOIN NOW', mini: 'ROYAL GYM' },
  { name: 'mobile', t: 'photoTop', meme: 13, pos: 'centre', head: 'ROYAL MOBILE', sub: 'Two phones. One king.', btn: 'SWITCH', bg: NAVY, mini: 'ROYAL MOBILE' },
  { name: 'winter', t: 'overlay', meme: 16, top: 'WINTER GETAWAY', head: 'MOUNT BORK', sub: 'Ski. Sled. Bork.', btn: 'BOOK NOW', bar: NAVY, mini: 'MOUNT BORK' },
  { name: 'tenten', t: 'classified', meme: 11, head: ['King Rates', 'Everything', '10/10'], sub: ['See what he', 'loves today'], foot: ["You won't believe #7."], btn: 'READ MORE »', mini: '10/10' },
  { name: 'lostcrown', t: 'window', meme: 9, title: 'Lost & Found - Internet Explorer', head: 'CROWN DROPPED!', sub: ['The King has', 'dropped his', 'crown. Again.'], btns: ['Pick it up', 'Leave it'], mini: 'CROWN LOST' },
  { name: 'court', t: 'burst', meme: 10, head: 'JOIN THE COURT!', badge: 'HI!', sub: 'The King wants YOU', btn: 'JOIN', c1: '#7fd3ff', c2: '#bfe9ff', mini: 'JOIN COURT' },
  { name: 'anger', t: 'window', meme: 20, pos: 'centre', title: 'Royal Alert - Internet Explorer', head: 'THE KING IS BORKING', headInk: '#c00', sub: ['Royal anger', 'level: MAX'], btns: ['Calm down', 'Bork back'], mini: 'BORK ALERT' },
  { name: 'tour', t: 'overlay', meme: 42, top: 'LIVE IN CONCERT', head: 'KING BORK', sub: 'WORLD TOUR 2026', btn: 'TICKETS', mini: 'WORLD TOUR' },
  { name: 'bakery', t: 'photoTop', meme: 44, pos: 'south', head: 'ROYAL BAKERY', sub: "Let's get this bread.", btn: 'ORDER', bg: '#8a4b12', mini: 'ROYAL BAKERY' },
  { name: 'yoga', t: 'split', meme: 45, head: ['Royal', 'Yoga'], sub: ['Find inner peace.', 'Even in here.'], btn: 'BREATHE', mini: 'ROYAL YOGA' },
  { name: 'borktv', t: 'overlay', meme: 48, top: 'ALL NEW', head: 'BORK TV', headSize: 30, sub: 'Broadcast yourself', btn: 'WATCH', bar: '#c2185b', mini: 'BORK TV' },
  { name: 'driving', t: 'photoTop', meme: 49, pos: 'centre', head: 'DRIVING SCHOOL', sub: 'Stop. Bork. Go.', btn: 'SIGN UP', bg: '#1b6b2f', mini: 'DRIVE SCHOOL' },
  { name: 'seal', t: 'decree', meme: 50, head: 'SEAL OF APPROVAL', headSize: 19, sub: ['Tested and approved', 'by the King himself.', 'Two thumbs. Up.'], btn: 'SEE WHY', mini: 'APPROVED' },
  { name: 'shades', t: 'burst', meme: 35, head: 'COOL SHADES SALE', badge: 'SALE', sub: 'Royal Optics: look like a king', btn: 'SHOP NOW', mini: 'SHADES SALE' },
  { name: 'queen', t: 'split', meme: 37, head: ['Find', 'your', 'Queen'], sub: ['Royal Dating', 'Kings near you'], btn: 'MEET', bg: '#ffe8f0', mini: 'ROYAL DATING' },
  { name: 'castle', t: 'photoTop', meme: 34, pos: 'centre', head: 'CASTLE FOR SALE', headSize: 20, sub: 'Tower. Flag. Moat nearby.', btn: 'VIEW', bg: NAVY, mini: 'FOR SALE' },
  { name: 'mattress', t: 'overlay', meme: 32, top: 'ROYAL MATTRESS CO.', head: 'SLEEP LIKE A KING', headSize: 20, sub: 'Under a castle moon', btn: 'SHOP BEDS', bar: NAVY, mini: 'SLEEP WELL' },
  { name: 'mail', t: 'window', meme: 31, title: 'Royal Mail - Inbox', head: 'You have (12) scrolls!', headInk: '#0a246a', sub: ['From: The King', 'Re: BORK', 'Re: Re: BORK'], btns: ['Open', 'Later'], mini: 'ROYAL MAIL' },
  { name: 'callnow', t: 'classified', meme: 30, head: ['Call the King', '1-800-BORK'], sub: ['Operators are', 'standing by'], foot: ['Ask for His Majesty.'], btn: 'CALL NOW »', mini: 'CALL NOW' },
  { name: 'gala', t: 'overlay', meme: 28, top: 'BLACK TIE ONLY', head: 'THE GBORK GALA', headSize: 20, sub: 'Gold crowns optional', btn: 'RSVP', bar: '#111', mini: 'THE GALA' },
  { name: 'spa', t: 'photoTop', meme: 26, pos: 'centre', head: 'ROYAL SPA', sub: 'Bubble baths for kings', btn: 'RELAX', bg: '#2e8c9a', mini: 'ROYAL SPA' },
  { name: 'builders', t: 'burst', meme: 25, pos: 'centre', head: 'WATCH OUT!', badge: '!!', sub: 'Bork Builders: we drop bricks', btn: 'HARD HAT', mini: 'WATCH OUT' },
  { name: 'chocolate', t: 'tall', meme: 24, meme2: 4, head: ['ROYAL', 'CHOCOLATE'], sub: ['Fit for a king.', 'Shared with', 'nobody.'], btn: 'TASTE IT', bg: '#5a2d0c', mini: 'CHOCOLATE' },
  { name: 'party', t: 'tall', meme: 46, pos: 'centre', meme2: 23, pos2: 'centre', head: ['BORK x BUN', 'PARTY'], headSize: 26, sub: ['Friends forever.', 'Snacks for all.'], btn: 'JOIN IN', bg: '#6a1b9a', mini: 'BORK x BUN' },
  { name: 'borkooor', t: 'tall', meme: 43, pos: 'contain', meme2: 50, pos2: 'north', head: ['MEET THE', 'BORKOOOR'], headSize: 26, sub: ['Says gbork every', 'morning. Enjoys', 'funny memes.'], btn: 'SAY GBORK', bg: NAVY, mini: 'GBORK' },
  { name: 'bait', t: 'strip', meme: 36, head: 'THIS IS BAIT.', sub: 'Royal Fishing Supply · since today', btn: 'GO FISHING', bg: '#111', mini: 'BAIT' },
  { name: 'soback', t: 'strip', meme: 8, head: "WE'RE SO BACK", sub: 'The King Bork Comeback Tour', btn: 'TICKETS', mini: 'SO BACK' },
  { name: 'spicy', t: 'strip', meme: 7, pos: 'south', head: 'ROYAL HOT SAUCE', sub: "You're gonna make me bork.", btn: 'TRY IT', bg: '#c2410c', mini: 'HOT SAUCE' },
]

const readable = (svg, k) => svg.replace(/font-size="([0-9.]+)"([^>]*>)([^<]*)/g, (all, size, rest, text) =>
  text.trim().length <= 1 || +size * k >= MIN_PX ? all : `font-size="${(MIN_PX / k).toFixed(1)}"${rest}${text}`)
const sizeOf = a => a.t === 'tall' ? [160, 600] : a.t === 'strip' ? [468, 60] : [250, 250]

/** The 125x125 for the medium columns: the picture, one big title, made to be read at that size. */
async function mini(a) {
  const p = await pic(a.meme, 125, 125, a.pos === 'contain' ? 'north' : (a.pos || 'north'))
  const size = a.mini.length > 10 ? 13 : 16
  return f => `${img(p, 0, 0, 125, 125)}
    <rect y="91" width="125" height="34" fill="${f ? RED : INK}" opacity="0.92"/>
    <text x="62.5" y="${108 + size * 0.36}" text-anchor="middle" font-family="Arial Black" font-size="${size}" fill="${f ? '#fff' : GOLD}">${esc(a.mini)}</text>
    <rect x="0.5" y="0.5" width="124" height="124" fill="none" stroke="${INK}"/>`
}

async function save(name, w, h, draw) {
  const dir = join(tmpdir(), 'borkad-' + name)
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  for (let f = 0; f < FRAMES; f++) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * X}" height="${h * X}" viewBox="0 0 ${w} ${h}">${readable(draw(blinkOf(f)), 1)}</svg>`
    const png = await sharp(Buffer.from(svg)).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer()
    await sharp(await withDecor(png, name, w, h, f)).toFile(join(dir, `f00${f}.png`))
  }
  const out = join(OUT, `bork-x-${name}.gif`)
  encodeGif(dir, out)
  rmSync(dir, { recursive: true, force: true })
}

const only = process.argv.slice(2)
for (const a of ADS.filter(a => !only.length || only.includes(a.name))) {
  const [w, h] = sizeOf(a)
  await save(a.name, w, h, await T[a.t](a))
  await save(a.name + '-mini', 125, 125, await mini(a))
  console.log('ok', a.name)
}
