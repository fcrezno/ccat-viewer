'use client'

import { useEffect, useRef, useState } from 'react'
import { BitmapText } from '@/components/BitmapText'

/**
 * THE MAP INTO BATTLE — the island, an alarm, a dive, the cast and VS.
 *
 * JP, 2026-10-05: "can we still add ... the map screen into battle?", then
 * "where are the two cats poping us and VS thing". Ported from the renderer's
 * own set piece (clanker-arena/mapscreen.mjs: "alarm, dive, cast, VS,
 * countdown") with the camera from the s&box build's MapData.Generated.cs.
 * Drawn in GAME PIXELS: a child of the battle screen's 480x320 stage
 * (components/FightStage), like the countdown.
 *
 *   ALARM  0.55 s  the whole island, `!!!` in alarm red over its middle — NOT
 *                  over the place: "finding out where is what the dive is for".
 *                  It cuts in and out every 7 frames and jitters through SHAKE
 *                  every 2, at the renderer's 60 fps. (The brief cut's length:
 *                  this plays before every fight, not once a day.)
 *   DIVE   0.70 s  View(zone, t) with t = p^2: ease IN, "ActRaiser's dive starts
 *                  slow and accelerates". Ends on Framing(zone, 202), framed in
 *                  the room above the text box.
 *   NAME   0.45 s  the box is simply THERE when the camera stops; the place's
 *                  name fades up in it, (i/n)^0.7.
 *   CAST   0.65 s  the two cats DROP into the battle screen's own portrait boxes
 *                  (75,64) and (299,64), 0.2 s apart, from 34px up with a back
 *                  ease — "it lands, settles back, and stops". The same spots
 *                  they fight from, so the cut into the fight moves nothing.
 *   VS     0.35 s  JP's vs.png slams in "big and thin, collapsing onto its
 *                  resting size": k = 1 + 1.6 (1-u)^2.4.
 *   HOLD   1.00 s  red rings blink on the two who are about to fight (a ring,
 *                  "not a flashing portrait": the picture never goes away).
 *   CROSS  0.60 s  a crossfade into the battle screen, (i/n)^0.8 — "the two
 *                  pictures already agree: the cats are in the same boxes".
 *
 * Then the countdown. A tap skips straight to it.
 */

const W = 480
const H = 320

type Zone = { box: [number, number, number, number] }
/** MapData.Generated.cs — the icon boxes, measured off the art, not typed here. */
const ZONES: Record<string, Zone> = {
  Town:     { box: [107, 135, 164, 171] },
  Temple:   { box: [207, 86, 250, 129] },
  Caves:    { box: [301, 117, 368, 143] },
  Mountain: { box: [262, 170, 354, 226] },
  Forest:   { box: [146, 175, 224, 227] },
}

/** SOLO.textBox.y: the room above the text box, which the renderer frames into. */
const ROOM = 202

/** MapData.Framing: zoom so the place fills the shot without bursting out of it. */
function framing(z: Zone, room = ROOM) {
  const [x0, y0, x1, y1] = z.box
  const k = Math.max(1.6, Math.min(Math.min((W * 0.62) / (x1 - x0), (room * 0.6) / (y1 - y0)), 7))
  return { k, fy: room / 2 / H }
}

/**
 * MapData.View: where the camera looks at progress u (0 = whole map, 1 = framed).
 * The centre locks on by u = 0.6, faster than the view magnifies — "matching the
 * rates reads as an unsteady camera, not a dive".
 */
function view(z: Zone, u: number, maxZoom: number, focusY: number) {
  u = Math.max(0, Math.min(1, u))
  const k = 1 + (maxZoom - 1) * u
  const zx = (z.box[0] + z.box[2]) / 2
  const zy = (z.box[1] + z.box[3]) / 2
  const lock = Math.min(1, u / 0.6)
  const offY = (0.5 - focusY) * (H / k)
  let cx = W / 2 + (zx - W / 2) * lock
  let cy = H / 2 + (zy - H / 2) * lock + offY * lock
  const hw = W / (2 * k), hh = H / (2 * k)
  cx = Math.max(hw, Math.min(W - hw, cx))
  cy = Math.max(hh, Math.min(H - hh, cy))
  return { cx, cy, k }
}

// The beats, in ms, back to back.
const ALARM = 550
const DIVE = 700
const NAME = 450
const STEP = 200                       // between one cat landing and the next
const CAST = STEP * 2 + 250
const SLAM = 350
const HOLD = 1000
const CROSS = 600
const T_DIVE = ALARM
const T_NAME = T_DIVE + DIVE
const T_CAST = T_NAME + NAME
const T_VS = T_CAST + CAST
const T_HOLD = T_VS + SLAM
const T_CROSS = T_HOLD + HOLD
const T_END = T_CROSS + CROSS

const FRAME_MS = 1000 / 60
const FLASH_RATE = 7
const SHAKE_RATE = 2
const SHAKE = [[0, 0], [2, -1], [-2, 1], [1, 2], [-1, -2], [2, 1], [-2, -1], [0, 1]] as const
/** The island's mass centre, measured off the art. */
const ISLAND = [241, 168] as const
const ALERT = '#e02020'
/** LAYOUT.portraitLeft / portraitRight: where the two cats fight from. */
const BOXES = [75, 299] as const
const BOX_Y = 64
const BOX = 106
/** Where vs.png's mark sits on its 480x320 sheet, read out of the picture (alpha > 40). */
const VS_CENTRE = '242px 117px'

/** "it lands, settles back, and stops" — ease out with a small overshoot. */
const back = (t: number) => { const c = 1.70158, k = t - 1; return 1 + (c + 1) * k * k * k + c * k * k }

/** "the forest" → Forest, the name MapData uses. */
export const zoneOfTurf = (turf: string) => {
  const w = turf.replace(/^the /i, '')
  return w.charAt(0).toUpperCase() + w.slice(1)
}

export function MapDive({ zone, cast, onDone }: {
  zone: string
  /** The two about to fight: your cat's picture, then theirs. */
  cast: [string, string]
  onDone: () => void
}) {
  const z = ZONES[zone] ?? ZONES.Town
  const { k: frameK, fy } = framing(z)
  const [ms, setMs] = useState(0)
  const done = useRef(false)
  // In a ref, so a parent re-rendering with a new function does not restart the dive.
  const finish = useRef(onDone)
  finish.current = onDone

  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = () => {
      const t = performance.now() - t0
      setMs(t)
      if (t >= T_END) {
        if (!done.current) { done.current = true; finish.current() }
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const skip = () => { if (!done.current) { done.current = true; finish.current() } }

  const clamp = (n: number) => Math.max(0, Math.min(1, n))
  const p = clamp((ms - T_DIVE) / DIVE)
  const v = view(z, p * p, frameK, fy)
  const frame = Math.floor(ms / FRAME_MS)
  const alarm = ms < T_DIVE
  const flash = Math.floor(frame / FLASH_RATE) % 2 === 0
  const [dx, dy] = SHAKE[Math.floor(frame / SHAKE_RATE) % SHAKE.length]
  const card = ms >= T_NAME
  const nameFade = clamp((ms - T_NAME) / NAME) ** 0.7
  // Fractional: the whole part is how many have landed, the rest how far the next has fallen.
  const showCats = ms >= T_CAST ? (ms - T_CAST) / STEP : 0
  const vs = ms >= T_VS ? clamp((ms - T_VS) / SLAM) : 0
  const vsK = 1 + 1.6 * (1 - vs) ** 2.4
  // Rings blink on the two once both are standing; every 6 frames, as locationCard's `lit`.
  const rings = ms >= T_HOLD && Math.floor(frame / 6) % 2 === 0
  const fade = ms >= T_CROSS ? clamp((ms - T_CROSS) / CROSS) ** 0.8 : 0

  return (
    <div style={{ ...st.root, opacity: 1 - fade }} onClick={skip} role="img" aria-label={`The map: the fight is in the ${zone}`}>
      {/* The map, sized and placed rather than transformed: a point p lands at p*k + off. */}
      <img
        src="/game/mapscreen.png"
        alt=""
        style={{
          ...st.map,
          width: W * v.k, height: H * v.k,
          left: W / 2 - v.cx * v.k, top: H / 2 - v.cy * v.k,
        }}
      />

      {alarm && flash && (
        <div style={{ ...st.alert, left: ISLAND[0] + dx - 100, top: ISLAND[1] + dy - 36 }}>
          <BitmapText text="!!!" scale={3} color={ALERT} />
        </div>
      )}

      {card && (
        <>
          <img src="/game/bar/solobox.png" alt="" style={st.solobox} />
          <img src="/game/textscreen.png" alt="" style={st.overlay} />
          <div style={{ ...st.title, opacity: nameFade }}>
            <BitmapText text={`THE ${zone.toUpperCase()}`} scale={2} color="#b07a10" />
          </div>
        </>
      )}

      {/* THE CAST, dropping into the fight's own boxes. */}
      {cast.map((art, i) => {
        const d = clamp(showCats - i)
        if (d <= 0) return null
        return (
          <div key={i} style={{ ...st.cat, left: BOXES[i], top: BOX_Y - (1 - back(d)) * 34 }}>
            <img src={art} alt="" style={st.catArt} />
            {rings && <div style={st.ring} />}
          </div>
        )
      })}

      {/* VS, slamming in between them: the full sheet, scaled about its mark. */}
      {vs > 0.02 && (
        <img src="/game/vs.png" alt="VS" style={{ ...st.vs, transform: `scale(${vsK})` }} />
      )}
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  root:    { position: 'absolute', left: 0, top: 0, width: W, height: H, overflow: 'hidden', background: '#0e0e18', cursor: 'pointer', zIndex: 5 },
  map:     { position: 'absolute', maxWidth: 'none', imageRendering: 'pixelated' },
  // 200 wide and centred on the island's x, so `!!!` centres without measuring it.
  alert:   { position: 'absolute', width: 200, display: 'flex', justifyContent: 'center' },
  // SOLO.textBox: the paper, then the drawn box over it.
  solobox: { position: 'absolute', left: 33, top: 207, width: 416, height: 110 },
  overlay: { position: 'absolute', left: 0, top: 0, width: W, height: H, maxWidth: 'none' },
  // CARD.name: x 240, baseline 271 at scale 2 — the MapScreen title box, 64..408 from top 234.
  title:   { position: 'absolute', left: 64, top: 234, width: 344, height: 48, display: 'flex', justifyContent: 'center', alignItems: 'center' },
  // The battle screen's portrait, mount and all (components/FightStage), so the cut moves nothing.
  cat:     { position: 'absolute', width: BOX, height: BOX, boxSizing: 'border-box', padding: 2, background: '#fdfdf8' },
  catArt:  { width: '100%', height: '100%', display: 'block', boxSizing: 'border-box', border: '4px solid #1a1a1a', objectFit: 'cover', objectPosition: 'top', imageRendering: 'pixelated', background: '#e6e0d2' },
  ring:    { position: 'absolute', inset: 0, border: `3px solid ${ALERT}` },
  vs:      { position: 'absolute', left: 0, top: 0, width: W, height: H, maxWidth: 'none', transformOrigin: VS_CENTRE, imageRendering: 'pixelated', pointerEvents: 'none' },
}
