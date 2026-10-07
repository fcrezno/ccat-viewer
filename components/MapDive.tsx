'use client'

import { useEffect, useRef, useState } from 'react'
import { BitmapText } from '@/components/BitmapText'
import { Checker } from '@/components/LadderScreen'
import { measure } from '@/lib/font'

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
 *   WHITE  0.40 s  the whole scene fades to white
 *   CHECKS 0.45 s  the ladder's paper-blue checker fades in over it
 *   CURTAIN 0.60 s the closed checker holds ("make the curtain close last a little longer")
 *   SPLIT  0.80 s  the checker parts down the middle onto the battle screen
 *
 * The camera stops at an even 2x (see ZOOM) and the name sits on a clean paper
 * card — JP's "clean up the map", Oct 5.
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

/*
 * THE ZOOM: an even 2x, every zone. MapData.Framing zoomed each place to fill
 * the shot — 2.2x to 3.4x — but the map art is only 480x320 (no bigger copy
 * exists), and at an uneven zoom its pixels come out different sizes, which is
 * what made the dive look blocky and dirty. At 2x every pixel is 2x2.
 * JP, 2026-10-05: "clean up the map".
 */
const ZOOM = 2

function framing(room = ROOM) {
  return { k: ZOOM, fy: room / 2 / H }
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
/** How long VS shakes once it has landed. */
const LAND = 300
/*
 * THE WAY INTO THE FIGHT. JP, 2026-10-05: "fade into white; then have the
 * checkerboard fade in and split revealing the fight and transition into that".
 * The checker is the ladder's own (LadderScreen `checker`), so the two screens
 * either side of a fight are one family.
 */
const WHITE = 400                      // the whole scene fades to white
const CHECKS = 450                     // the checker fades in over the white
/** The closed curtain holds before it parts. JP, 2026-10-06: "make the curtain close last a little longer… its too fast". */
const CURTAIN = 600
const SPLIT = 800                      // it parts down the middle, ease-in, onto the fight
const T_DIVE = ALARM
const T_NAME = T_DIVE + DIVE
const T_CAST = T_NAME + NAME
const T_VS = T_CAST + CAST
const T_HOLD = T_VS + SLAM
const T_WHITE = T_HOLD + HOLD
const T_CHECKS = T_WHITE + WHITE
const T_SPLIT = T_CHECKS + CHECKS + CURTAIN
const T_END = T_SPLIT + SPLIT
/** The split's cut edges carry the ink line, as every panel does. */
const INK = '#1a1a1a'

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

/*
 * THE CHECKER'S LETTERING. JP, 2026-10-05: "Have that blue checkerboard have
 * Clanker Cats in text so it looks cooler". Rows of the name in the game's font,
 * a shade under the checker, sliding in opposite directions row by row. Laid
 * out in SCREEN coordinates and drawn inside each half (offset by the half's
 * own left), so the words split with the checker.
 */
// JP: "and make it say" ... "CLANK THAT CAT!"
const BRAND = 'CLANK THAT CAT!'
// "make the text on clanker cats smaller and spaced out", then "1.5 size": wide gaps, airy rows.
const BRAND_SCALE = 1.5
const BRAND_GAP = 64
const BRAND_UNIT = measure(BRAND) * BRAND_SCALE + BRAND_GAP
const BRAND_ROW = 44
/*
 * "Also color code the text to the area it's in": each place's own colour,
 * sampled off mapscreen.png's icon boxes (the commonest saturated colour in
 * each) and firmed up a step so it holds on the pale checker; the lettering
 * then sits at BRAND_ALPHA. "add it to the checkboard text as well": the title's
 * look — full zone ink and the same hard 2px ink drop shadow.
 *   Town #3878f8 · Temple #c878f8 · Caves #b8b888 · Mountain #d88838 · Forest #087808
 */
const ZONE_INK: Record<string, string> = {
  Town: '#3878f8',
  Temple: '#b060f0',
  Caves: '#8f8f5a',
  Mountain: '#c86a28',
  Forest: '#2f8f3a',
}
const BRAND_ALPHA = 1
/** px per ms: 30 px a second. */
const BRAND_SPEED = 0.03

function Lettering({ ms, left, ink }: { ms: number; left: number; ink: string }) {
  const rows = Math.ceil(H / BRAND_ROW)
  const copies = Math.ceil(W / BRAND_UNIT) + 2
  return (
    <div style={{ position: 'absolute', top: 0, left: -left, width: W, height: H, pointerEvents: 'none', opacity: BRAND_ALPHA, filter: 'drop-shadow(2px 2px 0 #1a1a1a)' }}>
      {Array.from({ length: rows }, (_, r) => {
        const dir = r % 2 ? 1 : -1
        // Odd rows half a word over, so the names stagger like bricks.
        const travel = ms * BRAND_SPEED * dir + (r % 2) * BRAND_UNIT / 2
        const x = ((travel % BRAND_UNIT) + BRAND_UNIT) % BRAND_UNIT - BRAND_UNIT
        return (
          <div key={r} style={{ position: 'absolute', left: 0, top: r * BRAND_ROW + 10, display: 'flex', gap: BRAND_GAP, transform: `translate3d(${x}px, 0, 0)`, willChange: 'transform' }}>
            {Array.from({ length: copies }, (_, c) => (
              <div key={c} style={{ flexShrink: 0 }}>
                <BitmapText text={BRAND} scale={BRAND_SCALE} color={ink} />
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

/** "it lands, settles back, and stops" — ease out with a small overshoot. */
const back = (t: number) => { const c = 1.70158, k = t - 1; return 1 + (c + 1) * k * k * k + c * k * k }

/** "the forest" → Forest, the name MapData uses. */
export const zoneOfTurf = (turf: string) => {
  const w = turf.replace(/^the /i, '')
  return w.charAt(0).toUpperCase() + w.slice(1)
}

/** The announcer's outline and hard shadow: the 3 2 1's (Cradle COUNT_INK). */
const WORDS_INK = 'drop-shadow(3px 0 0 #1a1a1a) drop-shadow(-3px 0 0 #1a1a1a) drop-shadow(0 3px 0 #1a1a1a) drop-shadow(0 -3px 0 #1a1a1a) drop-shadow(4px 4px 0 #1a1a1a)'
/** Room for the widest half, inside the stage with its outline. */
const WORDS_ROOM = 440
const WORDS_INKS = ['#f0f0f5', '#ffd166']

/**
 * The announcer's line, drawn ONCE PER HALF of the curtain at the stage's own
 * coordinates, so each half clips its side of the words and carries it away.
 * As big as the widest half allows, to 3x, in quarter steps. The shake is driven
 * off the shared frame, not a CSS loop, so the two halves never drift apart.
 */
function Words({ words, up, left, frame }: { words: readonly string[]; up: number; left: number; frame: number }) {
  // Sized off the WHOLE line, so the first half does not shrink when the second lands.
  const widest = Math.max(...words.map(w => measure(w)), 1)
  const scale = Math.min(3, Math.floor((WORDS_ROOM / widest) * 4) / 4)
  // A light tremble: half a step, every 4 frames (JP: "dont make it shake too much").
  const [sx, sy] = SHAKE[Math.floor(frame / 4) % SHAKE.length]
  return (
    <div style={{ ...st.words, left: -left, transform: `translate(${sx * 0.5}px, ${sy * 0.5}px)` }}>
      {words.slice(0, up).map((w, i) => (
        <div key={i} style={{ animation: 'cradle-count 0.45s ease-out', filter: WORDS_INK }}>
          <BitmapText text={w} scale={scale} color={WORDS_INKS[i % 2]} />
        </div>
      ))}
    </div>
  )
}

export function MapDive({ zone, cast, onDone, hold = false, onClosed, words, wordsUp = 0, onTapHeld }: {
  zone: string
  /**
   * Keep the curtain CLOSED once it is: the dive stops at the start of the split
   * until this goes false. JP, 2026-10-06: "have the curtain close then the
   * announcer speaks then it opens up to the count down".
   */
  hold?: boolean
  /** Called once, when the curtain is closed and holding. */
  onClosed?: () => void
  /**
   * The announcer's words ON the curtain, so they part with it (JP, 2026-10-06:
   * "make the message also split with the curtain and make it bigger"). The
   * whole line, so it is sized once.
   */
  words?: readonly string[]
  /** How many of those halves have landed so far. */
  wordsUp?: number
  /** A tap while the curtain holds: the parent opens it. */
  onTapHeld?: () => void
  /** The two about to fight: your cat's picture, then theirs. */
  cast: [string, string]
  onDone: () => void
}) {
  const z = ZONES[zone] ?? ZONES.Town
  const { k: frameK, fy } = framing()
  const [ms, setMs] = useState(0)
  const done = useRef(false)
  // In a ref, so a parent re-rendering with a new function does not restart the dive.
  const finish = useRef(onDone)
  finish.current = onDone
  const holding = useRef(hold)
  holding.current = hold
  const closed = useRef(onClosed)
  closed.current = onClosed
  /** Real time since the dive began: the checker and its lettering keep moving through a hold. */
  const [clock, setClock] = useState(0)

  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    let paused = 0                       // ms spent held, taken off the dive's own clock
    let since: number | null = null      // when the current hold began
    let told = false
    const tick = () => {
      const now = performance.now()
      setClock(now - t0)
      if (since !== null && !holding.current) { paused += now - since; since = null }
      let t = now - t0 - paused
      if (t >= T_SPLIT && holding.current) {
        if (since === null) since = now
        if (!told) { told = true; closed.current?.() }
        t = T_SPLIT
      }
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

  const msNow = useRef(0)
  msNow.current = ms
  const skip = () => {
    if (hold && msNow.current >= T_SPLIT && onTapHeld) return onTapHeld()
    if (!done.current) { done.current = true; finish.current() }
  }
  /** Real-time frame for the words' shake: the dive's own clock stands still while held. */
  const liveFrame = Math.floor(clock / FRAME_MS)

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
  /*
   * "make the vs shake when it decends and lands": a small tremble all the way
   * down, then a hard shake on the landing that dies away over LAND ms. The
   * alarm's own SHAKE table, whose steps are up to 2 px, scaled by the amount.
   */
  const landed = ms - T_HOLD
  const vsAmp = vs > 0 && vs < 1 ? 1 : landed >= 0 && landed < LAND ? 2.5 * (1 - landed / LAND) : 0
  const [sx, sy] = SHAKE[Math.floor(frame / SHAKE_RATE) % SHAKE.length]
  // Rings blink on the two once both are standing; every 6 frames, as locationCard's `lit`.
  const rings = ms >= T_HOLD && Math.floor(frame / 6) % 2 === 0
  const white = clamp((ms - T_WHITE) / WHITE)
  const checks = clamp((ms - T_CHECKS) / CHECKS)
  // Ease IN: the halves start slow and leave fast, like the dive.
  const split = clamp((ms - T_SPLIT) / SPLIT) ** 2
  /** Once the checker covers it all, the scene under it is gone: the split opens onto the fight. */
  const scene = ms < T_SPLIT
  /** The announcer is speaking over the closed curtain: its own lettering steps back. */
  const quiet = hold && ms >= T_SPLIT

  return (
    <div style={{ ...st.root, background: scene ? st.root.background : 'transparent' }} onClick={skip} role="img" aria-label={`The map: the fight is in the ${zone}`}>
      {scene && <>
      {/*
       * The map, sized and placed rather than transformed: a point p lands at
       * p*k + off. ROUNDED, so at rest on the even zoom the pixels sit on the grid.
       */}
      <img
        src="/game/mapscreen.png"
        alt=""
        style={{
          ...st.map,
          width: W * v.k, height: H * v.k,
          left: Math.round(W / 2 - v.cx * v.k), top: Math.round(H / 2 - v.cy * v.k),
        }}
      />

      {alarm && flash && (
        <div style={{ ...st.alert, left: ISLAND[0] + dx - 100, top: ISLAND[1] + dy - 36 }}>
          <BitmapText text="!!!" scale={3} color={ALERT} />
        </div>
      )}

      {/* The place's name, on a clean paper card: the ladder panel's line and hard shadow. */}
      {card && (
        <div style={st.card}>
          {/*
           * "Make the text slightly more animated and give it a shadow": the
           * game's wave, over a hard 2px ink shadow — the card's own shadow, at
           * the letters' size. Then "make the area title match the color scheme
           * of the arena": the zone's own ink (ZONE_INK), so the gold glow is
           * gone — it can only paint gold — and the wave alone moves it.
           */}
          <div style={{ opacity: nameFade, filter: 'drop-shadow(2px 2px 0 #1a1a1a)' }}>
            <BitmapText text={`THE ${zone.toUpperCase()}`} scale={2} color={ZONE_INK[zone] ?? ZONE_INK.Town} fx="wave" />
          </div>
        </div>
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
        <img src="/game/vs.png" alt="VS" style={{ ...st.vs, transform: `translate(${sx * vsAmp}px, ${sy * vsAmp}px) scale(${vsK})` }} />
      )}

      {white > 0 && <div style={{ ...st.white, opacity: white }} />}
      </>}

      {/* The checker: in over the white, then parting down the middle onto the fight. */}
      {checks > 0 && (
        <>
          <div style={{ ...st.half, left: 0, opacity: checks, transform: `translateX(${-split * (W / 2 + 4)}px)` }}>
            <Checker ms={clock} left={0} />
            <div style={{ opacity: quiet ? 0.2 : 1, transition: 'opacity 0.25s ease-out' }}>
              <Lettering ms={clock} left={0} ink={ZONE_INK[zone] ?? ZONE_INK.Town} />
            </div>
            {words && wordsUp > 0 && <Words words={words} up={wordsUp} left={0} frame={liveFrame} />}
            {split > 0 && <div style={{ ...st.edge, right: 0 }} />}
          </div>
          <div style={{ ...st.half, left: W / 2, opacity: checks, transform: `translateX(${split * (W / 2 + 4)}px)` }}>
            <Checker ms={clock} left={W / 2} />
            <div style={{ opacity: quiet ? 0.2 : 1, transition: 'opacity 0.25s ease-out' }}>
              <Lettering ms={clock} left={W / 2} ink={ZONE_INK[zone] ?? ZONE_INK.Town} />
            </div>
            {words && wordsUp > 0 && <Words words={words} up={wordsUp} left={W / 2} frame={liveFrame} />}
            {split > 0 && <div style={{ ...st.edge, left: 0 }} />}
          </div>
        </>
      )}
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  root:    { position: 'absolute', left: 0, top: 0, width: W, height: H, overflow: 'hidden', background: '#0e0e18', cursor: 'pointer', zIndex: 5 },
  map:     { position: 'absolute', maxWidth: 'none', imageRendering: 'pixelated' },
  // 200 wide and centred on the island's x, so `!!!` centres without measuring it.
  alert:   { position: 'absolute', width: 200, display: 'flex', justifyContent: 'center' },
  // Under the cats' boxes (they end at y 170), centred on 240.
  card:    { position: 'absolute', left: 88, top: 214, width: 304, height: 64, boxSizing: 'border-box', background: '#e8eef6', border: '2px solid #1a1a1a', boxShadow: '4px 4px 0 #1a1a1a', display: 'flex', justifyContent: 'center', alignItems: 'center' },
  white:   { position: 'absolute', inset: 0, background: '#ffffff' },
  // Each half 240 wide; the right one's checker is offset by its own left, so the two meet seamlessly.
  half:    { position: 'absolute', top: 0, width: W / 2, height: H, overflow: 'hidden' },
  // The whole stage, inside one half: placed back by the half's own left.
  words:   { position: 'absolute', top: 0, width: W, height: H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, pointerEvents: 'none' },
  // The cut edge's ink line: over the lettering, so the words end on it.
  edge:    { position: 'absolute', top: 0, width: 2, height: H, background: INK },
  // The battle screen's portrait, mount and all (components/FightStage), so the cut moves nothing.
  cat:     { position: 'absolute', width: BOX, height: BOX, boxSizing: 'border-box', padding: 2, background: '#fdfdf8' },
  catArt:  { width: '100%', height: '100%', display: 'block', boxSizing: 'border-box', border: '4px solid #1a1a1a', objectFit: 'cover', objectPosition: 'top', imageRendering: 'pixelated', background: '#e6e0d2' },
  ring:    { position: 'absolute', inset: 0, border: `3px solid ${ALERT}` },
  vs:      { position: 'absolute', left: 0, top: 0, width: W, height: H, maxWidth: 'none', transformOrigin: VS_CENTRE, imageRendering: 'pixelated', pointerEvents: 'none' },
}
