'use client'

import { useEffect, useState } from 'react'
import { PageTitle } from '@/components/PageTitle'
import { Ratxecutioner } from '@/components/Ratxecutioner'
import { guestId } from '@/lib/stable'

/**
 * RATXECUTIONER — the first-person rat hunt (components/Ratxecutioner).
 * JP, 2026-10-13: a Doom mod with cats, from the 7-Eleven game's Rat King's Lair.
 *
 * The status-bar face is THE PLAYER'S OWN CAT (JP: "just use their cat as the
 * pfp face"): the one last picked on the front page (Cradle keeps it in
 * cradle.lastcat.v1), or, with none, their guest cat — the same picture their
 * guest fights with (/api/fight: cat-art seeded by the guest code).
 */
export default function RatxecutionerPage() {
  const [face, setFace] = useState<string | null>(null)
  useEffect(() => {
    let img: string | null = null
    try { img = JSON.parse(window.localStorage.getItem('cradle.lastcat.v1') ?? 'null')?.image ?? null } catch {}
    setFace(img ?? `/api/cat-art?seed=${guestId()}`)
  }, [])
  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: 16, boxSizing: 'border-box' }}>
      <PageTitle text="RATXECUTIONER" />
      <section className="win98" data-title="RATXECUTIONER.EXE" style={{ background: '#c0c0c0', padding: 16, color: '#000' }}>
        {face && <Ratxecutioner face={face} />}
        <p style={{ margin: '10px 0 0', fontSize: 18 }}>
          The rats are loose in the lair. Gold nuggets give ammo and health. Every wave brings more rats.
        </p>
      </section>
      <a href="/" style={{ alignSelf: 'center', color: '#000080', fontSize: 18 }}>Back to the cats</a>
    </main>
  )
}
