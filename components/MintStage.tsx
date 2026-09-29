'use client'

import { useEffect, useRef, useState } from 'react'
import { GameBar } from '@/components/GameBar'
import { Floater } from '@/components/Floater'
import { Haloed } from '@/components/Haloed'

/**
 * A CAT TAKING THE MINTS AS DAMAGE, drawn as the game draws a fight.
 *
 * JP, 2026-09-29: "make it look like a random cat is taking damage; make the hp
 * bar more like the game". Everything here is in GAME PIXELS on one small stage,
 * scaled to fit like the title screen, so every offset is the game's own:
 *
 *   backdrop  a random zone's loop at 1:1, under the title screen's pale wash
 *   chrome    battlescreen.png's KO box and right bar (scripts/make-mint-hud.mjs);
 *             black line art, which is why it needs the backdrop behind it
 *   bar       GameBar right under the chrome at the game's own rect (274, 22)
 *   number    HP/MAX haloed above the bar's tip, right edge on x 448, as the
 *             s&box HUD draws it; CAUTION! at the inner end when it runs low
 *   cat       the portrait, centred, and the damage floats out of it 62% down
 *
 * THE HIT. The bar shows full, then every mint lands as one blow: the health
 * snaps, the red trail drains on the fight's clock, the cat and its bar take the
 * crit recoil (Beat.FlinchSecs, 1 s) and the number floats up. With nothing
 * minted the blow is a MISS and nobody flinches. A later change hits for the
 * difference.
 *
 * `ghost` is the health BEFORE the blow and stays put until the next one: GameBar
 * times its drain from ghost - hp, so a ghost that caught up at once would cut a
 * 3 s drain to its 0.25 s floor.
 */

const W = 248
const H = 172
const ZONES = ['caves', 'forest', 'mountain', 'temple', 'town']

/** Where the chrome crop sits on the stage, and where that crop came from. */
const CHROME = { x: 2, y: 10, w: 244, h: 52, fromX: 208, fromY: 8 }
/** A game coordinate from the battle screen, moved onto this stage. */
const gx = (x: number) => CHROME.x + x - CHROME.fromX
const gy = (y: number) => CHROME.y + y - CHROME.fromY

const PORTRAIT = 84
const CAT = { x: (W - PORTRAIT) / 2, y: 74 }

const LOW = 0.2
const ALARM = '#e02020'

export function MintStage({ left, total, art, framed = true }: {
  left: number | null
  total: number | null
  /** The cat. Chosen by the page, after mount. */
  art: string | null
  /** True when the art already carries the game's portrait frame. */
  framed?: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(1)
  const [zone, setZone] = useState<string | null>(null)

  // Random, so after mount: picking during render would differ from the server.
  useEffect(() => { setZone(ZONES[Math.floor(Math.random() * ZONES.length)]) }, [])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setK(el.clientWidth / W)
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const [bar, setBar] = useState<{ hp: number; ghost: number } | null>(null)
  const [hit, setHit] = useState<{ n: number; seq: number } | null>(null)
  useEffect(() => {
    if (left === null || total === null) return
    if (bar === null) {
      setBar({ hp: total, ghost: total })
      // Long enough to see it whole before it is hit.
      const t = setTimeout(() => {
        setBar({ hp: left, ghost: total })
        setHit({ n: total - left, seq: 1 })
      }, 700)
      return () => clearTimeout(t)
    }
    if (left !== bar.hp) {
      setHit(h => ({ n: bar.hp - left, seq: (h?.seq ?? 0) + 1 }))
      setBar({ hp: left, ghost: bar.hp })
    }
  }, [left, total])

  // Alternate the animation NAME to replay it, as the fight does.
  const recoil = hit && hit.n > 0 ? `cradle-recoil-crit${hit.seq % 2 ? '' : '-b'} 1s linear` : undefined
  const warn = bar && total && bar.hp > 0
    ? (bar.hp === 1 ? 'PERIL!' : bar.hp / total <= LOW ? 'CAUTION!' : null)
    : null

  return (
    <div ref={box} style={{ ...st.frame, aspectRatio: `${W} / ${H}` }}>
      <div style={{ ...st.stage, transform: `scale(${k})` }}>
        {zone && (
          <video
            src={`/title/${zone}.mp4`} poster={`/title/${zone}.jpg`}
            autoPlay muted loop playsInline aria-hidden
            style={st.backdrop}
          />
        )}
        <div style={st.wash} />

        {/* The cat. The floater comes out of it, 62% down, as in render.mjs. */}
        {art && (
          <div style={{ ...st.cat, animation: recoil }}>
            {framed
              ? <img src={art} alt="" style={st.catImg} />
              : <div style={st.ring}><img src={art} alt="" style={st.catBare} /></div>}
          </div>
        )}

        {/* The chrome, then the bar over it — the s&box HUD's order. */}
        <img src="/game/hud-ko-right.png" alt="" style={st.chrome} />
        {bar && total !== null && (
          <div style={{ ...st.bar, animation: recoil }}>
            <GameBar hp={bar.hp} ghost={bar.ghost} max={total} side="right" />
          </div>
        )}

        {bar && total !== null && (
          <div style={st.hpnum} aria-label={`${bar.hp} of ${total} left`}>
            <Haloed text={`${bar.hp}/${total}`} />
          </div>
        )}
        {warn && (
          <div style={{ ...st.caution, animation: 'cradle-blink 0.37s steps(1, end) infinite' }}>
            <Haloed text={warn} color={ALARM} />
          </div>
        )}

        {hit && (
          <div style={st.floater}>
            {/* Crit red for damage, which stands still; a miss is the weak grey and wobbles. */}
            <Floater
              key={hit.seq}
              scale={1}
              text={hit.n > 0 ? `-${hit.n}` : 'MISS'}
              color={hit.n > 0 ? '#e04a3a' : '#6a6a6a'}
              wavy={hit.n === 0}
            />
          </div>
        )}
      </div>
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  frame:    { position: 'relative', width: '100%', overflow: 'hidden', borderRadius: 10, background: '#dfe4ea' },
  stage:    { position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0', imageRendering: 'pixelated' },
  // The backdrop at 1:1, centred, so its pixels are the same size as the cat's and the bar's.
  // maxWidth none: the global `video { max-width: 100% }` squeezed 480 into the 248 stage.
  backdrop: { position: 'absolute', left: (W - 480) / 2, top: (H - 320) / 2, width: 480, height: 320, maxWidth: 'none', imageRendering: 'pixelated' },
  wash:     { position: 'absolute', inset: 0, background: 'rgba(232, 238, 246, 0.62)' },
  chrome:   { position: 'absolute', left: CHROME.x, top: CHROME.y, width: CHROME.w, height: CHROME.h, imageRendering: 'pixelated' },
  bar:      { position: 'absolute', left: gx(274), top: gy(22), width: 172 },
  hpnum:    { position: 'absolute', right: W - gx(448), top: gy(0) },
  caution:  { position: 'absolute', left: gx(277), top: gy(0) },
  cat:      { position: 'absolute', left: CAT.x, top: CAT.y, width: PORTRAIT, height: PORTRAIT },
  catImg:   { width: PORTRAIT, height: PORTRAIT, display: 'block', imageRendering: 'pixelated' },
  // For art with no frame of its own: the game's 2px paper ring round a 4px ink edge.
  ring:     { width: PORTRAIT, height: PORTRAIT, boxSizing: 'border-box', padding: 2, background: '#fdfdf8' },
  catBare:  { width: '100%', height: '100%', display: 'block', boxSizing: 'border-box', border: '4px solid #1a1a1a', objectFit: 'cover', objectPosition: 'top', imageRendering: 'pixelated', background: '#e6e0d2' },
  // A scale-1 glyph row is 24 tall; centre it on the cat's 62% line and let it rise from there.
  floater:  { position: 'absolute', left: 0, width: W, top: CAT.y + Math.round(PORTRAIT * 0.62) - 12, height: 24 },
}
