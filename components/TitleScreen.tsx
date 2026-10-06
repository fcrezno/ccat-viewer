'use client'

import { useEffect, useRef, useState } from 'react'
import { BitmapText } from '@/components/BitmapText'

/**
 * THE s&box TITLE SCREEN, ON THE WEB — the front of the mint page.
 *
 * JP, 2026-09-28: "use the title screen as the mint page" — "the title screen
 * from the sandbox game". Everything here is lifted from BattleScreen.razor and
 * its .scss in sbox-projects/clanker_arena, at the game's own 480x320, and the
 * whole stage is scaled to fit the page, so every offset stays the game's:
 *
 *   backdrop   a random zone's loop, 15 fps (BgFps), under the pale title wash
 *   reels      two rows of framed portraits, 84px, 24 cats each, running
 *              opposite ways: 60s over 3072px on top, 79s over 2688px below.
 *              Each strip holds its cats TWICE, so the loop has no seam.
 *   title      CLANKER CATS at scale 3: a hard ink shadow at +4, an ink outline
 *              at ±2 that moves with the wave, a bold copy at +1, gold on top
 *   prompt     where PRESS START blinks — here, CLAIM YOUR CAT. It blinks with
 *              opacity only, so it never stops being clickable.
 *
 * The reels show ROBINHOOD cats (public/title/cats, built by
 * scripts/make-title-assets.mjs in the game's portrait frame).
 */

const W = 480
const H = 320
const ZONES = ['caves', 'forest', 'mountain', 'temple', 'town']
const REEL = 24

/** The portraits make-title-assets.mjs builds: every 17th cat, 1..1072. */
const POOL = Array.from({ length: 64 }, (_, i) => 1 + i * 17)

const INK = '#1a1a1a'
const OUTLINE = [[-2, 0], [2, 0], [0, -2], [0, 2]] as const
const BOLD = [[1, 0], [0, 1]] as const

function shuffled<T>(a: T[]): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

export function TitleScreen({ prompt = 'CLAIM YOUR CAT', onStart }: {
  prompt?: string
  onStart?: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(1)
  const [zone, setZone] = useState<string | null>(null)
  const [rows, setRows] = useState<[number[], number[]]>([[], []])
  const [lit, setLit] = useState(true)

  /*
   * Everything random is picked AFTER mount, like the game re-rolls its zone and
   * reel cats each time the title opens. Picking during render would differ
   * between server and browser and React would throw the page away.
   */
  useEffect(() => {
    setZone(ZONES[Math.floor(Math.random() * ZONES.length)])
    const s = shuffled(POOL)
    setRows([s.slice(0, REEL), s.slice(REEL, REEL * 2)])
  }, [])

  // Fit the 480-wide stage to the page.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setK(el.clientWidth / W)
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The game flips PRESS START every 11 units of 60 fps time: 11/60 of a second.
  useEffect(() => {
    const t = setInterval(() => setLit(v => !v), 1000 * 11 / 60)
    return () => clearInterval(t)
  }, [])

  const title = (dx: number, dy: number, color: string, fx: boolean | 'wave', key: string) => (
    <div key={key} style={{ ...st.row, left: dx, top: dy }}>
      <BitmapText text="CLANKER CATS" scale={3} color={color} fx={fx} />
    </div>
  )

  return (
    <>
      {/*
        No page behind the title any more: the page stands on the moving checker
        (PageChecker), as every page does since JP, 2026-10-06 — "give the
        background the update we did and apply it to all other pages". The soft,
        washed backdrop INSIDE the frame is intentional and stays.
      */}
    <div ref={box} style={st.frame}>
      <div style={{ ...st.stage, transform: `scale(${k})` }}>
        {zone && (
          <video src={`/title/${zone}.mp4`} poster={`/title/${zone}.jpg`} autoPlay muted loop playsInline style={st.backdrop} />
        )}
        <div style={st.wash} />

        {/* THE FILM REEL — the same cats twice, so the loop has no seam. */}
        <div style={{ ...st.reel, top: 2 }}>
          <div style={{ ...st.strip, animation: 'title-reel-run 60s linear infinite' }}>
            {[...rows[0], ...rows[0]].map((id, i) => (
              <img key={i} src={`/title/cats/${id}.png`} alt="" style={{ ...st.frameImg, marginRight: 44 }} />
            ))}
          </div>
        </div>
        <div style={{ ...st.reel, top: 232 }}>
          <div style={{ ...st.strip, animation: 'title-reel-back 79s linear infinite' }}>
            {[...rows[1], ...rows[1]].map((id, i) => (
              <img key={i} src={`/title/cats/${id}.png`} alt="" style={{ ...st.frameImg, marginRight: 28 }} />
            ))}
          </div>
        </div>

        {/* CLANKER CATS: shadow, outline, bold, face — the game's draw order. */}
        <div style={st.title} aria-label="Clanker Cats">
          {title(4, 4, INK, false, 'shadow')}
          {OUTLINE.map(([x, y], i) => title(x, y, INK, 'wave', 'o' + i))}
          {BOLD.map(([x, y], i) => title(x, y, '#b07a10', true, 'b' + i))}
          {title(0, 0, '#b07a10', true, 'face')}
        </div>

        {/* PRESS START's place. Opacity only, so the click target never goes. */}
        <button type="button" onClick={onStart} style={st.prompt} aria-label={prompt}>
          <span style={{ ...st.promptInner, opacity: lit ? 1 : 0 }}>
            <span style={{ position: 'absolute', left: 1, top: 1, width: 'max-content' }}>
              <BitmapText text={prompt} scale={1} color={INK} />
            </span>
            <span style={{ position: 'relative', display: 'block', width: 'max-content' }}>
              <BitmapText text={prompt} scale={1} color="#ffffff" />
            </span>
          </span>
        </button>
      </div>
    </div>
    </>
  )
}

const st: Record<string, React.CSSProperties> = {
  frame:    { position: 'relative', width: '100%', maxWidth: 960, aspectRatio: `${W} / ${H}`, overflow: 'hidden', borderRadius: 8, border: '2px solid rgba(255,255,255,0.12)', background: '#0e0e18', boxShadow: '0 18px 60px rgba(0,0,0,0.55)' },
  stage:    { position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0' },
  backdrop: { position: 'absolute', left: 0, top: 0, width: W, height: H, objectFit: 'cover', imageRendering: 'pixelated' },
  wash:     { position: 'absolute', left: 0, top: 0, width: W, height: H, background: 'rgba(232, 238, 246, 0.62)' },
  reel:     { position: 'absolute', left: 0, width: W, height: 84, overflow: 'hidden' },
  strip:    { position: 'absolute', left: 0, top: 0, height: 84, display: 'flex', flexDirection: 'row', alignItems: 'center', willChange: 'transform' },
  frameImg: { width: 84, height: 84, flex: '0 0 84px', imageRendering: 'pixelated' },
  title:    { position: 'absolute', left: 0, top: 108, width: W, height: 72 },
  row:      { position: 'absolute', width: W, display: 'flex', justifyContent: 'center' },
  prompt:   { position: 'absolute', left: 0, top: 192, width: W, height: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer' },
  promptInner: { position: 'relative', display: 'inline-block', animation: 'title-hint-bob 1.6s ease-in-out infinite alternate' },
}
