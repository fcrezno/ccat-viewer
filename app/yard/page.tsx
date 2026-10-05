'use client'

import { useEffect } from 'react'
import sdk from '@farcaster/miniapp-sdk'
import { Yard } from '@/components/Yard'
import { FxButton } from '@/components/FxButton'
import { useYardResidents } from '@/lib/useYardResidents'
import { PageBackdrop } from '@/components/PageBackdrop'
import { useLoadingHold } from '@/lib/loading'

/**
 * THE YARD — ITS OWN PAGE, AND THE ONLY PLACE IT LIVES.
 *
 * JP, 2026-09-29: "remove the yard and just make it its own page", keeping the
 * menu beside your fighter, whose THE YARD button leads here.
 *
 * It used to be a preview on the front page that SAVED its residents for this
 * page to read, so opening this URL cold showed nobody. Now the page builds its
 * own: lib/useYardResidents is that lookup, moved here from the front page —
 * your cats, the cats you have won, the cats of people you follow, and the demo
 * yard of real holders' cats when that comes to fewer than two. ?fid= still
 * shows anybody's yard in a browser.
 *
 * Laid out like the front page (the Cradle's column, header and panel) and made
 * easier to read: JP, same day, "make it more easier to see for viewers".
 */
export default function YardPage() {
  const { cats, busy } = useYardResidents()
  // The loading screen waits for the yard's residents (lib/loading.ts).
  useLoadingHold(busy && cats.length === 0)

  // Tell the Farcaster client the screen is ready, exactly as the other pages do.
  useEffect(() => { sdk.actions.ready().catch(() => {}) }, [])

  return (
    <main style={s.page}>
      <PageBackdrop />
      <header style={s.head}>
        <FxButton href="/" style={s.back} tone="grey" label="← THE GAME" />
        <h1 style={s.title}>THE YARD</h1>
      </header>
      <p style={s.sub}>Your cats and the cats of people you follow, getting on with it.</p>

      <section style={s.block}>
        {cats.length === 0 ? (
          busy ? (
            <p style={s.quiet}>reading the yard…</p>
          ) : (
            <div style={s.empty}>
              <p style={s.quiet}>Nobody here yet.</p>
              <p style={s.quiet}>
                The yard fills with your own cats and the cats of people you follow.
              </p>
              <FxButton href="/" style={s.button} tone="light" label="Open the game" />
            </div>
          )
        ) : (
          // The map says "Tap a cat." under itself; saying it here too was the same line twice.
          <Yard cats={cats} busy={busy} full />
        )}
      </section>

      <footer style={s.footer}>Clanker Cats — the full game is being built in s&amp;box</footer>
    </main>
  )
}

/* The front page's own values (components/Cradle.tsx s.page / s.block), a little brighter. */
const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh', color: '#f0f0f5',
    // 1120, not 560, so a desktop map is twice the size. JP's friend, 2026-10-05: "why not use up that available width on desktop? The cats look awesome; they would look better if it were bigger" — JP: "make it bigger for desktop". A phone is narrower than any of these, so phones do not change.
    padding: '22px 18px 40px', maxWidth: 1120, margin: '0 auto',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  // Two rows: a 120px button either side of the title left it 79px on a phone.
  head:    { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  back:    { alignSelf: 'flex-start', padding: '7px 12px', border: '1px solid #2c2c3c', borderRadius: 10, background: 'transparent' },
  title:   { fontSize: 30, letterSpacing: 1, margin: 0, textAlign: 'center', lineHeight: 1.1 },
  sub:     { color: '#c4c4d8', fontSize: 15, margin: 0, textAlign: 'center', lineHeight: 1.4 },
  // Less side padding than the front page's 16, so the map gets the width.
  block:   { background: '#12121c', border: '1px solid #21212f', borderRadius: 14, padding: '14px 10px' },
  quiet:   { color: '#c4c4d8', fontSize: 15, margin: 0, lineHeight: 1.6 },
  empty:   { display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start', margin: '10px 6px' },
  button: {
    marginTop: 6, padding: '9px 20px', borderRadius: 12, background: '#7c3aed',
    color: 'white', fontSize: 14, textDecoration: 'none',
  },
  footer:  { marginTop: 'auto', paddingTop: 24, textAlign: 'center', color: '#55556e', fontSize: 11, letterSpacing: 1 },
}
