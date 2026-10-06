'use client'

import { useEffect, useState } from 'react'
import { BitmapText } from '@/components/BitmapText'
import { GameBar } from '@/components/GameBar'
import { loadingHolds, onHoldsChange } from '@/lib/loading'
import { preloadBattle } from '@/lib/battleAssets'

/**
 * THE LOADING SCREEN — up from the first paint until the page is really there.
 *
 * JP, 2026-10-05: "loading is a bit akward as not everthing is loading; so i
 * would like to add a loading screen first". Pages arrived in pieces: the menu,
 * then the wallet row, then the cat, then the backdrop, then the yard's cats.
 * This sits over all of it and lifts once:
 *
 *   1. the fonts are in (the game's webfont, and font.png, the sheet every
 *      BitmapText is masked from — without it the game's lettering is blank);
 *   2. the page's own data is in — see lib/loading.ts, useLoadingHold;
 *   3. the pictures ON SCREEN have loaded. Lazy and off-screen ones are left
 *      out: they are not part of the first look and may never load.
 *   4. on the front page, where fights happen, the BATTLE SCENE's files too —
 *      map, VS, chrome, bars, arenas, ladder, every sound and the music
 *      (lib/battleAssets). JP, 2026-10-06: "make it so the loading screen loads
 *      everything for the battle scene as well".
 *
 * At least MIN_MS, so a fast page does not flash it; never more than MAX_MS, so
 * a slow server cannot keep anybody behind it.
 *
 * Rendered on the server too, so it is the first thing painted rather than
 * something that arrives after the page it is meant to hide.
 */
/** The ladder's checker blues (components/LadderScreen). Literals, so this file loads nothing heavy before first paint. */
const CHECK_A = '#d3dceb'
const CHECK_B = '#c9d3e4'
const OUTLINE = 'drop-shadow(2px 0 0 #1a1a1a) drop-shadow(-2px 0 0 #1a1a1a) drop-shadow(0 2px 0 #1a1a1a) drop-shadow(0 -2px 0 #1a1a1a)'
const MIN_MS = 500
/** About 6.5 MB of battle files ride on the front page's load now, so a slower line gets longer. */
const MAX_MS = 12000
const FADE_MS = 400

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const frame = () => new Promise<void>(r => requestAnimationFrame(() => r()))

const onScreen = (el: Element) => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
}

/**
 * Resolves once nothing holds the screen, and KEEPS nothing holding it for a
 * moment. One component letting go as the next takes hold happens in the same
 * commit — React runs every cleanup before any new effect — so the count can
 * touch zero for an instant between them (/mint's router handing over to the
 * Robinhood page did exactly that). Zero has to last two frames to count.
 */
const holdsReleased = async () => {
  for (;;) {
    if (loadingHolds() > 0) {
      await new Promise<void>(resolve => {
        const off = onHoldsChange(() => { if (loadingHolds() === 0) { off(); resolve() } })
      })
    }
    await frame(); await frame()
    if (loadingHolds() === 0) return
  }
}

const loaded = (img: HTMLImageElement) => new Promise<void>(resolve => {
  if (img.complete) return resolve()
  img.addEventListener('load', () => resolve(), { once: true })
  img.addEventListener('error', () => resolve(), { once: true })
})

export function LoadingScreen() {
  const [phase, setPhase] = useState<'on' | 'fading' | 'off'>('on')
  /** 0..100: fonts are the first fifth, the page's data the next, pictures the rest. */
  const [pct, setPct] = useState(0)

  useEffect(() => {
    let live = true
    const t0 = performance.now()
    const set = (n: number) => { if (live) setPct(p => Math.max(p, Math.round(n))) }

    const work = (async () => {
      const sheet = new Image()
      sheet.src = '/game/font.png'
      await Promise.all([document.fonts?.ready, loaded(sheet)])
      set(20)

      // Let the page mount and start its own fetches, so their holds exist.
      await frame(); await frame(); await sleep(120)
      await holdsReleased()
      set(45)

      // What is on screen once the data is in — and, on the front page, where
      // fights happen, everything the battle scene will draw and play.
      await frame()
      const imgs = [...document.images].filter(i => !i.complete && i.loading !== 'lazy' && onScreen(i))
      const battle = location.pathname === '/'
      let shown = 0, battleDone = 0, battleTotal = 1
      const progress = () => {
        const n = imgs.length + (battle ? battleTotal : 0)
        set(45 + 55 * ((shown + (battle ? battleDone : 0)) / Math.max(1, n)))
      }
      await Promise.all([
        ...imgs.map(i => loaded(i).then(() => { shown++; progress() })),
        battle ? preloadBattle((d, t) => { battleDone = d; battleTotal = t; progress() }) : null,
      ])
      set(100)
    })()

    ;(async () => {
      await Promise.race([work, sleep(MAX_MS)])
      const left = MIN_MS - (performance.now() - t0)
      if (left > 0) await sleep(left)
      if (!live) return
      setPct(100)
      setPhase('fading')
      await sleep(FADE_MS)
      if (live) setPhase('off')
    })()

    return () => { live = false }
  }, [])

  if (phase === 'off') return null

  return (
    <div
      role="status"
      aria-label="Loading"
      style={{ ...st.screen, opacity: phase === 'fading' ? 0 : 1, pointerEvents: phase === 'fading' ? 'none' : 'auto' }}
    >
      {/*
        THE WINDOW AND THE CHECKER, like every page — JP, 2026-10-06: "give this
        the window and background treatment too". The checker is plain CSS here,
        moved by a transform: this is painted before any script runs, so it
        cannot wait for PageChecker's clock.
      */}
      <div aria-hidden style={st.clip}><div style={st.checker} /></div>
      <section className="win98" data-title="Clanker Cats" style={st.window}>
        <div style={{ filter: OUTLINE }}>
          <BitmapText text="CLANKER CATS" scale={3} color="#b07a10" fx className="fx-btn-text" />
        </div>
        {/* The game's own health bar, filling as the page comes in, in a sunken 98 field. */}
        <div style={st.field}>
          <div style={st.bar}>
            {/* The empty bar, faint, so there is something to fill: early on the fill alone was a red stub. */}
            <img src="/game/bar/right-full.png" alt="" style={st.track} />
            <GameBar hp={pct} ghost={pct} max={100} side="right" />
          </div>
        </div>
        <div style={st.blink}>
          <BitmapText text="LOADING..." scale={2} color="#000080" />
        </div>
      </section>
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  screen: {
    position: 'fixed', inset: 0, zIndex: 1000,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22,
    background: CHECK_A,
    overflow: 'hidden',
    transition: `opacity ${FADE_MS}ms ease-out`,
    padding: 16,
  },
  // right-*.png is 172x13: exactly 2x, square pixels — the width min()s down on a small phone.
  clip:    { position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' },
  // The ladder's paper-blue checker, one 64px tile down-left per cycle (20 px a second).
  checker: {
    position: 'absolute', left: -64, top: -64, right: -64, bottom: -64,
    background: `repeating-conic-gradient(${CHECK_A} 0 25%, ${CHECK_B} 0 50%)`,
    backgroundSize: '64px 64px',
    animation: 'loading-checker 3.2s linear infinite',
    willChange: 'transform',
  },
  window:  { position: 'relative', background: '#c0c0c0', border: '1px solid #c0c0c0', padding: 16, width: 'min(560px, 94vw)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 },
  field:   { width: '100%', boxSizing: 'border-box', padding: 8, background: '#ffffff', boxShadow: 'inset 1px 1px 0 0 #808080, inset -1px -1px 0 0 #ffffff, inset 2px 2px 0 0 #0a0a0a, inset -2px -2px 0 0 #dfdfdf', display: 'flex', justifyContent: 'center' },
  // right-*.png is 172x13: exactly 2x, square pixels — the width min()s down on a small phone.
  bar:   { position: 'relative', width: 'min(344px, 72vw)' },
  track: { position: 'absolute', inset: 0, width: '100%', height: '100%', imageRendering: 'pixelated', filter: 'grayscale(1) brightness(0.7)', opacity: 0.5 },
  blink: { animation: 'cradle-blink 0.74s steps(1, end) infinite' },
}
