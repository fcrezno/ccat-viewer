'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NO_CHAIN } from '@/lib/appmode'
import { BANNER_TOKENS, MEME_ADS, MEME_AD_HREF, MEME_AD_NAME, bannerFile, pickMosh, pickOne, type MemeAd } from '@/lib/banners'

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
function Meme({ ad, maxW, fluid }: { ad: MemeAd; maxW: number; fluid?: boolean }) {
  const k = Math.min(1, maxW / ad.w)
  return (
    <a href={MEME_AD_HREF} target="_blank" rel="noopener" title={MEME_AD_NAME} style={{ display: 'block', lineHeight: 0, margin: '0 auto', width: fluid ? '100%' : Math.round(ad.w * k) }}>
      <img src={ad.file} alt={MEME_AD_NAME} width={Math.round(ad.w * k)} height={Math.round(ad.h * k)} style={fluid ? { display: 'block', width: '100%', height: 'auto' } : { display: 'block' }} />
    </a>
  )
}

function Ad({ token, suffix, w, h }: { token: number; suffix: string; w: number; h: number }) {
  const t = BANNER_TOKENS[token]
  return (
    <a href={t.href} target="_blank" rel="noopener" title={t.name} style={{ display: 'block', lineHeight: 0 }}>
      <img src={bannerFile(token, suffix)} alt={t.name} width={w} height={h} style={{ imageRendering: 'pixelated', display: 'block' }} />
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
 * UNIFORM, AND FULL TO THE FOOT (JP, 2026-10-14: "make sure the empty spaces are
 * filled; make the ads be uniform"). Each table is a stack of same-size cells,
 * as many as the window's height holds: 250x250 squares on wide screens, 125x125
 * on medium ones, 88x31 buttons on narrow ones. The squares take turns: a Mosh
 * token's ad, then a Bundle Cat meme ad (lib/banners MEME_ADS, all 250x250), and
 * the two sides start on different kinds. A table that still runs past the
 * window's foot after drawing (fonts, zoom) drops its last cell.
 */
type Tier = 'full' | 'slim' | 'tiny' | 'strip'
type Slot = { mosh: number } | { meme: MemeAd }
const CELLS: Record<Exclude<Tier, 'strip'>, { size: number; cell: number }> = {
  full: { size: 250, cell: 250 + 27 },
  slim: { size: 125, cell: 125 + 27 },
  tiny: { size: 31, cell: 31 + 24 },
}
const TOP = 96, HEAD = 23, FOOT = 12, MAX = 16

/** One side's cells, alternating Mosh / meme from `first`. */
function column(n: number, first: 0 | 1, mosh: number[], memes: MemeAd[]): Slot[] {
  return Array.from({ length: n }, (_, i) => ((i + first) % 2 === 0 ? { mosh: mosh[i] } : { meme: memes[i] }))
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

  const [deck, setDeck] = useState<{ moshL: number[]; moshR: number[]; memes: MemeAd[]; firstL: 0 | 1; strip: number; stripStory: boolean; memeStrip: MemeAd | null } | null>(null)
  useEffect(() => {
    if (NO_CHAIN) return
    const roll = () => {
      const memes = [...MEME_ADS.square].sort(() => Math.random() - 0.5)
      setDeck({
        moshL: pickMosh(MAX), moshR: pickMosh(MAX), memes, firstL: Math.random() < 0.5 ? 0 : 1,
        strip: pickMosh(1)[0], stripStory: Math.random() < 0.5, memeStrip: Math.random() < 0.4 ? pickOne(MEME_ADS.strip) : null,
      })
    }
    roll()
    const t = setInterval(roll, ROTATE_MS)
    return () => clearInterval(t)
  }, [])

  // After drawing: a table that runs past the window's foot loses a cell.
  const left = useRef<HTMLElement>(null), right = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (!tier || tier === 'strip') return
    // getBoundingClientRect is already in the window's pixels under CSS zoom.
    const over = [left.current, right.current].some(e => e && e.getBoundingClientRect().bottom > innerHeight - 4)
    if (over) setTrim(t => t + 1)
  })

  if (!deck || !tier) return null

  // The old-forum table: a header, then a cell per ad (globals.css .forum-*).
  const label = <div className="forum-head">SPONSORS</div>
  const cell = (children: React.ReactNode, key: number) => (
    <div key={key}><div className="forum-cell"><span className="forum-cap">Advertisement</span>{children}</div></div>
  )

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

  const { size, cell: cellH } = CELLS[tier]
  const fit = Math.max(1, Math.min(MAX, Math.floor((room - TOP - HEAD - FOOT) / cellH)))
  // The room under the last square, too short for another, takes rows of 88x31 buttons.
  const BTN = 31 + 24
  const rows = tier === 'tiny' ? 0 : Math.floor((room - TOP - HEAD - FOOT - fit * cellH) / BTN)
  const n = Math.max(1, fit - Math.max(0, trim - rows))
  const btnRows = Math.max(0, rows - trim)
  const cls = tier === 'full' ? 'cc-rail' : tier === 'slim' ? 'cc-rail-slim' : 'cc-rail-tiny'
  const half = Math.ceil(deck.memes.length / 2)
  const draw = (s: Slot, i: number) => cell(
    tier === 'tiny' ? <Ad token={'mosh' in s ? s.mosh : (deck.moshL[i] ?? 1)} suffix="-btn" w={88} h={31} />
      : 'mosh' in s ? <Ad token={s.mosh} suffix={tier === 'full' ? '-sq' : '-sm'} w={size} h={size} />
      : <Meme ad={s.meme} maxW={size} />, i)
  // Buttons only on the narrow tables: a meme square does not shrink to 88x31.
  const sides: [React.RefObject<HTMLElement | null>, string, Slot[]][] = [
    [left, 'cc-rail-left', tier === 'tiny' ? deck.moshL.slice(0, n).map(m => ({ mosh: m })) : column(n, deck.firstL, deck.moshL, deck.memes.slice(0, half))],
    [right, 'cc-rail-right', tier === 'tiny' ? deck.moshR.slice(0, n).map(m => ({ mosh: m })) : column(n, deck.firstL ? 0 : 1, deck.moshR, deck.memes.slice(half))],
  ]
  return (
    <>
      {sides.map(([ref, side, slots]) => (
        <aside key={side} ref={ref as React.RefObject<HTMLElement>} className={`${cls} ${side} cc-rail-uniform`} aria-label="Mosh friends">
          {label}
          {slots.map(draw)}
          {Array.from({ length: btnRows }, (_, r) => cell(
            <div className="forum-row">{(tier === 'full' ? [0, 1] : [0]).map(k => {
              const pool = side === 'cc-rail-left' ? deck.moshL : deck.moshR
              return <Ad key={k} token={pool[(n + r * 2 + k) % pool.length]} suffix="-btn" w={88} h={31} />
            })}</div>, 100 + r))}
        </aside>
      ))}
    </>
  )
}
