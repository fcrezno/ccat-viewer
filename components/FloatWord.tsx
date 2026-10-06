'use client'

import { BitmapText } from '@/components/BitmapText'
import { measure } from '@/lib/font'

/**
 * THE LINE THAT FLOATS OFF A CAT ON A CRIT, A WEAK HIT OR A MISS.
 *
 * JP, 2026-10-06: "also there used to be text on the cat if a attack critted or
 * missed". It was the renderer's `floater` (clanker-arena/render.mjs,
 * floaterLayers), rebuilt to its numbers in GAME PIXELS on the battle screen:
 *
 *   where    the struck cat's portrait — a miss over the cat that SWUNG, since
 *            the miss lines are written about the attacker — centred on its x,
 *            the block centred on y = top + 62% of the portrait; clamped so the
 *            widest line keeps 8 px off either edge of the screen
 *   wrap     200 px, at most three lines, 26 px apart, scale 1
 *   motion   rises 30 px, fast out and slowing (ease-out quad); full strength
 *            for the first 55%, then fading out — "so the word is actually read"
 *   trail    three afterimages, 0.045 / 0.09 / 0.14 of the way behind, at half,
 *            0.30 and 0.18 strength: "what makes it read as motion blur"
 *   wave     on a weak hit and a miss; a crit holds still
 *   colour   crit #e04a3a, weak #6a6a6a, miss #3a6ea5
 *
 * Plus a 1 px pale edge the renderer did not have: there the words sat on its
 * own flat portraits; here they cross real cat art of every colour.
 */
export type Float = { text: string; side: 'you' | 'foe'; kind: 'crit' | 'weak' | 'miss'; key: number }

const W = 480
const BUDGET = 200
const LINE_H = 26
const BASELINE = 18
const PORTRAIT = { you: 75, foe: 299, top: 64, size: 106 }
const INK = { crit: '#e04a3a', weak: '#6a6a6a', miss: '#3a6ea5' }
const TRAIL: [number, number][] = [[0.14, 0.18], [0.09, 0.3], [0.045, 0.5], [0, 1]]
const EDGE = 'drop-shadow(1px 0 0 #fdfdf8) drop-shadow(-1px 0 0 #fdfdf8) drop-shadow(0 1px 0 #fdfdf8) drop-shadow(0 -1px 0 #fdfdf8)'

function wrap(text: string): string[] {
  const words = text.split(' ').filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (cur && measure(next) > BUDGET) { lines.push(cur); cur = w } else cur = next
  }
  if (cur) lines.push(cur)
  return lines.slice(0, 3)
}

export function FloatWord({ float, secs }: { float: Float; secs: number }) {
  const lines = wrap(float.text)
  const widest = Math.max(...lines.map(l => measure(l)))
  const x0 = PORTRAIT[float.side] + PORTRAIT.size / 2
  const cx = Math.max(widest / 2 + 8, Math.min(W - widest / 2 - 8, x0))
  const y = PORTRAIT.top + Math.round(PORTRAIT.size * 0.62)
  const top = y - Math.round(((lines.length - 1) * LINE_H) / 2) - BASELINE
  const wave = float.kind !== 'crit'

  return (
    <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, width: W, height: 0, pointerEvents: 'none', zIndex: 4, filter: EDGE }}>
      {TRAIL.map(([lag, strength]) => (
        <div key={`${float.key}-${lag}`} style={{ position: 'absolute', left: 0, top: 0, width: W, opacity: strength }}>
          <div style={{ animation: `float-rise ${secs}s cubic-bezier(0.5, 1, 0.89, 1) ${lag * secs}s forwards` }}>
            {/* Hidden until its own start: a trail copy must not sit there before the word passes. */}
            <div style={{ opacity: 0, animation: `float-fade ${secs}s linear ${lag * secs}s forwards` }}>
              {lines.map((l, i) => (
                <div key={i} style={{ position: 'absolute', left: cx - measure(l) / 2, top: top + i * LINE_H, width: 'max-content' }}>
                  <BitmapText text={l} scale={1} color={INK[float.kind]} fx={wave ? 'wave' : false} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
