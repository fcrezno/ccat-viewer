'use client'

import { useEffect, useState } from 'react'
import { Field } from '@/components/LadderScreen'

/**
 * THE FRONT PAGE'S BACKGROUND: the ladder's field, filling the window.
 *
 * JP, 2026-10-06: "also give the background in the main page; the same blue
 * checkerboard as the results screen", then "make the checkerboard change color
 * slowly and add the items from the yard". So it is LadderScreen's own `Field` —
 * the paper-blue checker, the yard's items drifting diagonally in parallax rows,
 * the sun and moon and every item cross-fading — sized to the window, with the
 * checker turning slowly through the colours (`hue`). One field, two screens:
 * a change to the ladder's shows here too.
 *
 * Its own clock, so only this redraws each frame; the menu over it does not.
 * Held still for anyone who asks the system for less motion.
 */
export function PageChecker() {
  const [ms, setMs] = useState(0)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const fit = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    fit()
    window.addEventListener('resize', fit)
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const t0 = performance.now()
    const tick = () => { setMs(performance.now() - t0); raf = requestAnimationFrame(tick) }
    if (!still) raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', fit) }
  }, [])

  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: -2, overflow: 'hidden', pointerEvents: 'none', background: '#d3dceb' }}>
      {size.w > 0 && <Field ms={ms} width={size.w} height={size.h} hue />}
    </div>
  )
}
