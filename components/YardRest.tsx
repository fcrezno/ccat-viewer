'use client'

import { useEffect, useState } from 'react'
import { restInYard, restLeft, resting, ACTION_MS } from '@/lib/stamina'

/**
 * A RESTING CAT, SEEN FROM THE YARD — and the yard working on its rest.
 *
 * JP, 2026-10-06: "after that they need to rest; which then go into the yard and
 * spending time with your cat can reduce the timer but not lower than half the
 * time". While this page is open and on screen, every second here takes one
 * more second off the rest, so the clock runs at double speed; the things done
 * with your cats (components/Yard → yardAction) take ACTION_MS off on top. The
 * floor in lib/stamina keeps it from ever going under half.
 *
 * Only while VISIBLE: a yard left open in a background tab is not time spent.
 */
const TICK_MS = 15_000

export function YardRest() {
  const [, tick] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') restInYard(TICK_MS)
      tick(n => n + 1)
    }, TICK_MS)
    const on = () => tick(n => n + 1)
    window.addEventListener('cradle-stamina', on)
    return () => { clearInterval(t); window.removeEventListener('cradle-stamina', on) }
  }, [])

  if (!mounted) return null
  const rest = resting()
  if (!rest.length) return null
  const next = rest[0]
  const atFloor = next.until <= next.floor + 1000

  return (
    <div role="status" style={st.box}>
      <p style={st.head}>
        {rest.length === 1 ? 'Your cat is resting' : `${rest.length} of your cats are resting`} · back in {restLeft(next.until)}
      </p>
      <p style={st.fine}>
        {atFloor
          ? 'That is as short as a rest goes — half of eight hours.'
          : `Time here runs double, and each visit with your cat takes ${ACTION_MS / 60000} minutes off — down to half the rest.`}
      </p>
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  box:  { margin: '0 auto 14px', maxWidth: 560, padding: '10px 14px', borderRadius: 10, background: 'rgba(30, 24, 52, 0.85)', border: '2px solid #6b4fa8', textAlign: 'center' },
  head: { margin: 0, color: '#e6dcff', fontSize: 15, fontWeight: 600 },
  fine: { margin: '4px 0 0', color: '#bfb3dd', fontSize: 12 },
}
