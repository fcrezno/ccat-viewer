'use client'

import { useEffect, useRef, useState } from 'react'
import { BitmapText, type Run } from '@/components/BitmapText'

/**
 * THE LADDER AFTER A VICTORY — the Mortal Kombat II climb.
 *
 * JP, 2026-10-05: "can we still add that mortal kombat ladder thing after
 * victory that we used to have?", then, of the first version, "not the same
 * tower build fix it" and "go back into past videos where it looked more closer
 * to the mortal kombat ladder rise; this was before we moved to sandbox".
 *
 * So this is the RENDERER's tower (clanker-arena/tower.mjs) and its arrival
 * (render.mjs, the RANKINGS scene in out/tower-check.mp4), not the s&box
 * screen, which never got the motion. In GAME PIXELS on the battle screen's
 * 480x320 stage (components/FightStage):
 *
 *   rungs    TOWER: baselines from y 78, 42 apart, offsets from the centre line
 *            240 — rank right-aligned at -110, a 36px portrait at -100, the
 *            name at -54, points right-aligned at +132; a 280x38 gold band on
 *            the rung in focus. The font's baseline is 18 (assets/ui/font.json).
 *   faces    render.mjs `portrait`: a 4px dark edge with a 2px light ring
 *            outside it, both INSIDE the size; a beaten cat goes grey and dim.
 *   window   VIEW: rows are seen through y 50..316. `scroll` is a CAMERA over
 *            the ladder, so rungs slide under the edges rather than popping.
 *   title    RANKINGS, rainbow letter by letter and waving — "a ladder screen
 *            is a moment of spectacle, not a report".
 *   frame    JP, 2026-10-05: "have a little border around rankings so its not
 *            all one color". A 2px ink line round the screen, and the ladder on
 *            its own paper panel over the scrolling field (see Field).
 *
 * THE ARRIVAL, in render.mjs's beats:
 *   1  0.55 s  your portrait slides off its box on the battle screen into the
 *              middle, same size (smoothstep)
 *   2  0.50 s  it shrinks into its own rung, which waits EMPTY until it lands;
 *              the CENTRE is eased, not the corner (ease-out cubic)
 *   3  0.40 s  the ladder is whole for a beat
 *   4  0.34 s  THE SWAP: "The winner does not slide up THROUGH the cats it beat
 *              — it takes their place and pushes them down into its own, the
 *              way the MKII ladder does it." Both rows move.
 *   5  0.50 s  hold; then 0.45 s, and the camera travels UP the ladder to the
 *              top in 1.5 s (smoothstep)
 *
 * For the gauntlet the ladder is MKII's own: the five above, you at the bottom,
 * and each round won swaps you one rung up. As in the renderer, the top of the
 * ladder holds for 1.2 s and the scene ends itself; a tap ends it sooner. The
 * results and their choices are under it.
 */

const W = 480
const H = 320
const MID = 240
const TOP = 78
const PITCH = 42
const RISE = 0.72
const THUMB = 36
const BAND_W = 280
const BAND_H = 38
const BASELINE = 18
const thumbTop = -Math.round(THUMB * RISE)
const bandTop = -Math.round(BAND_H * RISE)
const VIEW_TOP = 50
/** The ink line round the whole screen, and the ladder's paper panel inside it. */
const RIM = 0
const LINE = 2
const PANEL_X = 96
const PANEL_Y = 42
/** "shrink this box": it hugs the rungs — the band is 100..380, the last rung ends at 299. */
const PANEL_BOTTOM = 308
/** The panel's inner bottom: the renderer's H - 4 would run over its line. */
const VIEW_BOTTOM = PANEL_BOTTOM - 2
/**
 * The fade: a rung is whole until it comes within FADE px of an edge, and gone
 * as it reaches one. The edges are the panel's own inner edges, so a rung is gone
 * before it can touch the panel's line. At rest, rank 1's band starts at 51 and
 * the last rung's ends at 299: 7 px inside the line at each end, clear of FADE.
 */
const FADE = 6
const TITLE_FLOOR = PANEL_Y + 2
/** Where the rung in focus rides while it is the one being watched. */
const MID_Y = 178
/** Your cat's box on the battle screen (LAYOUT.portraitLeft): the flight starts from it. */
const FROM = { x: 75, y: 64, size: 106 }

const LIVE = '#1a1a1a'
const DEAD = '#8d8d8d'
const CHAMP = '#c8891a'
const BAND = '#f2d98a'
const PAPER = '#e8eef6'
/** The paper, two shades down: the rim outside the ink line. */
const PAPER_DEEP = '#b4c2d6'

const rungY = (i: number, scroll = 0) => TOP + i * PITCH - scroll
/** Where the camera must sit for row `i` to land at screen height `y`. */
const scrollFor = (i: number, y: number) => TOP + i * PITCH - y
const smooth = (t: number) => t * t * (3 - 2 * t)
const ease = (t: number) => 1 - (1 - t) ** 3
const clamp = (t: number) => Math.max(0, Math.min(1, t))

// The beats, in ms.
const SLIDE = 550
const SHRINK = 500
const SETTLE = 400
const CLIMB = 340
const HOLD = 500
const WAIT = 450
const PAN = 1500
const END_HOLD = 1200

/*
 * THE BACKGROUND. JP, 2026-10-05: "i want to do some paraliax scrolling in that
 * background; think sonic 1 special stages; feel free to use text or images i
 * gave u", then "think more like pizza tower".
 *
 *   checker  Pizza Tower's title cards: a two-tone checkerboard scrolling on
 *            the diagonal, under everything.
 *   rows     Sonic 1's special stage: line by line, each row its own speed,
 *            slow at the top and faster going down. The yard's items.
 *   morph    Sonic's birds turning into fish, done with the yard's sun and moon
 *            (its clock) — "dont use mr fish and duck". Each holds, then
 *            CROSS-FADES into the other: "instead of 1 frame change have it fade".
 *
 * Then "and less is more" and "too much visual noise; change the colors so it
 * fits the vibe of clanker cats": the checker is two of the game's own paper
 * blues, a step apart; the pictures are sparse and faint, with no outline. The
 * ladder sits on its own paper panel over the middle, with an ink line and a
 * hard ink shadow — the game's chrome.
 */
const FIELD_ALPHA = 0.3
// Sparse: four rows, a picture every 96 px.
const FIELD_ROW = 78
const FIELD_CELL = 96
const FIELD_ICON = 30
const CHECK = 32
const CHECK_A = '#d3dceb'
const CHECK_B = '#c9d3e4'
/** px per ms that the checker and the rows fall: 20 px a second. */
const FALL = 0.02
const MORPH = 1600
/** The last part of each MORPH spent fading, not holding. */
const MORPH_FADE = 0.35
const SUN = '/yard/items/sun.png'
const MOON = '/yard/items/moon.png'
const ITEMS = ['pizza', 'donut', 'gameboy', 'banana', 'vinyl', 'chips', 'pineapple', 'cup', 'walnut', 'beer']
  .map(n => `/yard/items/${n}.png`)
/** A 2px ink outline round the title's glyphs: drop-shadows follow the mask. */
const OUTLINE = 'drop-shadow(2px 0 0 #1a1a1a) drop-shadow(-2px 0 0 #1a1a1a) drop-shadow(0 2px 0 #1a1a1a) drop-shadow(0 -2px 0 #1a1a1a)'

function Field({ ms, width, height }: { ms: number; width: number; height: number }) {
  // One spare row to wrap round, and an even count so the sun-moon / items alternation survives the wrap.
  const rows = Math.ceil(height / FIELD_ROW / 2) * 2 + 2
  const span = rows * FIELD_ROW
  const cells = Math.ceil(width / FIELD_CELL) + 2
  // Which of the two is up, and how far into the fade to the other.
  const k = ms / MORPH
  const state = Math.floor(k) % 2
  const blend = smooth(clamp(((k % 1) - (1 - MORPH_FADE)) / MORPH_FADE))
  // The checker drifts down and to the left, 20 px a second.
  const drift = (ms * FALL) % (CHECK * 2)
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `repeating-conic-gradient(${CHECK_A} 0 25%, ${CHECK_B} 0 50%)`,
        backgroundSize: `${CHECK * 2}px ${CHECK * 2}px`,
        backgroundPosition: `${-drift}px ${drift}px`,
      }} />
      {Array.from({ length: rows }, (_, r) => {
        // px per ms: about 12 px a second at the top, 72 at the bottom.
        const v = 0.012 + (0.06 * r) / Math.max(1, rows - 1)
        // Odd rows half a cell over, so the field is a lattice, not columns.
        const x = -((ms * v + (r % 2) * FIELD_CELL / 2) % FIELD_CELL)
        /*
         * DIAGONAL — "also make them move diagonally". Every row also falls with
         * the checker, at ITS speed, so the rows never cross; the sideways speed
         * is still each row's own, so the parallax holds. Wraps from the bottom.
         */
        const y = ((r * FIELD_ROW + ms * FALL) % span) - FIELD_ROW
        return (
          <div key={r} style={{ position: 'absolute', left: 0, top: y, height: FIELD_ROW, transform: `translateX(${x}px)`, display: 'flex', opacity: FIELD_ALPHA }}>
            {Array.from({ length: cells }, (_, c) => {
              const cell = { width: FIELD_CELL, height: FIELD_ROW, position: 'relative' as const, flexShrink: 0 }
              if (r % 2) {
                return (
                  <div key={c} style={cell}>
                    <img src={ITEMS[(c + r * 3) % ITEMS.length]} alt="" style={st.icon} />
                  </div>
                )
              }
              // The checker of suns and moons: this cell's moon-ness now, and after the swap.
              const was = (c + r / 2 + state) % 2
              const moon = was + ((1 - was) - was) * blend
              return (
                <div key={c} style={cell}>
                  <img src={SUN} alt="" style={{ ...st.icon, opacity: 1 - moon }} />
                  <img src={MOON} alt="" style={{ ...st.icon, opacity: moon }} />
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

export type Rung = { uid: string; name: string; art: string; pixel?: boolean }

type Row = Rung & { you?: boolean; down?: boolean }

/** render.mjs `portrait`: the dark edge and the light ring live inside `size`. */
function Face({ art, size, dead, pixel, style }: {
  art: string; size: number; dead?: boolean; pixel?: boolean; style?: React.CSSProperties
}) {
  return (
    <div style={{ ...st.face, width: size, height: size, ...style }}>
      <img
        src={art}
        alt=""
        style={{
          ...st.faceArt,
          borderColor: dead ? '#5a5a5a' : '#1a1a1a',
          filter: dead ? 'grayscale(1) brightness(0.6)' : undefined,
          imageRendering: pixel === false ? 'auto' : 'pixelated',
        }}
      />
    </div>
  )
}

export function LadderScreen({ foes, beaten, you, champion, pot, onDone }: {
  /** The run's five, round 1 first. */
  foes: Rung[]
  /** How many are beaten, counting the round just won. */
  beaten: number
  you: { name: string; art: string }
  champion: boolean
  /** What the run is carrying: your rung's points. */
  pot: number
  onDone: () => void
}) {
  /*
   * THE LADDER NOW, top to bottom: the ones still to fight (the last round at
   * the top), you, then the ones you beat. The win just taken swapped you one
   * rung up, past the cat at the top of the beaten.
   */
  const ahead = foes.slice(beaten).reverse()
  const behind = foes.slice(0, beaten).reverse()
  const rows: Row[] = [
    ...ahead,
    { uid: 'you', name: you.name, art: you.art, you: true },
    ...behind.map(f => ({ ...f, down: true })),
  ]
  const slot = ahead.length
  const rose = beaten > 0 ? 1 : 0
  const bumped = rose ? behind[0]?.uid : null

  // The camera: the rung in focus rides at MID_Y from where it STARTED the climb.
  const camAt = scrollFor(slot, MID_Y) + rose * PITCH
  const camTop = scrollFor(0, TOP)

  const T_SHRINK = SLIDE
  const T_SETTLE = T_SHRINK + SHRINK
  const T_CLIMB = T_SETTLE + SETTLE
  const T_PAN = T_CLIMB + CLIMB * rose + HOLD + WAIT
  const T_END = T_PAN + PAN

  const finish = useRef(onDone)
  finish.current = onDone
  const [ms, setMs] = useState(0)
  useEffect(() => {
    let raf = 0
    let done = false
    const t0 = performance.now()
    const tick = () => {
      const t = performance.now() - t0
      setMs(t)
      // The renderer's last beat: the top of the ladder held for 1.2 s, then the scene ends.
      if (t >= T_END + END_HOLD) { if (!done) { done = true; finish.current() } return }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // The beats are fixed for the life of the screen: it is remounted, not re-timed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 4 — the swap; 5 — the pan.
  const climbT = rose ? ease(clamp((ms - T_CLIMB) / CLIMB)) : 1
  const scroll = camAt + (camTop - camAt) * smooth(clamp((ms - T_PAN) / PAN))
  /*
   * How far a row is from where it ends up, in pixels. Positive is above: the
   * cat you bumped starts a rung up, and you start `rose` rungs down.
   */
  const liftOf = (r: Row) =>
    r.you ? -rose * PITCH * (1 - climbT) : r.uid === bumped ? PITCH * (1 - climbT) : 0

  // 1 and 2 — your portrait, flying home. The home is where the rung sits BEFORE the climb.
  const home = {
    cx: MID - 100 + THUMB / 2,
    cy: rungY(slot, camAt) + rose * PITCH + thumbTop + THUMB / 2,
  }
  const big = { cx: W / 2, cy: H / 2 }
  const from = { cx: FROM.x + FROM.size / 2, cy: FROM.y + FROM.size / 2 }
  let fly: { x: number; y: number; size: number } | null = null
  if (ms < T_SHRINK) {
    const e = smooth(clamp(ms / SLIDE))
    const cx = from.cx + (big.cx - from.cx) * e
    const cy = from.cy + (big.cy - from.cy) * e
    fly = { size: FROM.size, x: cx - FROM.size / 2, y: cy - FROM.size / 2 }
  } else if (ms < T_SETTLE) {
    const e = ease(clamp((ms - T_SHRINK) / SHRINK))
    const size = Math.round(FROM.size + (THUMB - FROM.size) * e)
    const cx = big.cx + (home.cx - big.cx) * e
    const cy = big.cy + (home.cy - big.cy) * e
    fly = { size, x: cx - size / 2, y: cy - size / 2 }
  }

  /*
   * placeFx's rainbow: hsl(i * 22 + phase * 1.2, 75%, 42%), phase in frames at
   * the renderer's 60 — so the hue rolls 72 degrees a second along the word.
   */
  const title = 'RANKINGS'
  const runs: Run[] = [...title].map((ch, i) => ({
    text: ch,
    color: `hsl(${Math.round((i * 22 + ms * 0.072) % 360)}, 75%, 42%)`,
  }))

  return (
    <div
      style={st.root}
      onClick={() => finish.current()}
      role="img"
      aria-label={champion ? 'Rankings: you are at the top' : `Rankings: you climbed to rung ${slot + 1}`}
    >
      <div style={st.frame}>
        <Field ms={ms} width={W - 2 * (RIM + LINE)} height={H - 2 * (RIM + LINE)} />
      </div>
      <div style={st.panel} />
      <div style={st.title}>
        <BitmapText runs={runs} scale={2} fx="wave" />
      </div>

      {/* THE WINDOW: everything on the ladder is seen through y 50..316. */}
      <div style={st.view}>
        <div style={{ position: 'absolute', left: 0, top: -VIEW_TOP, width: W, height: H }}>
          {rows.map((r, i) => {
            const y = rungY(i, scroll) - Math.round(liftOf(r))
            /*
             * NO CLIPPING. JP, 2026-10-05, of a rung cut in half under the title:
             * "i dont want this clipping". The renderer slid rungs under the
             * window's edge; here a rung FADES as a whole over the last FADE px
             * before an edge, and is gone before any of it crosses one.
             */
            const fade = Math.min(
              clamp((y + bandTop - TITLE_FLOOR) / FADE),
              clamp((VIEW_BOTTOM - (y + bandTop + BAND_H)) / FADE),
            )
            if (fade <= 0) return null
            const ink = r.down ? DEAD : i === 0 ? CHAMP : LIVE
            const points = r.you ? String(pot) : r.down ? 'KO' : i === slot - 1 ? 'NEXT' : ''
            return (
              <div key={r.uid} style={{ opacity: fade }}>
                {r.you && <div style={{ ...st.band, top: y + bandTop }} />}
                <div style={{ ...st.label, left: 0, width: MID - 110, justifyContent: 'flex-end', top: y - BASELINE }}>
                  <BitmapText text={`${i + 1}.`} scale={1} color={ink} />
                </div>
                {/* Your rung waits empty while your portrait is still flying into it. */}
                {!(r.you && fly) && (
                  <Face art={r.art} size={THUMB} dead={r.down} pixel={r.pixel} style={{ left: MID - 100, top: y + thumbTop }} />
                )}
                <div style={{ ...st.label, left: MID - 54, top: y - BASELINE }}>
                  <BitmapText text={r.name} scale={1} color={ink} />
                </div>
                {points && (
                  <div style={{ ...st.label, left: 0, width: MID + 132, justifyContent: 'flex-end', top: y - BASELINE }}>
                    <BitmapText text={points} scale={1} color={ink} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Your portrait in flight: over everything, the window does not clip it. */}
      {fly && <Face art={you.art} size={fly.size} style={{ left: fly.x, top: fly.y, zIndex: 2 }} />}
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  root:    { position: 'absolute', left: 0, top: 0, width: W, height: H, overflow: 'hidden', background: PAPER_DEEP, cursor: 'pointer', zIndex: 6 },
  frame:   { position: 'absolute', inset: RIM, border: `${LINE}px solid ${LIVE}` },
  // TOWER.title: centred on 240, baseline 36 at scale 2 — so the glyphs' top is 0.
  title:   { position: 'absolute', left: 0, top: 0, width: W, height: 48, display: 'flex', justifyContent: 'center', filter: OUTLINE },
  view:    { position: 'absolute', left: 0, top: VIEW_TOP, width: W, height: VIEW_BOTTOM - VIEW_TOP },
  label:   { position: 'absolute', height: 24, display: 'flex' },
  band:    { position: 'absolute', left: MID - BAND_W / 2, width: BAND_W, height: BAND_H, background: BAND },
  face:    { position: 'absolute', boxSizing: 'border-box', padding: 2, background: '#fdfdf8' },
  icon:    { position: 'absolute', left: (FIELD_CELL - FIELD_ICON) / 2, top: (FIELD_ROW - FIELD_ICON) / 2, width: FIELD_ICON, height: FIELD_ICON, objectFit: 'contain' },
  // The ladder's own paper, over the middle of the field: the rungs run 110..372.
  panel:   { position: 'absolute', left: PANEL_X, top: PANEL_Y, width: W - 2 * PANEL_X, height: PANEL_BOTTOM - PANEL_Y, background: PAPER, border: `${LINE}px solid ${LIVE}`, boxSizing: 'border-box', boxShadow: `4px 4px 0 ${LIVE}` },
  faceArt: { width: '100%', height: '100%', display: 'block', boxSizing: 'border-box', border: '4px solid', objectFit: 'cover', objectPosition: 'top', background: '#e6e0d2' },
}
