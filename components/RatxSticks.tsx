'use client'

import { useEffect, useRef } from 'react'

/**
 * PHONE CONTROLS (JP, 2026-10-17: "we need to fix the mobile port controls"; a friend:
 * "Nipple.js ... for joysticks"). Two nipplejs thumbsticks that appear where the thumb
 * lands: the left moves the cat, the right turns it. FIRE sits between them.
 */
export function RatxSticks({ stick, onFire }: {
  stick: React.MutableRefObject<{ mx: number; my: number; turn: number }>
  onFire: () => void
}) {
  const left = useRef<HTMLDivElement>(null), right = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let alive = true
    const made: { destroy: () => void }[] = []
    import('nipplejs').then(({ default: nipple }) => {
      if (!alive || !left.current || !right.current) return
      const opts = { mode: 'dynamic' as const, color: '#ffd166', size: 110, restOpacity: 0.6 }
      const m = nipple.create({ ...opts, zone: left.current })
      m.on('move', (_e, d) => {
        const k = Math.min(1, d.distance / 50)
        stick.current.mx = Math.cos(d.angle.radian) * k
        stick.current.my = -Math.sin(d.angle.radian) * k            // up on screen = forward
        window.dispatchEvent(new Event('ratx-start'))
      })
      m.on('end', () => { stick.current.mx = 0; stick.current.my = 0 })
      const t = nipple.create({ ...opts, color: '#c8d6ff', zone: right.current, lockX: true })
      t.on('move', (_e, d) => { stick.current.turn = Math.cos(d.angle.radian) * Math.min(1, d.distance / 50) })
      t.on('end', () => { stick.current.turn = 0 })
      made.push(m, t)
    })
    return () => { alive = false; made.forEach(n => n.destroy()) }
  }, [stick])
  return (
    <div style={st.row}>
      <button style={st.pause} onClick={() => window.dispatchEvent(new Event('ratx-pause'))}>II PAUSE</button>
      <div ref={left} style={st.zone}>MOVE</div>
      <button style={st.fire} onTouchStart={e => { e.preventDefault(); onFire(); window.dispatchEvent(new Event('ratx-start')) }}>FIRE</button>
      <div ref={right} style={st.zone}>TURN</div>
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  row:  { display: 'grid', gridTemplateColumns: '1fr 96px 1fr', gap: 8, userSelect: 'none' },
  zone: { position: 'relative', height: 150, background: '#3a3a46', color: '#80808c', display: 'grid', placeItems: 'center', fontSize: 16, touchAction: 'none', boxShadow: 'inset 2px 2px 0 #5a5a68, inset -2px -2px 0 #1a1a22' },
  pause: { gridColumn: '1 / -1', padding: '8px 0', fontSize: 16, fontFamily: 'inherit', color: '#000', background: '#c0c0c0', border: 0, boxShadow: 'inset -1px -1px 0 #0a0a0a, inset 1px 1px 0 #fff, inset -2px -2px 0 #808080, inset 2px 2px 0 #dfdfdf' },
  fire: { background: '#c0392b', color: '#fff', border: 0, fontSize: 20, fontFamily: 'inherit', touchAction: 'none' },
}
