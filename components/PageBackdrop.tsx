'use client'

import { useEffect, useState } from 'react'

/**
 * THE TITLE SCREEN'S PAGE BEHIND ANY PAGE.
 *
 * JP, 2026-09-29: "add the same background look u added for the intro page".
 * The title screen (components/TitleScreen) and the fight (components/FightStage)
 * put one of the game's five zones behind the page, blurred and darkened, so the
 * page sits in the game's world instead of on flat navy. This is that, for the
 * pages that have no zone of their own: a random one per visit, picked after
 * mount so server and browser agree.
 *
 * The page it sits behind must not paint its own background, or it covers this.
 */
const ZONES = ['caves', 'forest', 'mountain', 'temple', 'town']

export function PageBackdrop({ zone: fixed }: { zone?: string } = {}) {
  const [zone, setZone] = useState<string | null>(fixed ?? null)
  useEffect(() => {
    if (!fixed) setZone(ZONES[Math.floor(Math.random() * ZONES.length)])
  }, [fixed])

  return (
    <>
      {zone && <div aria-hidden style={{ ...st.bg, backgroundImage: `url(/title/${zone}.jpg)` }} />}
      <div aria-hidden style={st.shade} />
    </>
  )
}

const st: Record<string, React.CSSProperties> = {
  bg:    { position: 'fixed', inset: -60, zIndex: -2, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(28px) saturate(1.15) brightness(0.55)', transform: 'scale(1.1)' },
  shade: { position: 'fixed', inset: 0, zIndex: -1, background: 'radial-gradient(ellipse at 50% 30%, rgba(10,10,20,0.15) 0%, rgba(10,10,20,0.55) 55%, rgba(10,10,20,0.9) 100%)' },
}
