'use client'

import { useEffect, useState } from 'react'
import sdk from '@farcaster/miniapp-sdk'
import { Yard, type YardCat } from '@/components/Yard'
import { residents, DEMO_KEY } from '@/lib/yardstore'

/**
 * THE YARD, IN FULL.
 *
 * JP: "you can just go enter the yard and then it'll go into more detail, and
 * then we'd have something like a Dwarf Fortress so you can see more detail about
 * the cats and their stats and everything as well."
 *
 * The front page shows a preview — the map, the furniture and three lines. This
 * is the same yard with nothing held back, plus a creature sheet for whichever
 * cat you tap.
 *
 * ── THE RESIDENTS COME FROM THE SAVED YARD ───────────────────────────────────
 *
 * Not fetched again. That list is the player's own cats — found through a wallet,
 * a connector and two collections — joined to the cats of everybody they follow,
 * and rebuilding it here would be a second copy of the hardest lookup in the app,
 * free to disagree with the first.
 *
 * `visit()` already wrote exactly that list, so this reads it. The honest cost is
 * that somebody who opens this URL having never opened the game sees nothing —
 * so they are told where to start rather than shown an empty pen.
 *
 * A ?fid= is still honoured for the same reason the Cradle honours one: it makes
 * any yard viewable by hand, which is how this gets looked at in a browser.
 */
export default function YardPage() {
  const [cats, setCats] = useState<YardCat[] | null>(null)

  useEffect(() => {
    // Tell the Farcaster client the screen is ready, exactly as the other pages do.
    sdk.actions.ready().catch(() => {})

    const saved = residents() as YardCat[]
    if (saved.length) { setCats(saved); return }

    /*
     * THE DEMO YARD COUNTS AS A YARD.
     *
     * It is stored under its own key so it can never be written over somebody's
     * real one — and that left a hole: a visitor who sees the demo on the front
     * page and taps ENTER arrived here and was told "Nobody here yet", because
     * this only ever looked at the real key. The link went nowhere for exactly
     * the audience the demo exists for.
     *
     * Its residents already carry `demo`, so the sheet keeps saying "somebody
     * owns this one" rather than claiming a follow that does not exist.
     */
    const shown = residents(DEMO_KEY) as YardCat[]
    if (shown.length) { setCats(shown); return }

    /*
     * NOTHING SAVED. Fall back to the follow graph, so a fresh browser with a
     * ?fid= is not simply told off. It cannot know which cats are the viewer's
     * own — that needs the wallet — so every cat here is somebody else's, and
     * `mine` is false rather than guessed.
     */
    const asked = Number(new URLSearchParams(window.location.search).get('fid'))
    let live = true
    ;(async () => {
      const fid = (await sdk.context.then(c => c?.user?.fid).catch(() => null))
        ?? (Number.isInteger(asked) && asked > 0 ? asked : null)
      if (!fid) { if (live) setCats([]); return }
      try {
        const r = await fetch(`/api/yard?fid=${fid}`)
        const d = await r.json()
        if (live) setCats(((d?.residents ?? []) as YardCat[]).map(c => ({ ...c, mine: false })))
      } catch {
        if (live) setCats([])
      }
    })()
    return () => { live = false }
  }, [])

  return (
    <main style={s.page}>
      <header style={s.head}>
        <a href="/" style={s.back}>← the game</a>
        <h1 style={s.title}>THE YARD</h1>
        <span style={{ width: 62 }} aria-hidden />
      </header>

      {cats === null ? (
        <p style={s.quiet}>reading the yard…</p>
      ) : cats.length === 0 ? (
        <div style={s.empty}>
          <p style={s.quiet}>Nobody here yet.</p>
          <p style={s.quiet}>
            The yard fills with your own cats and the cats of people you follow.
          </p>
          <a href="/" style={s.button}>Open the game</a>
        </div>
      ) : (
        <>
          <p style={s.quiet}>Tap a cat to read it.</p>
          <Yard cats={cats} full />
        </>
      )}

      <footer style={s.footer}>Clanker Cats — the full game is being built in s&amp;box</footer>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh', padding: '18px 16px 28px',
    maxWidth: 560, margin: '0 auto',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  head:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  back:  { color: '#7c3aed', fontSize: 11, letterSpacing: 1, textDecoration: 'none', width: 62, whiteSpace: 'nowrap' },
  title: { fontSize: 18, letterSpacing: 3, margin: 0, textAlign: 'center', flex: 1 },
  quiet: { color: '#63637d', fontSize: 12, margin: 0, lineHeight: 1.6 },
  empty: { display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start', marginTop: 20 },
  button: {
    marginTop: 6, padding: '12px 20px', borderRadius: 12, background: '#7c3aed',
    color: 'white', fontSize: 14, textDecoration: 'none',
  },
  footer: { marginTop: 'auto', paddingTop: 24, textAlign: 'center', color: '#3f3f55', fontSize: 10, letterSpacing: 1 },
}
