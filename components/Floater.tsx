'use client'

import { BitmapText } from '@/components/BitmapText'

/**
 * THE GAME'S DAMAGE FLOATER — floaterLayers() in clanker-arena/render.mjs.
 *
 *   rise      30 * (1 - (1 - t)^2)    "a pop rather than a drift"
 *   opacity   full until t = 0.55, then a straight fade to nothing
 *   ghosts    three afterimages at (lag, opacity) (0.14, 0.18) (0.09, 0.30)
 *             (0.045, 0.5), each the same word on the SAME curve at an earlier t,
 *             so the trail bunches up as the word slows
 *   secs      1.15, floatOut's default
 *
 * A crit does not wave; a weak hit or a miss wobbles (`wavy`).
 *
 * The curve is CSS: floater-rise runs on the ease-out-quad bezier and floater-fade
 * holds then falls. A ghost's RISE starts `lag` later, but its FADE runs on the
 * word's clock, as render.mjs multiplies the word's opacity, so all four are gone
 * together. floater-gate keeps a ghost hidden until its lag has passed — "one
 * whose lag has not elapsed is skipped, or the trail starts as a pile".
 *
 * `rise` is in page pixels: 30 game pixels times whatever scale the caller draws at.
 */
const SECS = 1.15
const GHOSTS: [lag: number, mul: number][] = [[0.14, 0.18], [0.09, 0.30], [0.045, 0.5]]

export function Floater({ text, color, scale = 2, wavy = false }: {
  text: string
  color: string
  scale?: number
  wavy?: boolean
}) {
  const layer = (lag: number, mul: number, key: string) => (
    <div key={key} style={{ position: 'absolute', left: 0, right: 0, top: 0, display: 'flex', justifyContent: 'center', opacity: mul }}>
      <div style={{
        ['--rise' as string]: `${-30 * scale}px`,
        opacity: 0,
        visibility: lag ? 'hidden' : 'visible',
        animation:
          `floater-rise ${SECS}s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${lag * SECS}s both, ` +
          `floater-fade ${SECS}s linear forwards` +
          (lag ? `, floater-gate ${lag * SECS}s steps(1, end) forwards` : ''),
      }}>
        <BitmapText text={text} scale={scale} color={color} fx={wavy ? 'wave' : false} />
      </div>
    </div>
  )

  return (
    <div aria-live="polite" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {GHOSTS.map(([lag, mul], i) => layer(lag, mul, 'g' + i))}
      {layer(0, 1, 'word')}
    </div>
  )
}
