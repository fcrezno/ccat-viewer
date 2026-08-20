'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * THE GAME'S HEALTH BAR, timed the way the game times it.
 *
 * `left-*.png` and `right-*.png` are hand-drawn bars. Four states, from HEALTH()
 * in fills.mjs:
 *
 *   full >= 0.999      ok > 0.5      warn > 0.2      bad otherwise
 *
 * ── THE PART THAT IS ACTUALLY THE ANIMATION ──────────────────────────────────
 *
 * "The trailing bar: health snaps down, the ghost catches up behind it."
 *
 * THE HEALTH DOES NOT EASE. It is gone the instant the blow connects — the whole
 * point is that the RED TRAIL shows you how big the hit was, and easing the green
 * as well turns one readable event into two soft ones. An earlier version here
 * eased both and it read as mush.
 *
 * The trail retracts on the game's own clock, from Beat.cs:
 *
 *   HpPerSec = 24, MinDrain = 0.25s, MaxDrain = 3s
 *   Drain(lost) = clamp(lost / 24, 0.25, 3)
 *   Ease(t)     = 1 - (1 - t)^3        // ease-out cubic
 *
 * So a big hit genuinely takes longer to drain than a small one, and the ceiling
 * stops a huge hit stalling everything.
 *
 * ── THE HOT LEADING EDGE ─────────────────────────────────────────────────────
 *
 * Seven 1px columns glowing at the tip of the retracting trail, brightest at the
 * front. Each column is a 1px window with the shaped image pushed back out by the
 * same offset, so the drawing itself never moves and the hand-drawn outline stays
 * in register — the construction is the game's, in percentages so it survives the
 * bar being scaled to fit a phone.
 *
 * They stop as soon as they reach the health, and once the trail catches up there
 * are none left, which is why no separate "only while draining" test is needed.
 */

const HP_PER_SEC = 24
const MIN_DRAIN = 0.25
const MAX_DRAIN = 3
const GLOW = 7
/** Ease-out cubic, matching `1 - (1-t)^3`. */
const EASE = 'cubic-bezier(0.215, 0.61, 0.355, 1)'

type State = 'full' | 'ok' | 'warn' | 'bad'

const stateFor = (hp: number, max: number): State => {
  const p = max === 0 ? 0 : hp / max
  return p >= 0.999 ? 'full' : p > 0.5 ? 'ok' : p > 0.2 ? 'warn' : 'bad'
}

const drainSecs = (lost: number) =>
  Math.min(MAX_DRAIN, Math.max(MIN_DRAIN, lost / HP_PER_SEC))

export function GameBar({
  hp,
  ghost,
  max,
  side,
}: {
  hp: number
  /** Health before this line — where the trail starts from. */
  ghost: number
  max: number
  side: 'left' | 'right'
}) {
  /*
   * THE TRAIL IS ITS OWN LITTLE STATE MACHINE.
   *
   * A CSS transition needs a FROM and a TO. When a hit lands the trail must jump
   * to the old health with no transition at all, and only then retract to the new
   * one. Setting both in the same render gives the browser one value and no
   * animation, so the jump is committed first and the retraction is armed on the
   * next frame.
   */
  const [trail, setTrail] = useState(hp)
  const [easing, setEasing] = useState(false)
  const lastHp = useRef(hp)
  const raf = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (hp === lastHp.current) return
    const from = Math.max(ghost, hp)
    lastHp.current = hp

    // Frame one: sit at the old health, no transition.
    setEasing(false)
    setTrail(from)

    // Frame two: retract to the new health, eased.
    if (raf.current !== undefined) cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      raf.current = requestAnimationFrame(() => {
        setEasing(true)
        setTrail(hp)
      })
    })

    return () => {
      if (raf.current !== undefined) cancelAnimationFrame(raf.current)
    }
  }, [hp, ghost])

  const barW = side === 'left' ? 176 : 172
  const barH = side === 'left' ? 15 : 13

  const pct = (v: number) => Math.max(0, Math.min(100, max === 0 ? 0 : (100 * v) / max))
  const hpPct = pct(hp)
  const trailPct = Math.max(hpPct, pct(trail))

  /*
   * BOTH BARS EMPTY FROM THE OUTSIDE IN — the game's own comment: "hpLeft anchors
   * right while hpRight anchors left". The health that remains sits toward the
   * centre of the screen on both sides.
   */
  const trim = (p: number) =>
    side === 'left' ? `inset(0 0 0 ${100 - p}%)` : `inset(0 ${100 - p}% 0 0)`

  const secs = drainSecs(Math.max(0, trail - hp) || Math.max(0, ghost - hp))

  const layer: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    imageRendering: 'pixelated',
    display: 'block',
  }

  // The glowing tip of the trail, in bar pixels turned into percentages.
  const cols: { d0: number; k: number }[] = []
  if (trail > hp) {
    const gEdge = (barW * trail) / max
    const hEdge = (barW * hp) / max
    const topCol = Math.ceil(gEdge) - 1
    for (let k = 0; k < GLOW; k++) {
      const d0 = topCol - k
      if (d0 < 0) break
      if (d0 + 1 <= hEdge) break
      cols.push({ d0, k })
    }
  }

  const anchor = side === 'left' ? 'right' : 'left'

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: `${barW} / ${barH}` }}>
      {/* The trail, behind, retracting on the game's clock. */}
      <img
        src={`/game/bar/${side}-ghost.png`}
        alt=""
        style={{
          ...layer,
          clipPath: trim(trailPct),
          transition: easing ? `clip-path ${secs}s ${EASE}` : 'none',
        }}
      />

      {/* The hot leading edge, between the trail and the health. */}
      {cols.map(({ d0, k }) => (
        <div
          key={k}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            [anchor]: `${(d0 / barW) * 100}%`,
            width: `${(1 / barW) * 100}%`,
            overflow: 'hidden',
          }}
        >
          <img
            src={`/game/bar/${side}-hot${k}.png`}
            alt=""
            style={{
              position: 'absolute',
              top: 0,
              height: '100%',
              width: `${barW * 100}%`,
              [anchor]: `${-d0 * 100}%`,
              imageRendering: 'pixelated',
              display: 'block',
            }}
          />
        </div>
      ))}

      {/*
        The health, in front, and it SNAPS. No transition here on purpose — see
        the note at the top of this file.
      */}
      <img
        src={`/game/bar/${side}-${stateFor(hp, max)}.png`}
        alt=""
        style={{ ...layer, clipPath: trim(hpPct) }}
      />
    </div>
  )
}
