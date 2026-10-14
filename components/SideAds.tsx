'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NO_CHAIN } from '@/lib/appmode'
import { BANNER_TOKENS, MEME_ADS, bannerFile, pickMosh, pickOne, type MemeAd } from '@/lib/banners'

/**
 * THE AD COLUMNS — old-web banners down both sides of every page. JP,
 * 2026-10-12: "put it on the sides". The way a 1999 homepage had a column of
 * squares and buttons in each margin: a random mix per visit, a new one every
 * ROTATE_MS, each banner a link to its own token's site.
 *
 * Only where the margins are empty (globals.css .cc-rail, wide screens), so it
 * never sits over the game on a phone or in a Farcaster frame. Not in the App
 * Store build at all: token ads have no place there (NO_CHAIN, Guideline 3.1.1).
 * Drawn after mount, so the server and the browser agree on the first paint.
 */
const ROTATE_MS = 20000

/** A Bundle Cat meme ad, scaled to fit `maxW` (never up). */
function Meme({ ad: big, maxW, fluid }: { ad: MemeAd; maxW: number; fluid?: boolean }) {
  // In a 125 cell, the mini: its own picture and title, made to be read at that size.
  const ad = maxW <= 125 && big.mini ? { ...big, file: big.mini, w: 125, h: 125 } : big
  const k = Math.min(1, maxW / ad.w)
  return (
    <a href={ad.href} target="_blank" rel="noopener" title={ad.name} style={{ display: 'block', lineHeight: 0, margin: '0 auto', width: fluid ? '100%' : Math.round(ad.w * k) }}>
      <img src={ad.file} alt={ad.name} width={Math.round(ad.w * k)} height={Math.round(ad.h * k)} style={fluid ? { display: 'block', width: '100%', height: 'auto' } : { display: 'block' }} />
    </a>
  )
}

function Ad({ token, suffix, w, h, smooth }: { token: number; suffix: string; w: number; h: number; smooth?: boolean }) {
  const t = BANNER_TOKENS[token]
  return (
    <a href={t.href} target="_blank" rel="noopener" title={t.name} style={{ display: 'block', lineHeight: 0 }}>
      <img src={bannerFile(token, suffix)} alt={t.name} width={w} height={h} style={{ imageRendering: smooth ? 'auto' : 'pixelated', display: 'block' }} />
    </a>
  )
}

/*
 * The tiers, by the page's room in CSS pixels: full >= 1560, slim >= 1290,
 * tiny >= 1190. Short of 1190 but over MIN_ZOOMED, the page is zoomed out to
 * exactly 1190 so the tiny columns fit; under that (and on touch screens) the ads
 * become the strip at the foot.
 */
const FULL = 1560, SLIM = 1290, TINY = 1190, MIN_ZOOMED = 960
function fitAds() {
  const html = document.documentElement
  const w = window.innerWidth                    // CSS zoom does not change this: the real window
  const touch = matchMedia('(pointer: coarse)').matches
  let zoom = 1, tier: 'full' | 'slim' | 'tiny' | 'strip'
  if (touch || w < MIN_ZOOMED) tier = 'strip'
  else if (w >= FULL) tier = 'full'
  else if (w >= SLIM) tier = 'slim'
  else if (w >= TINY) tier = 'tiny'
  else { tier = 'tiny'; zoom = w / TINY }
  html.style.zoom = zoom === 1 ? '' : zoom.toFixed(4)
  html.dataset.rail = tier
}

/*
 * MODULAR, FULL TO THE FOOT (JP, 2026-10-14: "make sure the empty spaces are
 * filled; make the ads be uniform", then "have some variance on the sizes, do what
 * we did before but make it modular"). Each table is built from MODULES of known
 * size, picked at random per table and per visit, until the window's height is
 * used up; the room left under the last one takes rows of 88x31 buttons:
 *
 *   sq    one 250x250 square          (a Mosh token's ad or a meme ad, in turn)
 *   duo   two 122x122 squares side by side (a Mosh small + a meme mini)
 *   tall  a 160x600 skyscraper with six 88x88 squares stacked beside it
 *         (Mosh and meme in turn; JP did not like loose buttons there)
 *   btn   a row of 88x31 buttons      (the filler)
 *
 * On the medium tables the modules are a 125 square (Mosh small or meme mini)
 * and a button; on the narrow ones, buttons only. No module kind comes twice in a
 * row when another fits. A table that still runs past the window's foot after
 * drawing (fonts, zoom) is laid out again a little shorter.
 */
type Tier = 'full' | 'slim' | 'tiny' | 'strip'
type Slot = { mosh: number } | { meme: MemeAd }
type Mod =
  | { kind: 'sq'; slot: Slot }
  | { kind: 'duo'; a: number; b: MemeAd }
  | { kind: 'tall'; ad: MemeAd; side: Slot[] }
  | { kind: 'btn'; toks: number[] }
/** Each module's height in the table, ad + caption + borders (+ "Click here!" where it has one). */
const MOD_H = {
  full: { sq: 250 + 44, duo: 122 + 27, tall: 600 + 44, btn: 31 + 24 },
  slim: { sq: 125 + 44, btn: 31 + 24 },
  tiny: { btn: 31 + 16 },                       // thinner cells, and no footer (see layout)
}
const TOP = 96, HEAD = 25, FOOT = 12 + 26
const WEIGHT = { sq: 3, duo: 2, tall: 2 }

/** A small seeded random, so a table keeps its layout across re-draws until the next roll. */
const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

function layout(tier: Exclude<Tier, 'strip'>, room: number, seed: number, mosh: number[], memes: MemeAd[], talls: MemeAd[]): Mod[] {
  const r = rng(seed), H = MOD_H[tier] as Record<string, number>
  let left = room - TOP - HEAD - (tier === 'tiny' ? 12 : FOOT), mi = 0, ki = 0, ti = 0, prev = ''
  const nextMosh = () => mosh[mi++ % mosh.length], nextMeme = () => memes[ki++ % memes.length]
  const mods: Mod[] = []
  let sqTurn = r() < 0.5                              // squares take turns: Mosh, meme, Mosh...
  for (;;) {
    const kinds = (tier === 'full' ? ['sq', 'duo', 'tall'] : tier === 'slim' ? ['sq'] : [])
      .filter(k => H[k] <= left && !(k === 'tall' && mods.some(m => m.kind === 'tall')))
    if (!kinds.length) break
    const pool = kinds.length > 1 ? kinds.filter(k => k !== prev) : kinds
    let pick = r() * pool.reduce((s, k) => s + WEIGHT[k as keyof typeof WEIGHT], 0), kind = pool[0]
    for (const k of pool) { pick -= WEIGHT[k as keyof typeof WEIGHT]; if (pick <= 0) { kind = k; break } }
    if (kind === 'sq') { mods.push({ kind: 'sq', slot: (sqTurn = !sqTurn) ? { mosh: nextMosh() } : { meme: nextMeme() } }) }
    else if (kind === 'duo') mods.push({ kind: 'duo', a: nextMosh(), b: nextMeme() })
    else mods.push({ kind: 'tall', ad: talls[ti++ % talls.length], side: Array.from({ length: 6 }, (_, i): Slot => i % 2 ? { meme: nextMeme() } : { mosh: nextMosh() }) })
    left -= H[kind]; prev = kind
  }
  for (let i = Math.floor(left / H.btn); i > 0; i--) mods.push({ kind: 'btn', toks: tier === 'full' ? [nextMosh(), nextMosh()] : [nextMosh()] })
  return mods
}

export function SideAds() {
  const [tier, setTier] = useState<Tier | null>(null)
  const [room, setRoom] = useState(0)            // the window's height, in the page's CSS pixels
  const [trim, setTrim] = useState(0)
  useEffect(() => {
    if (NO_CHAIN) return
    const on = () => {
      fitAds()
      const html = document.documentElement
      setTier(html.dataset.rail as Tier)
      setRoom(innerHeight / parseFloat(html.style.zoom || '1'))
      setTrim(0)
    }
    on()
    addEventListener('resize', on)
    return () => { removeEventListener('resize', on); document.documentElement.style.zoom = ''; delete document.documentElement.dataset.rail }
  }, [])

  const [deck, setDeck] = useState<{ seed: number; moshL: number[]; moshR: number[]; memes: MemeAd[]; talls: MemeAd[]; strip: number; stripStory: boolean; memeStrip: MemeAd | null } | null>(null)
  useEffect(() => {
    if (NO_CHAIN) return
    const roll = () => {
      setDeck({
        seed: Math.floor(Math.random() * 1e9), moshL: pickMosh(40), moshR: pickMosh(40),
        memes: [...MEME_ADS.square].sort(() => Math.random() - 0.5), talls: [...MEME_ADS.tall].sort(() => Math.random() - 0.5),
        strip: pickMosh(1)[0], stripStory: Math.random() < 0.5, memeStrip: Math.random() < 0.4 ? pickOne(MEME_ADS.strip) : null,
      })
      setTrim(0)
    }
    roll()
    const t = setInterval(roll, ROTATE_MS)
    return () => clearInterval(t)
  }, [])

  // After drawing: a table that runs past the window's foot is laid out again, 20px shorter.
  const left = useRef<HTMLElement>(null), right = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (!tier || tier === 'strip' || trim > 20) return
    // getBoundingClientRect is already in the window's pixels under CSS zoom.
    const over = [left.current, right.current].some(e => e && e.getBoundingClientRect().bottom > innerHeight - 4)
    if (over) setTrim(t => t + 1)
  })

  if (!deck || !tier) return null

  /*
   * THE 1998 HOMEPAGE TABLE (JP, 2026-10-14: "make it real classic like"): a silver
   * table with a raised edge, a teal title bar in Times, each ad in a sunken cell
   * with a blue underlined "Click here!" under it, and a "best viewed" line at the
   * foot (globals.css .cc-rail-uniform).
   */
  const label = <div className="forum-head">★ Our Sponsors ★</div>
  const cell = (children: React.ReactNode, key: number, href?: string) => (
    <div key={key}><div className="forum-cell"><span className="forum-cap">Advertisement</span>{children}
      {href && <a className="geo-click" href={href} target="_blank" rel="noopener">Click here!</a>}</div></div>
  )
  const footer = <div className="geo-foot">Best viewed at 800x600</div>

  if (tier === 'strip') return (
    // Narrow screens and phones: one old-school 468x60 banner at the foot of the page.
    <div className="cc-foot" aria-label="Mosh friends">
      <span className="forum-cap">Advertisement</span>
      {deck.memeStrip ? <div style={{ maxWidth: 468, width: '100%' }}><Meme ad={deck.memeStrip} maxW={468} fluid /></div> :
      <a href={BANNER_TOKENS[deck.strip].href} target="_blank" rel="noopener" style={{ display: 'block', lineHeight: 0, maxWidth: 468, width: '100%' }}>
        <img src={bannerFile(deck.strip, deck.stripStory ? '-story' : '')} alt={BANNER_TOKENS[deck.strip].name} width={468} height={60} style={{ width: '100%', height: 'auto', imageRendering: 'pixelated', display: 'block' }} />
      </a>}
    </div>
  )

  const size = tier === 'full' ? 250 : 125
  const draw = (m: Mod, i: number) => {
    switch (m.kind) {
      case 'sq': return cell('mosh' in m.slot
        ? <Ad token={m.slot.mosh} suffix={tier === 'full' ? '-sq' : '-sm'} w={size} h={size} />
        : <Meme ad={m.slot.meme} maxW={size} />, i, 'mosh' in m.slot ? BANNER_TOKENS[m.slot.mosh].href : m.slot.meme.href)
      case 'duo': return cell(<div className="forum-row"><Ad token={m.a} suffix="-sm" w={122} h={122} /><Meme ad={m.b} maxW={122} /></div>, i)
      case 'tall': return cell(<div className="forum-row" style={{ alignItems: 'stretch', gap: 4 }}>
        <Meme ad={m.ad} maxW={160} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>{m.side.map((x, k) => 'mosh' in x
          ? <Ad key={k} token={x.mosh} suffix="-sm" w={88} h={88} smooth />
          : <Meme key={k} ad={x.meme} maxW={88} />)}</div>
      </div>, i, m.ad.href)
      case 'btn': return cell(<div className="forum-row">{m.toks.map((t, k) => <Ad key={k} token={t} suffix="-btn" w={88} h={31} />)}</div>, i)
    }
  }
  const cls = tier === 'full' ? 'cc-rail' : tier === 'slim' ? 'cc-rail-slim' : 'cc-rail-tiny'
  const half = Math.ceil(deck.memes.length / 2)
  const sides: [React.RefObject<HTMLElement | null>, string, Mod[]][] = [
    [left, 'cc-rail-left', layout(tier, room - trim * 20, deck.seed, deck.moshL, deck.memes.slice(0, half), deck.talls)],
    [right, 'cc-rail-right', layout(tier, room - trim * 20, deck.seed + 1, deck.moshR, deck.memes.slice(half), [...deck.talls].reverse())],
  ]
  return (
    <>
      {sides.map(([ref, side, mods]) => (
        <aside key={side} ref={ref as React.RefObject<HTMLElement>} className={`${cls} ${side} cc-rail-uniform`} aria-label="Mosh friends">
          {label}
          {mods.map(draw)}
          {tier !== 'tiny' && footer}
        </aside>
      ))}
    </>
  )
}
