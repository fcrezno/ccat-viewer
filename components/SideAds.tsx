'use client'

import { useEffect, useState } from 'react'
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

export function SideAds() {
  useEffect(() => {
    if (NO_CHAIN) return
    fitAds()
    addEventListener('resize', fitAds)
    return () => { removeEventListener('resize', fitAds); document.documentElement.style.zoom = ''; delete document.documentElement.dataset.rail }
  }, [])
  // [left square, two small squares, two buttons] and [pop-up, two buttons].
  const [extra, setExtra] = useState<{ tallL: MemeAd; tallR: MemeAd; square: MemeAd } | null>(null)
  const [mix, setMix] = useState<{ left: number[]; right: number[]; slimL: number[]; slimR: number[]; tinyL: number[]; tinyR: number[]; strip: number; stripStory: boolean; memeL: MemeAd | null; memeR: MemeAd | null; memeSlim: MemeAd | null; memeStrip: MemeAd | null } | null>(null)
  useEffect(() => {
    if (NO_CHAIN) return
    const roll = () => setMix({ left: pickMosh(5), right: pickMosh(3), slimL: pickMosh(3), slimR: pickMosh(3), tinyL: pickMosh(4), tinyR: pickMosh(4), strip: pickMosh(1)[0], stripStory: Math.random() < 0.5,
      memeL: Math.random() < 0.5 ? pickOne(MEME_ADS.square) : null, memeR: Math.random() < 0.5 ? pickOne(MEME_ADS.tall) : null,
      memeSlim: null, memeStrip: Math.random() < 0.4 ? pickOne(MEME_ADS.strip) : null })
    roll()
    const t = setInterval(roll, ROTATE_MS)
    const rollExtra = () => {
      const [a, b] = [...MEME_ADS.tall].sort(() => Math.random() - 0.5)
      setExtra({ tallL: a, tallR: b ?? a, square: pickOne(MEME_ADS.square) })
    }
    rollExtra()
    const t2 = setInterval(rollExtra, ROTATE_MS)
    return () => { clearInterval(t); clearInterval(t2) }
  }, [])
  if (!mix || !extra) return null

  // The old-forum table: a header, then a cell per ad (globals.css .forum-*).
  const label = <div className="forum-head">SPONSORS</div>
  const cell = (children: React.ReactNode, more = '') => (
    <div className={'forum-cell ' + more}><span className="forum-cap">Advertisement</span>{children}</div>
  )
  /*
   * THE EMPTY SPACE UNDER THE TABLES (JP, 2026-10-14: "we have extra space here").
   * Each table gets one more ad at its foot: a skyscraper, or on the wide left a
   * second square. It shows only when the window is tall enough to hold all of it
   * (globals.css .rail-more-*), so an ad is never cut off at the bottom.
   */
  return (
    <>
      <aside className="cc-rail cc-rail-left" aria-label="Mosh friends">
        {label}
        {cell(
          mix.memeL ? <Meme ad={mix.memeL} maxW={250} /> : <Ad token={mix.left[0]} suffix="-sq" w={250} h={250} />
        )}
        {cell(
        <div className="forum-row">
          <Ad token={mix.left[1]} suffix="-sm" w={122} h={122} />
          <Ad token={mix.left[2]} suffix="-sm" w={122} h={122} />
        </div>
        )}
        {cell(
        <div className="forum-row">
          <Ad token={mix.left[3]} suffix="-btn" w={88} h={31} />
          <Ad token={mix.left[4]} suffix="-btn" w={88} h={31} />
        </div>
        )}
        {cell(<Meme ad={extra.square} maxW={250} />, 'rail-more-850')}
      </aside>
      {/* The slim columns, for medium screens: 125 wide (globals.css .cc-rail-slim). */}
      <aside className="cc-rail-slim cc-rail-left" aria-label="Mosh friends">
        {label}
        {cell(
          <Ad token={mix.slimL[0]} suffix="-sm" w={125} h={125} />
        )}
        {cell(
        <Ad token={mix.slimL[1]} suffix="-btn" w={88} h={31} />
        )}
        {cell(
        <Ad token={mix.slimL[2]} suffix="-btn" w={88} h={31} />
        )}
        {cell(<Meme ad={extra.tallL} maxW={125} />, 'rail-more-900')}
      </aside>
      <aside className="cc-rail-slim cc-rail-right" aria-label="Mosh friends">
        {label}
        {cell(
          mix.memeSlim ? <Meme ad={mix.memeSlim} maxW={125} /> : <Ad token={mix.slimR[0]} suffix="-won" w={125} h={156} />
        )}
        {cell(
        <Ad token={mix.slimR[1]} suffix="-sm" w={125} h={125} />
        )}
        {cell(
        <Ad token={mix.slimR[2]} suffix="-btn" w={88} h={31} />
        )}
        {cell(<Meme ad={extra.tallR} maxW={125} />, 'rail-more-1010')}
      </aside>
      <aside className="cc-rail cc-rail-right" aria-label="Mosh friends">
        {label}
        {cell(
          mix.memeR ? <Meme ad={mix.memeR} maxW={250} /> : <Ad token={mix.right[0]} suffix="-won" w={250} h={312} />
        )}
        {cell(
        <div className="forum-row">
          <Ad token={mix.right[1]} suffix="-btn" w={88} h={31} />
          <Ad token={mix.right[2]} suffix="-btn" w={88} h={31} />
        </div>
        )}
        {!mix.memeR && cell(<Meme ad={extra.tallR} maxW={160} />, 'rail-more-1150')}
      </aside>
      {/* The tiny columns (globals.css .cc-rail-tiny): four 88x31 buttons a side. */}
      <aside className="cc-rail-tiny cc-rail-left" aria-label="Mosh friends">
        {label}
        {mix.tinyL.map((t, i) => <div key={i}>{cell(<Ad token={t} suffix="-btn" w={88} h={31} />)}</div>)}
        <div>{cell(<Meme ad={extra.tallL} maxW={88} />, 'rail-more-700')}</div>
      </aside>
      <aside className="cc-rail-tiny cc-rail-right" aria-label="Mosh friends">
        {label}
        {mix.tinyR.map((t, i) => <div key={i}>{cell(<Ad token={t} suffix="-btn" w={88} h={31} />)}</div>)}
        <div>{cell(<Meme ad={extra.tallR} maxW={88} />, 'rail-more-700')}</div>
      </aside>
      {/* Narrow screens and phones: one old-school 468x60 banner at the foot of the page. */}
      <div className="cc-foot" aria-label="Mosh friends">
        <span className="forum-cap">Advertisement</span>
        {mix.memeStrip ? <div style={{ maxWidth: 468, width: '100%' }}><Meme ad={mix.memeStrip} maxW={468} fluid /></div> :
        <a href={BANNER_TOKENS[mix.strip].href} target="_blank" rel="noopener" style={{ display: 'block', lineHeight: 0, maxWidth: 468, width: '100%' }}>
          <img src={bannerFile(mix.strip, mix.stripStory ? '-story' : '')} alt={BANNER_TOKENS[mix.strip].name} width={468} height={60} style={{ width: '100%', height: 'auto', imageRendering: 'pixelated', display: 'block' }} />
        </a>}
      </div>
    </>
  )
}

const st: Record<string, React.CSSProperties> = {
  label: { fontSize: 11, letterSpacing: 1, color: '#000080', textAlign: 'center' },
  pair:  { display: 'flex', justifyContent: 'space-between', gap: 6 },
}
